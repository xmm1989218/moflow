import { lazy, Suspense, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppStore } from "../../stores/appStore";
import TabBar from "../TabBar/TabBar";

const HamburgerMenu = lazy(() => import("../HamburgerMenu/HamburgerMenu"));
import "./TitleBar.css";

const appWindow = getCurrentWindow();

export default function TitleBar() {
  const showAISidebar = useAppStore((s) => s.showAISidebar);
  const toggleAISidebar = useAppStore((s) => s.toggleAISidebar);
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
          title="AI Assistant"
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
