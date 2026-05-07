import { lazy, Suspense, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useThemeStore } from "../../stores/themeStore";
import TabBar from "../TabBar/TabBar";

const HamburgerMenu = lazy(() => import("../HamburgerMenu/HamburgerMenu"));
import "./TitleBar.css";

const appWindow = getCurrentWindow();
const isZh = navigator.language.startsWith("zh");
const t = (zh: string, en: string) => (isZh ? zh : en);

export default function TitleBar() {
  const showAISidebar = useThemeStore((s) => s.showAISidebar);
  const toggleAISidebar = useThemeStore((s) => s.toggleAISidebar);
  const openSettingsTab = useThemeStore((s) => s.openSettingsTab);
  const [isMaximized, setIsMaximized] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    appWindow.isMaximized().then(setIsMaximized);
    const unlisten = appWindow.onResized(() => {
      appWindow.isMaximized().then(setIsMaximized);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  const handleToggleMaximize = async () => {
    await appWindow.toggleMaximize();
    const maximized = await appWindow.isMaximized();
    setIsMaximized(maximized);
  };

  const handleDoubleClick = () => {
    appWindow.toggleMaximize();
  };

  return (
    <div className="moflow-titlebar">
      <div className="moflow-titlebar-left">
        <button
          className="moflow-titlebar-btn moflow-titlebar-menu-btn"
          onClick={() => setMenuOpen((v) => !v)}
          title="Menu"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        {menuOpen && <Suspense fallback={null}><HamburgerMenu onClose={() => setMenuOpen(false)} /></Suspense>}
        <button
          className={`moflow-titlebar-btn moflow-titlebar-ai-btn${showAISidebar ? " active" : ""}`}
          onClick={toggleAISidebar}
          title={t("AI 助手 (F8)", "AI Assistant (F8)")}
        >
          <span className="moflow-titlebar-ai-label">AI</span>
        </button>
      </div>

      <div
        className="moflow-titlebar-center"
        onDoubleClick={handleDoubleClick}
      >
        <TabBar />
      </div>

      <div className="moflow-titlebar-right">
        <button
          className="moflow-titlebar-btn moflow-titlebar-settings-btn"
          onClick={openSettingsTab}
          title={t("设置", "Settings")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        <button
          className="moflow-titlebar-btn moflow-titlebar-control"
          onClick={() => appWindow.minimize()}
          title="Minimize"
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
        <button
          className="moflow-titlebar-btn moflow-titlebar-control"
          onClick={handleToggleMaximize}
          title={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
              <rect x="2.5" y="0.5" width="8" height="8" rx="1" />
              <rect x="1.5" y="3.5" width="8" height="8" rx="1" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
              <rect x="1.5" y="1.5" width="9" height="9" rx="1" />
            </svg>
          )}
        </button>
        <button
          className="moflow-titlebar-btn moflow-titlebar-control moflow-titlebar-close"
          onClick={() => appWindow.close()}
          title="Close"
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" strokeWidth="1.5" />
            <line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}
