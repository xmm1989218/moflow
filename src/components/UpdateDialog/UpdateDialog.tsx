import { useEffect } from "react";
import { useUpdateStore } from "../../stores/updateStore";
import "./UpdateDialog.css";

const isZh = navigator.language.startsWith("zh");
const t = (zh: string, en: string) => (isZh ? zh : en);

export default function UpdateDialog() {
  const status = useUpdateStore((s) => s.status);
  const installAndRestart = useUpdateStore((s) => s.installAndRestart);
  const dismiss = useUpdateStore((s) => s.dismiss);

  useEffect(() => {
    if (status.state === "up-to-date" || status.state === "error") {
      const timer = setTimeout(dismiss, 3000);
      return () => clearTimeout(timer);
    }
  }, [status.state, dismiss]);

  if (status.state === "idle") return null;

  if (status.state === "checking") {
    return (
      <div className="moflow-toast">
        <div className="moflow-toast-icon">⏳</div>
        <div className="moflow-toast-body">
          <div className="moflow-toast-title">{t("正在检查更新…", "Checking for updates…")}</div>
        </div>
      </div>
    );
  }

  if (status.state === "up-to-date") {
    return (
      <div className="moflow-toast moflow-toast-success">
        <div className="moflow-toast-icon">✓</div>
        <div className="moflow-toast-body">
          <div className="moflow-toast-title">{t("已是最新版本", "You're up to date")}</div>
        </div>
      </div>
    );
  }

  if (status.state === "available") {
    const { info } = status;
    return (
      <div className="moflow-toast moflow-toast-persistent">
        <div className="moflow-toast-icon">↓</div>
        <div className="moflow-toast-body">
          <div className="moflow-toast-title">
            {t(`新版本 v${info.version} 可用`, `v${info.version} available`)}
          </div>
          {info.body && (
            <div className="moflow-toast-desc">{info.body.split("\n")[0]}</div>
          )}
        </div>
        <div className="moflow-toast-actions">
          <button className="moflow-toast-btn moflow-toast-btn-secondary" onClick={dismiss}>
            {t("稍后", "Later")}
          </button>
          <button className="moflow-toast-btn moflow-toast-btn-primary" onClick={installAndRestart}>
            {t("安装并重启", "Install & Restart")}
          </button>
        </div>
      </div>
    );
  }

  if (status.state === "error") {
    return (
      <div className="moflow-toast moflow-toast-error">
        <div className="moflow-toast-icon">✕</div>
        <div className="moflow-toast-body">
          <div className="moflow-toast-title">{t("检查更新失败", "Update check failed")}</div>
        </div>
      </div>
    );
  }

  return null;
}
