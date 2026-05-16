import { useEffect, useRef, useCallback } from "react";
import { useAppStore, type CloseDialogResult } from "../../stores/appStore";
import { resolveDialog, resolveAlert, resolveConfirm } from "../../lib/closeDialog";
import { t } from "../../i18n/core";
import { useT } from "../../i18n/useT";

const btnBase = "px-4 py-1.5 rounded-md text-[13px] font-medium cursor-pointer border transition-[background,border-color] duration-150";

export default function ConfirmCloseDialog() {
  const closeDialog = useAppStore((s) => s.closeDialog);
  const hideCloseDialog = useAppStore((s) => s.hideCloseDialog);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  useT();

  useEffect(() => {
    if (closeDialog.visible) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      const firstBtn = dialogRef.current?.querySelector<HTMLElement>("button");
      firstBtn?.focus();
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [closeDialog.visible]);

  const trapFocus = useCallback((e: KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = dialog.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, []);

  useEffect(() => {
    if (closeDialog.visible) {
      document.addEventListener("keydown", trapFocus);
      return () => document.removeEventListener("keydown", trapFocus);
    }
  }, [closeDialog.visible, trapFocus]);

  if (!closeDialog.visible) return null;

  const handleResult = (result: CloseDialogResult) => {
    hideCloseDialog();
    resolveDialog(result);
  };

  const handleAlertOk = () => {
    hideCloseDialog();
    resolveAlert();
  };

  const handleConfirmOk = () => {
    hideCloseDialog();
    resolveConfirm(true);
  };

  const handleConfirmCancel = () => {
    hideCloseDialog();
    resolveConfirm(false);
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      if (closeDialog.mode === "alert") {
        handleAlertOk();
      } else if (closeDialog.mode === "confirm") {
        handleConfirmCancel();
      } else {
        handleResult("cancel");
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      if (closeDialog.mode === "alert") {
        handleAlertOk();
      } else if (closeDialog.mode === "confirm") {
        handleConfirmCancel();
      } else {
        handleResult("cancel");
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40"
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={closeDialog.message}
        className="bg-ui-bg border border-ui-border rounded-xl p-6 min-w-[320px] max-w-[420px] shadow-dialog animate-dialog-in"
      >
        <div className="text-sm leading-relaxed text-ui-text mb-5">
          {closeDialog.message}
        </div>
        <div className="flex justify-end gap-2">
          {closeDialog.mode === "confirm-close" ? (
            <>
              <button className={`${btnBase} border-ui-border bg-transparent text-ui-text-secondary hover:bg-ui-bg-secondary`} onClick={() => handleResult("discard")}>
                {t("common.discard")}
              </button>
              <button className={`${btnBase} border-transparent bg-transparent text-ui-text-secondary hover:bg-ui-bg-secondary`} onClick={() => handleResult("cancel")}>
                {t("common.cancel")}
              </button>
              <button className={`${btnBase} border-ui-accent bg-ui-accent text-white hover:opacity-90`} onClick={() => handleResult("save")}>
                {t("common.save")}
              </button>
            </>
          ) : closeDialog.mode === "confirm" ? (
            <>
              <button className={`${btnBase} border-ui-border bg-transparent text-ui-text-secondary hover:bg-ui-bg-secondary`} onClick={handleConfirmCancel}>
                {t("common.cancel")}
              </button>
              <button className={`${btnBase} border-ui-accent bg-ui-accent text-white hover:opacity-90`} onClick={handleConfirmOk}>
                {t("common.confirm")}
              </button>
            </>
          ) : (
            <button className={`${btnBase} border-ui-accent bg-ui-accent text-white hover:opacity-90`} onClick={handleAlertOk}>
              {t("common.ok")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
