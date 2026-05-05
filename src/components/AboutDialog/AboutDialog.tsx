import { useState, useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { useUpdateStore } from "../../stores/updateStore";
import { useAppStore } from "../../stores/appStore";
import type { UpdateChannel } from "../../lib/settings";
import "./AboutDialog.css";

const isZh = navigator.language.startsWith("zh");
const t = (zh: string, en: string) => (isZh ? zh : en);

export default function AboutDialog() {
  const [version, setVersion] = useState("");
  const aboutVisible = useUpdateStore((s) => s.aboutVisible);
  const setAboutVisible = useUpdateStore((s) => s.setAboutVisible);
  const checkUpdate = useUpdateStore((s) => s.checkUpdate);
  const updateChannel = useAppStore((s) => s.updateChannel);
  const setUpdateChannel = useAppStore((s) => s.setUpdateChannel);

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

  const handleChannelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setUpdateChannel(e.target.value as UpdateChannel);
  };

  return (
    <div className="moflow-dialog-overlay" onClick={handleOverlayClick}>
      <div className="moflow-dialog moflow-about-dialog" onClick={(e) => e.stopPropagation()}>
        <img className="moflow-about-icon" src="/icon.png" alt="MoFlow" />
        <div className="moflow-about-name">MoFlow</div>
        <div className="moflow-about-version">v{version}</div>
        <div className="moflow-about-copyright">© 2026 MoFlow</div>
        <div className="moflow-about-channel">
          <label className="moflow-about-channel-label">
            {t("更新通道", "Update Channel")}
          </label>
          <select
            className="moflow-about-channel-select"
            value={updateChannel}
            onChange={handleChannelChange}
          >
            <option value="stable">{t("正式版", "Stable")}</option>
            <option value="beta">{t("测试版", "Beta")}</option>
          </select>
        </div>
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
