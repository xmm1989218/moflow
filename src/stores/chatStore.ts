import { create } from "zustand";
import { appendMessage, clearChat, removeChat, loadChat, clearTrace } from "../lib/chatPersistence";
import { appendInputHistory, loadInputHistory as loadInputHistoryFromFile } from "../lib/inputHistory";
import type { ToolCall, SubAgentExecution } from "../lib/types";

export const COMPACT_TAIL_TURNS = 2;

export interface Message {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp: number;
  promptTokens?: number;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  toolName?: string;
  reasoningContent?: string;
  isCompactSummary?: boolean;
}

const emptyMessages: Message[] = [];

interface ChatState {
  messagesMap: Record<string, Message[]>;
  chatLoadedMap: Record<string, boolean>;
  contextMap: Record<string, Message[]>;
  contextTokensMap: Record<string, number>;
  totalTokensMap: Record<string, number>;
  costMap: Record<string, number>;
  cachedTokensMap: Record<string, number>;
  isStreaming: boolean;
  abortController: AbortController | null;
  streamingContentMap: Record<string, string>;
  inputHistoryMap: Record<string, string[]>;
  activeSubAgentView: string | null;
  subAgentResultsMap: Record<string, SubAgentExecution>;

  getContext: (tabId: string) => Message[];
  addMessage: (tabId: string, msg: Omit<Message, "id" | "timestamp">) => Message;
  appendStreamingContent: (tabId: string, chunk: string) => void;
  clearStreamingContent: (tabId: string) => void;
  recordUsage: (tabId: string, promptTokens: number, completionTokens: number, cost: number, cachedTokens?: number) => void;
  recordStandaloneUsage: (tabId: string, promptTokens: number, completionTokens: number, cost: number, cachedTokens?: number) => void;
  setStreaming: (v: boolean) => void;
  setAbortController: (ctrl: AbortController | null) => void;
  stopGeneration: () => void;
  clearMessages: (tabId: string) => void;
  cleanupIncompleteToolCalls: (tabId: string) => void;
  loadChatHistory: (tabId: string) => Promise<void>;
  deleteChat: (tabId: string) => void;
  appendInputHistory: (tabId: string, text: string) => void;
  loadInputHistory: (tabId: string) => Promise<void>;
  setActiveSubAgentView: (taskId: string | null) => void;
  addSubAgentResult: (taskId: string, execution: SubAgentExecution) => void;
  clearSubAgentViews: (chatKey: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messagesMap: {},
  chatLoadedMap: {},
  contextMap: {},
  contextTokensMap: {},
  totalTokensMap: {},
  costMap: {},
  cachedTokensMap: {},
  isStreaming: false,
  abortController: null,
  streamingContentMap: {},
  inputHistoryMap: {},
  activeSubAgentView: null,
  subAgentResultsMap: {},

  getContext: (tabId: string) => {
    const existing = get().contextMap[tabId];
    if (existing) return existing;

    const msgs = get().messagesMap[tabId] ?? [];
    if (msgs.length === 0) return emptyMessages;

    let compactIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === "user" && msgs[i].content === "/compact") {
        compactIdx = i;
        break;
      }
    }

    if (compactIdx === -1) {
      const lastAssistant = [...msgs].reverse().find(
        (m) => m.role === "assistant" && m.promptTokens !== undefined
      );
      set((state) => ({
        contextMap: { ...state.contextMap, [tabId]: msgs },
        contextTokensMap: {
          ...state.contextTokensMap,
          [tabId]: lastAssistant?.promptTokens ?? 0,
        },
      }));
      return msgs;
    }

    let tailStart = compactIdx;
    let turnCount = 0;
    for (let i = compactIdx - 1; i >= 0 && turnCount < COMPACT_TAIL_TURNS; i--) {
      if (msgs[i].role === "user") {
        turnCount++;
        tailStart = i;
      }
    }

    const tailMsgs = msgs.slice(tailStart, compactIdx);
    const afterCompact = msgs.slice(compactIdx + 1);
    const contextMsgs = [...tailMsgs, ...afterCompact];

    const lastAssistant = [...contextMsgs].reverse().find(
      (m) => m.role === "assistant" && m.promptTokens !== undefined
    );

