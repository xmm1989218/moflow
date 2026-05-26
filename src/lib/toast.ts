import { useToastStore, type ToastType } from "../stores/toastStore";

function add(type: ToastType, message: string, duration?: number) {
  useToastStore.getState().addToast(type, message, duration);
}

export const toast = {
  success: (message: string, duration?: number) => add("success", message, duration),
  error: (message: string, duration?: number) => add("error", message, duration),
  info: (message: string, duration?: number) => add("info", message, duration),
};
