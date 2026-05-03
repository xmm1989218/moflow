import { useAppStore, type CloseDialogResult } from "../stores/appStore";

let dialogResolver: ((value: CloseDialogResult) => void) | null = null;
let alertResolver: (() => void) | null = null;

export function showConfirmCloseDialog(message: string): Promise<CloseDialogResult> {
  return new Promise((resolve) => {
    dialogResolver = resolve;
    useAppStore.getState().showCloseDialog(message);
  });
}

export function showAlertDialog(message: string): Promise<void> {
  return new Promise((resolve) => {
    alertResolver = resolve;
    useAppStore.getState().showAlertDialog(message);
  });
}

export function resolveDialog(result: CloseDialogResult) {
  dialogResolver?.(result);
  dialogResolver = null;
}

export function resolveAlert() {
  alertResolver?.();
  alertResolver = null;
}
