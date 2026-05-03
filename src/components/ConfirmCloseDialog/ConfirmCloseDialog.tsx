import { useAppStore, type CloseDialogResult } from "../../stores/appStore";
import "./ConfirmCloseDialog.css";

let dialogResolver: ((value: CloseDialogResult) => void) | null = null;

export function showConfirmCloseDialog(message: string): Promise<CloseDialogResult> {
  return new Promise((resolve) => {
    dialogResolver = resolve;
    useAppStore.getState().showCloseDialog(message);
  });
}

export default function ConfirmCloseDialog() {
  const closeDialog = useAppStore((s) => s.closeDialog);
  const hideCloseDialog = useAppStore((s) => s.hideCloseDialog);

  if (!closeDialog.visible) return null;

  const handleResult = (result: CloseDialogResult) => {
    hideCloseDialog();
    dialogResolver?.(result);
    dialogResolver = null;
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleResult("cancel");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      handleResult("cancel");
    }
  };

  return (
    <div className="moflow-dialog-overlay" onClick={handleOverlayClick} onKeyDown={handleKeyDown}>
      <div className="moflow-dialog">
        <div className="moflow-dialog-message">
          {closeDialog.message}
        </div>
        <div className="moflow-dialog-buttons">
          <button className="moflow-dialog-btn moflow-dialog-btn-secondary" onClick={() => handleResult("discard")}>
            不保存
          </button>
          <button className="moflow-dialog-btn moflow-dialog-btn-tertiary" onClick={() => handleResult("cancel")}>
            取消
          </button>
          <button className="moflow-dialog-btn moflow-dialog-btn-primary" onClick={() => handleResult("save")}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
