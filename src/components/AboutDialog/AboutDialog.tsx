import { useState, useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { useUpdateStore } from "../../stores/updateStore";
import "./AboutDialog.css";

const isZh = navigator.language.startsWith("zh");
const t = (zh: string, en: string) => (isZh ? zh : en);

export default function AboutDialog() {
  const [version, setVersion] = useState("");
  const aboutVisible = useUpdateStore((s) => s.aboutVisible);
  const setAboutVisible = useUpdateStore((s) => s.setAboutVisible);
  const checkUpdate = useUpdateStore((s) => s.checkUpdate);

  useEffect(() => {
    getVersion().then(setVersion);
  }, []);

  if (!aboutVisible) return null;

  const handleCheckUpdate = () => {
    setAboutVisible(false);
    checkUpdate(true);
  };

  const handleClose = () => {
    setAboutVisible(false);
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) handleClose();
  };

  return (
    <div className="moflow-dialog-overlay" onClick={handleOverlayClick}>
      <div className="moflow-dialog moflow-about-dialog" onClick={(e) => e.stopPropagation()}>
        <img className="moflow-about-icon" src="/icon.png" alt="MoFlow" />
        <div className="moflow-about-name">MoFlow</div>
        <div className="moflow-about-version">v{version}</div>
        <div className="moflow-about-copyright">© 2026 MoFlow</div>
        <div className="moflow-dialog-buttons moflow-about-buttons">
          <button className="moflow-dialog-btn moflow-dialog-btn-secondary" onClick={handleClose}>
            {t("关闭", "Close")}
          </button>
          <button className="moflow-dialog-btn moflow-dialog-btn-primary" onClick={handleCheckUpdate}>
            {t("检查更新", "Check for Updates")}
          </button>
        </div>
      </div>
    </div>
  );
}
