import { Menu, AlignLeft, Settings, Minus, Copy, Square, X } from "lucide-react";
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
          <Menu size={16} />
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
          <AlignLeft size={14} />
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
          <Settings size={14} />
        </button>
        <button
          className="flex items-center justify-center border-none bg-none text-ui-titlebar-text cursor-pointer h-10 min-w-[46px] px-0 transition-[background-color] duration-150 hover:bg-ui-hover"
          onClick={() => appWindow.minimize()}
          aria-label={t("titleBar.minimize")}
          title={t("titleBar.minimize")}
        >
          <Minus size={12} strokeWidth={1.5} />
        </button>
        <button
          className="flex items-center justify-center border-none bg-none text-ui-titlebar-text cursor-pointer h-10 min-w-[46px] px-0 transition-[background-color] duration-150 hover:bg-ui-hover"
          onClick={handleToggleMaximize}
          aria-label={isMaximized ? t("titleBar.restore") : t("titleBar.maximize")}
          title={isMaximized ? t("titleBar.restore") : t("titleBar.maximize")}
        >
          {isMaximized ? (
            <Copy size={12} strokeWidth={1.2} />
          ) : (
            <Square size={12} strokeWidth={1.2} />
          )}
        </button>
        <button
          className="flex items-center justify-center border-none bg-none text-ui-titlebar-text cursor-pointer h-10 min-w-[46px] px-0 transition-[background-color] duration-150 hover:bg-[#e81123]! hover:text-white!"
          onClick={() => appWindow.close()}
          aria-label={t("titleBar.close")}
          title={t("titleBar.close")}
        >
          <X size={12} strokeWidth={1.5} />
        </button>
      </div>
      )}
    </div>
  );
}
