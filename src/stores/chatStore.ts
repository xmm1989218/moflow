import { create } from "zustand";
import type { ChatUsage } from "../lib/modelInfo";
import { appendMessage, rewriteMessages, removeChat, loadChat } from "../lib/chatPersistence";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

const emptyMessages: Message[] = [];
const emptyUsage: ChatUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

interface ChatState {
  messagesMap: Record<string, Message[]>;
  usageMap: Record<string, ChatUsage>;
  isStreaming: boolean;
  abortController: AbortController | null;

  getMessages: (tabId: string) => Message[];
  getUsage: (tabId: string) => ChatUsage;
  addMessage: (tabId: string, msg: Omit<Message, "id" | "timestamp">) => Message;
  appendToLastMessage: (tabId: string, chunk: string) => void;
  addUsage: (tabId: string, usage: ChatUsage) => void;
  resetUsage: (tabId: string) => void;
  setStreaming: (v: boolean) => void;
  setAbortController: (ctrl: AbortController | null) => void;
  stopGeneration: () => void;
  clearMessages: (tabId: string) => void;
  compactMessages: (tabId: string, summary: string) => void;
  flushAssistantMessage: (tabId: string) => Promise<void>;
  loadChatHistory: (tabId: string) => Promise<void>;
  deleteChat: (tabId: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messagesMap: {},
  usageMap: {},
  isStreaming: false,
  abortController: null,

  getMessages: (tabId: string) => {
    return get().messagesMap[tabId] || emptyMessages;
  },

  getUsage: (tabId: string) => {
    return get().usageMap[tabId] || emptyUsage;
  },

  addMessage: (tabId, msg) => {
    const fullMsg: Message = {
      ...msg,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    set((state) => {
      const existing = state.messagesMap[tabId] ?? [];
      return {
        messagesMap: {
          ...state.messagesMap,
          [tabId]: [...existing, fullMsg],
        },
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

  addUsage: (tabId, usage) =>
    set((state) => {
      const prev = state.usageMap[tabId] || emptyUsage;
      return {
        usageMap: {
          ...state.usageMap,
          [tabId]: {
            promptTokens: prev.promptTokens + usage.promptTokens,
            completionTokens: prev.completionTokens + usage.completionTokens,
            totalTokens: prev.totalTokens + usage.totalTokens,
          },
        },
      };
    }),

  resetUsage: (tabId) =>
    set((state) => ({
      usageMap: {
        ...state.usageMap,
        [tabId]: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
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
    removeChat(tabId);
    set((state) => ({
      messagesMap: {
        ...state.messagesMap,
        [tabId]: [],
      },
      usageMap: {
        ...state.usageMap,
        [tabId]: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      },
    }));
  },

  compactMessages: (tabId, summary) => {
    const summaryMsg: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: summary,
      timestamp: Date.now(),
    };
    rewriteMessages(tabId, [summaryMsg]);
    set((state) => {
      const existing = state.messagesMap[tabId] ?? [];
      return {
        messagesMap: {
          ...state.messagesMap,
          [tabId]: [...existing, summaryMsg],
        },
      };
    });
  },

  flushAssistantMessage: async (tabId) => {
    const msgs = get().messagesMap[tabId];
    if (!msgs || msgs.length === 0) return;
    const last = msgs[msgs.length - 1];
    if (last.role === "assistant") {
      await appendMessage(tabId, last);
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
      const newUsage = { ...state.usageMap };
      delete newUsage[tabId];
      return {
        messagesMap: newMessages,
        usageMap: newUsage,
      };
    });
  },
}));