    set((state) => ({
      contextMap: { ...state.contextMap, [tabId]: contextMsgs },
      contextTokensMap: {
        ...state.contextTokensMap,
        [tabId]: lastAssistant?.promptTokens ?? 0,
      },
    }));

    return contextMsgs;
  },

  addMessage: (tabId, msg) => {
    const fullMsg: Message = {
      ...msg,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    set((state) => {
      const existing = state.messagesMap[tabId] ?? [];
      const newContextMap = { ...state.contextMap };
      if (msg.role === "user" || msg.role === "tool" || msg.role === "assistant") {
        const ctx = newContextMap[tabId];
        if (ctx) {
          newContextMap[tabId] = [...ctx, fullMsg];
        }
      }
      return {
        messagesMap: {
          ...state.messagesMap,
          [tabId]: [...existing, fullMsg],
        },
        contextMap: newContextMap,
      };
    });
    return fullMsg;
  },

  appendStreamingContent: (tabId, chunk) =>
    set((state) => ({
      streamingContentMap: {
        ...state.streamingContentMap,
        [tabId]: (state.streamingContentMap[tabId] ?? "") + chunk,
      },
    })),

  clearStreamingContent: (tabId) =>
    set((state) => {
      const newMap = { ...state.streamingContentMap };
      delete newMap[tabId];
      return { streamingContentMap: newMap };
    }),

  recordUsage: (tabId, promptTokens, completionTokens, cost, cachedTokens) =>
    set((state) => ({
      contextTokensMap: {
        ...state.contextTokensMap,
        [tabId]: promptTokens,
      },
      totalTokensMap: {
        ...state.totalTokensMap,
        [tabId]: (state.totalTokensMap[tabId] ?? 0) + promptTokens + completionTokens,
      },
      costMap: {
        ...state.costMap,
        [tabId]: (state.costMap[tabId] ?? 0) + cost,
      },
      cachedTokensMap: cachedTokens != null ? {
        ...state.cachedTokensMap,
        [tabId]: (state.cachedTokensMap[tabId] ?? 0) + cachedTokens,
      } : state.cachedTokensMap,
    })),

  recordStandaloneUsage: (tabId, promptTokens, completionTokens, cost, cachedTokens) =>
    set((state) => ({
      totalTokensMap: {
        ...state.totalTokensMap,
        [tabId]: (state.totalTokensMap[tabId] ?? 0) + promptTokens + completionTokens,
      },
      costMap: {
        ...state.costMap,
        [tabId]: (state.costMap[tabId] ?? 0) + cost,
      },
      cachedTokensMap: cachedTokens != null ? {
        ...state.cachedTokensMap,
        [tabId]: (state.cachedTokensMap[tabId] ?? 0) + cachedTokens,
      } : state.cachedTokensMap,
    })),

  setStreaming: (isStreaming) => set({ isStreaming }),

  setAbortController: (ctrl) => set({ abortController: ctrl }),

  stopGeneration: () => {
    const ctrl = get().abortController;
    if (ctrl) {
      ctrl.abort();
    }
    set({ abortController: null });
  },

  clearMessages: (tabId) => {
    clearChat(tabId);
    clearTrace(tabId);
    set((state) => {
      const newSubAgentMap = { ...state.subAgentResultsMap };
      for (const [id, exec] of Object.entries(newSubAgentMap)) {
        if (exec.parentChatKey === tabId) delete newSubAgentMap[id];
      }
      return {
        messagesMap: {
          ...state.messagesMap,
          [tabId]: [],
        },
        contextMap: {
          ...state.contextMap,
          [tabId]: [],
        },
        contextTokensMap: {
          ...state.contextTokensMap,
          [tabId]: 0,
        },
        totalTokensMap: {
          ...state.totalTokensMap,
          [tabId]: 0,
        },
        costMap: {
          ...state.costMap,
          [tabId]: 0,
        },
        cachedTokensMap: {
          ...state.cachedTokensMap,
          [tabId]: 0,
        },
        subAgentResultsMap: newSubAgentMap,
        activeSubAgentView: state.activeSubAgentView && !newSubAgentMap[state.activeSubAgentView] ? null : state.activeSubAgentView,
      };
    });
  },

  cleanupIncompleteToolCalls: (tabId) => {
    const msgs = get().messagesMap[tabId] ?? [];
    if (msgs.length === 0) return;

    const toolResultIds = new Set(
      msgs.filter((m) => m.role === "tool").map((m) => m.toolCallId)
    );

    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === "assistant" && msgs[i].toolCalls?.length) {
        const missing = msgs[i].toolCalls!.filter((tc) => !toolResultIds.has(tc.id));
        if (missing.length > 0) {
          for (const tc of missing) {
            const toolMsg = get().addMessage(tabId, {
              role: "tool",
              content: "Tool call interrupted",
              toolCallId: tc.id,
              toolName: tc.name,
            });
            appendMessage(tabId, toolMsg);
          }
        }
        break;
      }
    }
  },

  loadChatHistory: async (tabId) => {
    set((state) => ({
      chatLoadedMap: { ...state.chatLoadedMap, [tabId]: false },
    }));
    const msgs = await loadChat(tabId);
    if (msgs.length > 0) {
      set((state) => ({
        messagesMap: {
          ...state.messagesMap,
          [tabId]: msgs,
        },
        chatLoadedMap: { ...state.chatLoadedMap, [tabId]: true },
      }));
      get().getContext(tabId);
      get().cleanupIncompleteToolCalls(tabId);
    } else {
      set((state) => ({
        chatLoadedMap: { ...state.chatLoadedMap, [tabId]: true },
      }));
    }
    get().loadInputHistory(tabId);
  },

  deleteChat: (tabId) => {
    removeChat(tabId);
    set((state) => {
      const newMessages = { ...state.messagesMap };
      delete newMessages[tabId];
      const newChatLoaded = { ...state.chatLoadedMap };
      delete newChatLoaded[tabId];
      const newContext = { ...state.contextMap };
      delete newContext[tabId];
      const newContextTokens = { ...state.contextTokensMap };
      delete newContextTokens[tabId];
      const newTotalTokens = { ...state.totalTokensMap };
      delete newTotalTokens[tabId];
      const newCost = { ...state.costMap };
      delete newCost[tabId];
      const newCachedTokens = { ...state.cachedTokensMap };
      delete newCachedTokens[tabId];
      const newInputHistory = { ...state.inputHistoryMap };
      delete newInputHistory[tabId];
      const newSubAgentMap = { ...state.subAgentResultsMap };
      for (const [id, exec] of Object.entries(newSubAgentMap)) {
        if (exec.parentChatKey === tabId) delete newSubAgentMap[id];
      }
      return {
        messagesMap: newMessages,
        chatLoadedMap: newChatLoaded,
        contextMap: newContext,
        contextTokensMap: newContextTokens,
        totalTokensMap: newTotalTokens,
        costMap: newCost,
        cachedTokensMap: newCachedTokens,
        inputHistoryMap: newInputHistory,
        subAgentResultsMap: newSubAgentMap,
        activeSubAgentView: state.activeSubAgentView && !newSubAgentMap[state.activeSubAgentView] ? null : state.activeSubAgentView,
      };
    });
  },

  appendInputHistory: (tabId, text) => {
    if (!text.trim()) return;
    set((state) => {
      const history = state.inputHistoryMap[tabId] ?? [];
      if (history.length > 0 && history[0] === text) return state;
      return {
        inputHistoryMap: {
          ...state.inputHistoryMap,
          [tabId]: [text, ...history],
        },
      };
    });
    appendInputHistory(tabId, text);
  },

  loadInputHistory: async (tabId) => {
    const history = await loadInputHistoryFromFile(tabId);
    set((state) => ({
      inputHistoryMap: { ...state.inputHistoryMap, [tabId]: history },
    }));
  },

  setActiveSubAgentView: (taskId) => set({ activeSubAgentView: taskId }),

  addSubAgentResult: (taskId, execution) =>
    set((state) => ({
      subAgentResultsMap: { ...state.subAgentResultsMap, [taskId]: execution },
    })),

  clearSubAgentViews: (chatKey) =>
    set((state) => {
      const newMap = { ...state.subAgentResultsMap };
      for (const [id, exec] of Object.entries(newMap)) {
        if (exec.parentChatKey === chatKey) delete newMap[id];
      }
      return {
        subAgentResultsMap: newMap,
        activeSubAgentView: state.activeSubAgentView && !newMap[state.activeSubAgentView] ? null : state.activeSubAgentView,
      };
    }),
}));
