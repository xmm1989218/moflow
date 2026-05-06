import { create } from "zustand";
import { appendMessage, clearChat, removeChat, loadChat } from "../lib/chatPersistence";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  promptTokens?: number;
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

  getMessages: (tabId: string) => Message[];
  getContext: (tabId: string) => Message[];
  addMessage: (tabId: string, msg: Omit<Message, "id" | "timestamp">) => Message;
  appendToLastMessage: (tabId: string, chunk: string) => void;
  recordUsage: (tabId: string, promptTokens: number, completionTokens: number, cost: number) => void;
  recordStandaloneUsage: (tabId: string, promptTokens: number, completionTokens: number, cost: number) => void;
  setStreaming: (v: boolean) => void;
  setAbortController: (ctrl: AbortController | null) => void;
  stopGeneration: () => void;
  clearMessages: (tabId: string) => void;
  clearContext: (tabId: string) => void;
  flushAssistantMessage: (tabId: string) => Promise<void>;
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

  getMessages: (tabId: string) => {
    return get().messagesMap[tabId] || emptyMessages;
  },

  getContext: (tabId: string) => {
    const existing = get().contextMap[tabId];
    if (existing) return existing;

    const msgs = get().messagesMap[tabId] ?? [];
    if (msgs.length === 0) return emptyMessages;

    let contextStart = 0;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === "user" && msgs[i].content === "/compact") {
        contextStart = i + 1;
        break;
      }
    }

    const contextMsgs = msgs.slice(contextStart).filter(
      (m) => !(m.role === "user" && m.content === "/compact")
    );

    const lastAssistant = [...msgs].reverse().find(
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
      if (msg.role === "user") {
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

  appendToLastMessage: (tabId, chunk) =>
    set((state) => {
      const msgs = [...(state.messagesMap[tabId] ?? [])];
      const last = msgs[msgs.length - 1];
      if (last && last.role === "assistant") {
        msgs[msgs.length - 1] = { ...last, content: last.content + chunk };
      }
      return {
        messagesMap: {
          ...state.messagesMap,
          [tabId]: msgs,
        },
      };
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
    set({ isStreaming: false, abortController: null });
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

  flushAssistantMessage: async (tabId) => {
    const msgs = get().messagesMap[tabId];
    if (!msgs || msgs.length === 0) return;
    const last = msgs[msgs.length - 1];
    if (last.role === "assistant") {
      const promptTokens = get().contextTokensMap[tabId] ?? 0;
      const msgWithTokens = promptTokens > 0 ? { ...last, promptTokens } : last;
      await appendMessage(tabId, msgWithTokens);

      const ctx = get().contextMap[tabId];
      if (ctx) {
        set((state) => ({
          contextMap: {
            ...state.contextMap,
            [tabId]: [...ctx, msgWithTokens],
          },
        }));
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
