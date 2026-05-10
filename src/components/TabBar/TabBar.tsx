import { useEffect, useRef } from "react";
import { useTabStore } from "../../stores/tabStore";
import { useThemeStore } from "../../stores/themeStore";
import { confirmCloseTab, saveFile, saveFileAs, closeLastTab } from "../../lib/fileOps";
import { t } from "../../lib/i18n";

export default function TabBar() {
  const files = useTabStore((s) => s.files);
  const activeFileId = useTabStore((s) => s.activeFileId);
  const sessionInitialized = useTabStore((s) => s.sessionInitialized);
  const switchTab = useTabStore((s) => s.switchTab);
  const closeTab = useTabStore((s) => s.closeTab);
  const openTab = useTabStore((s) => s.openTab);
  const showSettingsTab = useThemeStore((s) => s.showSettingsTab);
  const settingsTabActive = useThemeStore((s) => s.settingsTabActive);
  const activateSettingsTab = useThemeStore((s) => s.activateSettingsTab);
  const closeSettingsTab = useThemeStore((s) => s.closeSettingsTab);
  const tabsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tabsRef.current || !activeFileId) return;
    const activeTab = tabsRef.current.querySelector(`[data-tab-id="${activeFileId}"]`);
    if (activeTab) activeTab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [activeFileId]);

  const handleClose = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const tab = files.find((f) => f.id === id);
    if (!tab) return;

    if (files.length === 1) {
      closeLastTab(tab);
      return;
    }

    const needConfirm = tab.isModified || (tab.filePath === null && tab.content.length > 0);
    if (needConfirm) {
      const message = tab.filePath === null
        ? t("草稿内容未保存，是否保存？", "Draft is unsaved. Save it?")
        : t(`「${tab.fileName}」有未保存的修改，是否保存？`, `"${tab.fileName}" has unsaved changes. Save?`);
      const result = await confirmCloseTab(message);
      if (result === "cancel") return;
      if (result === "save") {
        const prevActive = useTabStore.getState().activeFileId;
        useTabStore.getState().switchTab(id);
        if (tab.filePath) {
          await saveFile();
        } else {
          await saveFileAs();
          const saved = useTabStore.getState().files.find((f) => f.id === id);
          if (!saved?.filePath) return;
        }
        if (prevActive !== id) useTabStore.getState().switchTab(prevActive);
      }
    }
    closeTab(id);
  };

  const handleAuxClick = (id: string, e: React.MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      handleClose(id, e);
    }
  };

  const handleNewTab = () => {
    openTab();
  };

  if (!sessionInitialized) return <div className="flex items-center h-full flex-1 min-w-0 overflow-hidden relative z-1" data-tauri-drag-region />;

  return (
    <div className="flex items-center h-full flex-1 min-w-0 overflow-hidden relative z-1" data-tauri-drag-region>
      <div className="flex items-center h-full overflow-x-auto overflow-y-hidden flex-none min-w-0 [&::-webkit-scrollbar]:h-0" ref={tabsRef}>
        {files.map((tab) => (
          <div
            key={tab.id}
            data-tab-id={tab.id}
            className={`flex items-center gap-1 h-[calc(100%-5px)] mt-[5px] px-2.5 text-xs cursor-pointer whitespace-nowrap rounded-t-lg transition-[background-color,color] duration-100 select-none flex-none min-w-[60px] max-w-[200px] ${tab.id === activeFileId && !settingsTabActive ? "text-moflow-text bg-moflow-bg border-b-2 border-moflow-accent" : "text-ui-titlebar-inactive hover:bg-[color-mix(in_srgb,currentColor_8%,transparent)]"}`}
            onClick={() => switchTab(tab.id)}
            onAuxClick={(e) => handleAuxClick(tab.id, e)}
            title={tab.filePath || tab.fileName}
          >
            <span className="overflow-hidden text-ellipsis">
              {tab.fileName}
              {tab.isModified && <span className="text-ui-accent ml-px">*</span>}
            </span>
            <button
              className="flex items-center justify-center w-4 h-4 border-none bg-none text-inherit cursor-pointer rounded opacity-0 transition-[opacity,background-color] duration-100 shrink-0 group-hover:opacity-60 [.active_&]:opacity-60 hover:opacity-100! hover:bg-[color-mix(in_srgb,currentColor_12%,transparent)]"
              onClick={(e) => handleClose(tab.id, e)}
              title="Close"
            >
              <svg width="10" height="10" viewBox="0 0 10 10">
                <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.2" />
                <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </button>
          </div>
        ))}
        {showSettingsTab && (
          <div
            className={`flex items-center gap-1 h-[calc(100%-5px)] mt-[5px] px-2.5 text-xs cursor-pointer whitespace-nowrap rounded-t-lg transition-[background-color,color] duration-100 select-none flex-none min-w-[60px] max-w-[200px] ${settingsTabActive ? "text-moflow-text bg-moflow-bg border-b-2 border-moflow-accent" : "text-ui-titlebar-inactive hover:bg-[color-mix(in_srgb,currentColor_8%,transparent)]"}`}
            onClick={activateSettingsTab}
            title={t("设置", "Settings")}
          >
            <svg className="shrink-0" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span className="overflow-hidden text-ellipsis">{t("设置", "Settings")}</span>
            <button
              className="flex items-center justify-center w-4 h-4 border-none bg-none text-inherit cursor-pointer rounded opacity-0 transition-[opacity,background-color] duration-100 shrink-0 group-hover:opacity-60 [.active_&]:opacity-60 hover:opacity-100! hover:bg-[color-mix(in_srgb,currentColor_12%,transparent)]"
              onClick={(e) => { e.stopPropagation(); closeSettingsTab(); }}
              title="Close"
            >
              <svg width="10" height="10" viewBox="0 0 10 10">
                <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.2" />
                <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </button>
          </div>
        )}
      </div>
        <button className="flex items-center justify-center w-7 h-full border-none bg-none text-ui-titlebar-inactive cursor-pointer shrink-0 transition-[background-color,color] duration-100 hover:bg-ui-hover hover:text-ui-titlebar-text" onClick={handleNewTab} title="New Tab">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="7" y1="1" x2="7" y2="13" />
            <line x1="1" y1="7" x2="13" y2="7" />
          </svg>
        </button>
        <div className="flex-1 h-full min-w-0" data-tauri-drag-region />
    </div>
  );
}
