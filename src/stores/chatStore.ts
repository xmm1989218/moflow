import { create } from "zustand";
import type { ChatUsage } from "../lib/modelInfo";

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
  addMessage: (tabId: string, msg: Omit<Message, "id" | "timestamp">) => void;
  appendToLastMessage: (tabId: string, chunk: string) => void;
  addUsage: (tabId: string, usage: ChatUsage) => void;
  resetUsage: (tabId: string) => void;
  setStreaming: (v: boolean) => void;
  setAbortController: (ctrl: AbortController | null) => void;
  stopGeneration: () => void;
  clearMessages: (tabId: string) => void;
  compactMessages: (tabId: string, summary: string) => void;
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

  addMessage: (tabId, msg) =>
    set((state) => {
      const existing = state.messagesMap[tabId] ?? [];
      return {
        messagesMap: {
          ...state.messagesMap,
          [tabId]: [
            ...existing,
            {
              ...msg,
              id: crypto.randomUUID(),
              timestamp: Date.now(),
            },
          ],
        },
      };
    }),

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

  clearMessages: (tabId) =>
    set((state) => ({
      messagesMap: {
        ...state.messagesMap,
        [tabId]: [],
      },
      usageMap: {
        ...state.usageMap,
        [tabId]: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      },
    })),

  compactMessages: (tabId, summary) =>
    set((state) => ({
      messagesMap: {
        ...state.messagesMap,
        [tabId]: [
          {
            id: crypto.randomUUID(),
            role: "assistant" as const,
            content: summary,
            timestamp: Date.now(),
          },
        ],
      },
    })),
}));
