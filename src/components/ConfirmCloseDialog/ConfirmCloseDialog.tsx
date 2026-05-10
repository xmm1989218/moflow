import { useAppStore, type CloseDialogResult } from "../../stores/appStore";
import { resolveDialog, resolveAlert } from "../../lib/closeDialog";
import { t } from "../../lib/i18n";

const btnBase = "px-4 py-1.5 rounded-md text-[13px] font-medium cursor-pointer border transition-[background,border-color] duration-150";

export default function ConfirmCloseDialog() {
  const closeDialog = useAppStore((s) => s.closeDialog);
  const hideCloseDialog = useAppStore((s) => s.hideCloseDialog);

  if (!closeDialog.visible) return null;

  const handleResult = (result: CloseDialogResult) => {
    hideCloseDialog();
    resolveDialog(result);
  };

  const handleAlertOk = () => {
    hideCloseDialog();
    resolveAlert();
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      if (closeDialog.mode === "alert") {
        handleAlertOk();
      } else {
        handleResult("cancel");
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      if (closeDialog.mode === "alert") {
        handleAlertOk();
      } else {
        handleResult("cancel");
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40" onClick={handleOverlayClick} onKeyDown={handleKeyDown}>
      <div className="bg-ui-bg border border-ui-border rounded-xl p-6 min-w-[320px] max-w-[420px] shadow-dialog animate-dialog-in">
        <div className="text-sm leading-relaxed text-ui-text mb-5">
          {closeDialog.message}
        </div>
        <div className="flex justify-end gap-2">
          {closeDialog.mode === "confirm-close" ? (
            <>
              <button className={`${btnBase} border-ui-border bg-transparent text-ui-text-secondary hover:bg-ui-bg-secondary`} onClick={() => handleResult("discard")}>
                {t("不保存", "Discard")}
              </button>
              <button className={`${btnBase} border-transparent bg-transparent text-ui-text-secondary hover:bg-ui-bg-secondary`} onClick={() => handleResult("cancel")}>
                {t("取消", "Cancel")}
              </button>
              <button className={`${btnBase} border-ui-accent bg-ui-accent text-white hover:opacity-90`} onClick={() => handleResult("save")}>
                {t("保存", "Save")}
              </button>
            </>
          ) : (
            <button className={`${btnBase} border-ui-accent bg-ui-accent text-white hover:opacity-90`} onClick={handleAlertOk}>
              {t("确认", "OK")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
