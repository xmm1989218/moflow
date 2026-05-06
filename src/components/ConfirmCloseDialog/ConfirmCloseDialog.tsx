import { useAppStore, type CloseDialogResult } from "../../stores/appStore";
import { resolveDialog, resolveAlert } from "../../lib/closeDialog";
import "./ConfirmCloseDialog.css";

const isZh = navigator.language.startsWith("zh");
const t = (zh: string, en: string) => (isZh ? zh : en);

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
    <div className="moflow-dialog-overlay" onClick={handleOverlayClick} onKeyDown={handleKeyDown}>
      <div className="moflow-dialog">
        <div className="moflow-dialog-message">
          {closeDialog.message}
        </div>
        <div className="moflow-dialog-buttons">
          {closeDialog.mode === "confirm-close" ? (
            <>
              <button className="moflow-dialog-btn moflow-dialog-btn-secondary" onClick={() => handleResult("discard")}>
                {t("不保存", "Discard")}
              </button>
              <button className="moflow-dialog-btn moflow-dialog-btn-tertiary" onClick={() => handleResult("cancel")}>
                {t("取消", "Cancel")}
              </button>
              <button className="moflow-dialog-btn moflow-dialog-btn-primary" onClick={() => handleResult("save")}>
                {t("保存", "Save")}
              </button>
            </>
          ) : (
            <button className="moflow-dialog-btn moflow-dialog-btn-primary" onClick={handleAlertOk}>
              {t("确认", "OK")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
