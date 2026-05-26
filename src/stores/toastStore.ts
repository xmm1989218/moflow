import { create } from "zustand";

export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration: number;
  createdAt: number;
}

interface ToastState {
  toasts: Toast[];
  addToast: (type: ToastType, message: string, duration?: number) => void;
  removeToast: (id: string) => void;
}

const MAX_TOASTS = 3;

let nextId = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (type, message, duration) => {
    const d = duration ?? (type === "error" ? 5000 : 3000);
    const id = `toast-${++nextId}`;
    set((state) => {
      const next = [...state.toasts, { id, type, message, duration: d, createdAt: Date.now() }];
      return { toasts: next.length > MAX_TOASTS ? next.slice(-MAX_TOASTS) : next };
    });
  },

  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));
