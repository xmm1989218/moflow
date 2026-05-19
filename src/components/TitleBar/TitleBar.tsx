import { lazy, Suspense, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { platform } from "@tauri-apps/plugin-os";
import { useThemeStore } from "../../stores/themeStore";
import TabBar from "../TabBar/TabBar";
import { getShortcutDisplay, getShortcutLabel } from "../../lib/shortcuts";
import { t } from "../../i18n/core";
import { useT } from "../../i18n/useT";

const HamburgerMenu = lazy(() => import("../HamburgerMenu/HamburgerMenu"));

const appWindow = getCurrentWindow();
const isMacOs = platform() === "macos";

export default function TitleBar() {
  const showAISidebar = useThemeStore((s) => s.showAISidebar);
  const toggleAISidebar = useThemeStore((s) => s.toggleAISidebar);
  const showOutline = useThemeStore((s) => s.showOutline);
  const toggleOutline = useThemeStore((s) => s.toggleOutline);
  const openSettingsTab = useThemeStore((s) => s.openSettingsTab);
  const [isMaximized, setIsMaximized] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useT();

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
    <div className={`h-10 flex items-center bg-ui-titlebar-bg text-ui-titlebar-text border-b border-ui-border select-none shrink-0 ${isMacOs ? "pl-[78px]" : ""}`}>
      <div className="flex items-center gap-0.5 pl-1 relative z-[100]">
        <button
          className="flex items-center justify-center border-none bg-none text-ui-titlebar-text cursor-pointer h-10 min-w-10 px-2 transition-[background-color] duration-150"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={t("titleBar.menu")}
          title={t("titleBar.menu")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        {menuOpen && <Suspense fallback={null}><HamburgerMenu onClose={() => setMenuOpen(false)} /></Suspense>}
        <button
          className={`flex items-center justify-center border-none bg-none cursor-pointer h-10 px-2.5 rounded transition-[background-color] duration-150 gap-1 text-[11px] font-bold tracking-wide leading-none ${showAISidebar ? "text-ui-accent bg-ui-menu-hover" : "text-ui-titlebar-text hover:bg-ui-hover"}`}
          onClick={toggleAISidebar}
          aria-label={`${t("titleBar.aiAssistant")} (${getShortcutDisplay("aiSidebar")})`}
          title={`${t("titleBar.aiAssistant")} (${getShortcutDisplay("aiSidebar")})`}
        >
          <span>AI</span>
        </button>
        <button
          className={`flex items-center justify-center border-none bg-none cursor-pointer h-10 px-2.5 rounded transition-[background-color] duration-150 ${showOutline ? "text-ui-accent bg-ui-menu-hover" : "text-ui-titlebar-text hover:bg-ui-hover"}`}
          onClick={toggleOutline}
          aria-label={`${t("titleBar.outline")} (${getShortcutDisplay("outline")})`}
          title={`${t("titleBar.outline")} (${getShortcutDisplay("outline")})`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="5" y2="6" />
            <line x1="3" y1="12" x2="5" y2="12" />
            <line x1="3" y1="18" x2="5" y2="18" />
          </svg>
        </button>
      </div>

      <div
        className="flex-1 min-w-0 h-full flex items-center"
        onDoubleClick={handleDoubleClick}
      >
        <TabBar />
      </div>

      {!isMacOs && (
      <div className="flex items-center h-full">
        <button
          className="flex items-center justify-center border-none bg-none text-ui-titlebar-text cursor-pointer h-10 min-w-10 px-2 transition-[background-color] duration-150 hover:bg-ui-hover px-2.5"
          onClick={openSettingsTab}
          aria-label={`${getShortcutLabel("settings")} (${getShortcutDisplay("settings")})`}
          title={`${getShortcutLabel("settings")} (${getShortcutDisplay("settings")})`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        <button
          className="flex items-center justify-center border-none bg-none text-ui-titlebar-text cursor-pointer h-10 min-w-[46px] px-0 transition-[background-color] duration-150 hover:bg-ui-hover"
          onClick={() => appWindow.minimize()}
          aria-label={t("titleBar.minimize")}
          title={t("titleBar.minimize")}
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
        <button
          className="flex items-center justify-center border-none bg-none text-ui-titlebar-text cursor-pointer h-10 min-w-[46px] px-0 transition-[background-color] duration-150 hover:bg-ui-hover"
          onClick={handleToggleMaximize}
          aria-label={isMaximized ? t("titleBar.restore") : t("titleBar.maximize")}
          title={isMaximized ? t("titleBar.restore") : t("titleBar.maximize")}
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
          className="flex items-center justify-center border-none bg-none text-ui-titlebar-text cursor-pointer h-10 min-w-[46px] px-0 transition-[background-color] duration-150 hover:bg-[#e81123]! hover:text-white!"
          onClick={() => appWindow.close()}
          aria-label={t("titleBar.close")}
          title={t("titleBar.close")}
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" strokeWidth="1.5" />
            <line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>
      )}
    </div>
  );
}
