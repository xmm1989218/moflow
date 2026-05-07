import { create } from "zustand";
import { appendMessage, clearChat, removeChat, loadChat } from "../lib/chatPersistence";
import type { ToolCall } from "../lib/types";

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
  contextMap: Record<string, Message[]>;
  contextTokensMap: Record<string, number>;
  completionTokensMap: Record<string, number>;
  totalTokensMap: Record<string, number>;
  costMap: Record<string, number>;
  isStreaming: boolean;
  abortController: AbortController | null;
  streamingContentMap: Record<string, string>;

  getMessages: (tabId: string) => Message[];
  getContext: (tabId: string) => Message[];
  getStreamingContent: (tabId: string) => string;
  addMessage: (tabId: string, msg: Omit<Message, "id" | "timestamp">) => Message;
  appendStreamingContent: (tabId: string, chunk: string) => void;
  clearStreamingContent: (tabId: string) => void;
  recordUsage: (tabId: string, promptTokens: number, completionTokens: number, cost: number) => void;
  recordStandaloneUsage: (tabId: string, promptTokens: number, completionTokens: number, cost: number) => void;
  setStreaming: (v: boolean) => void;
  setAbortController: (ctrl: AbortController | null) => void;
  stopGeneration: () => void;
  clearMessages: (tabId: string) => void;
  clearContext: (tabId: string) => void;
  cleanupIncompleteToolCalls: (tabId: string) => void;
  loadChatHistory: (tabId: string) => Promise<void>;
  deleteChat: (tabId: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messagesMap: {},
  contextMap: {},
  contextTokensMap: {},
  completionTokensMap: {},
  totalTokensMap: {},
  costMap: {},
  isStreaming: false,
  abortController: null,
  streamingContentMap: {},

  getMessages: (tabId: string) => {
    return get().messagesMap[tabId] || emptyMessages;
  },

  getStreamingContent: (tabId: string) => {
    return get().streamingContentMap[tabId] ?? "";
  },

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

  recordUsage: (tabId, promptTokens, completionTokens, cost) =>
    set((state) => ({
      contextTokensMap: {
        ...state.contextTokensMap,
        [tabId]: promptTokens,
      },
      completionTokensMap: {
        ...state.completionTokensMap,
        [tabId]: (state.completionTokensMap[tabId] ?? 0) + completionTokens,
      },
      totalTokensMap: {
        ...state.totalTokensMap,
        [tabId]: (state.totalTokensMap[tabId] ?? 0) + promptTokens + completionTokens,
      },
      costMap: {
        ...state.costMap,
        [tabId]: (state.costMap[tabId] ?? 0) + cost,
      },
    })),

  recordStandaloneUsage: (tabId, promptTokens, completionTokens, cost) =>
    set((state) => ({
      totalTokensMap: {
        ...state.totalTokensMap,
        [tabId]: (state.totalTokensMap[tabId] ?? 0) + promptTokens + completionTokens,
      },
      costMap: {
        ...state.costMap,
        [tabId]: (state.costMap[tabId] ?? 0) + cost,
      },
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
    set((state) => ({
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
      completionTokensMap: {
        ...state.completionTokensMap,
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
    }));
  },

  clearContext: (tabId) =>
    set((state) => ({
      contextMap: {
        ...state.contextMap,
        [tabId]: [],
      },
    })),

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
    const msgs = await loadChat(tabId);
    if (msgs.length > 0) {
      set((state) => ({
        messagesMap: {
          ...state.messagesMap,
          [tabId]: msgs,
        },
      }));
      get().getContext(tabId);
      get().cleanupIncompleteToolCalls(tabId);
    }
  },

  deleteChat: (tabId) => {
    removeChat(tabId);
    set((state) => {
      const newMessages = { ...state.messagesMap };
      delete newMessages[tabId];
      const newContext = { ...state.contextMap };
      delete newContext[tabId];
      const newContextTokens = { ...state.contextTokensMap };
      delete newContextTokens[tabId];
      const newCompletionTokens = { ...state.completionTokensMap };
      delete newCompletionTokens[tabId];
      const newTotalTokens = { ...state.totalTokensMap };
      delete newTotalTokens[tabId];
      const newCost = { ...state.costMap };
      delete newCost[tabId];
      return {
        messagesMap: newMessages,
        contextMap: newContext,
        contextTokensMap: newContextTokens,
        completionTokensMap: newCompletionTokens,
        totalTokensMap: newTotalTokens,
        costMap: newCost,
      };
    });
  },
}));
