import { X, Settings, Plus } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { useTabStore } from "../../stores/tabStore";
import { useThemeStore } from "../../stores/themeStore";
import { confirmCloseTab, saveFile, saveFileAs, closeLastTab } from "../../lib/fileOps";
import { t } from "../../i18n/core";
import { useT } from "../../i18n/useT";

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
  useT();

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
        ? t("common.draftUnsaved")
        : t("common.fileUnsaved", { fileName: tab.fileName });
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

  const handleTabKeyDown = useCallback((e: React.KeyboardEvent) => {
    const tablist = tabsRef.current;
    if (!tablist) return;
    const tabs = Array.from(tablist.querySelectorAll<HTMLElement>('[role="tab"]'));
    if (tabs.length === 0) return;

    const currentIndex = tabs.indexOf(document.activeElement as HTMLElement);
    let nextIndex = -1;

    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        nextIndex = currentIndex <= 0 ? tabs.length - 1 : currentIndex - 1;
        break;
      case "ArrowRight":
        e.preventDefault();
        nextIndex = currentIndex >= tabs.length - 1 ? 0 : currentIndex + 1;
        break;
      case "Home":
        e.preventDefault();
        nextIndex = 0;
        break;
      case "End":
        e.preventDefault();
        nextIndex = tabs.length - 1;
        break;
    }

    if (nextIndex >= 0) {
      tabs[nextIndex].focus();
      const tabId = tabs[nextIndex].getAttribute("data-tab-id");
      if (tabId === "__settings__") {
        activateSettingsTab();
      } else if (tabId) {
        switchTab(tabId);
      }
    }
  }, [switchTab, activateSettingsTab]);

  if (!sessionInitialized) return <div className="flex items-center h-full flex-1 min-w-0 overflow-hidden relative z-1" data-tauri-drag-region />;

  return (
    <div className="flex items-center h-full flex-1 min-w-0 overflow-hidden relative z-1" data-tauri-drag-region>
      <div role="tablist" aria-label="Tabs" className="flex items-center h-full overflow-x-auto overflow-y-hidden flex-none min-w-0 [&::-webkit-scrollbar]:h-0" ref={tabsRef} onKeyDown={handleTabKeyDown}>
        {files.map((tab) => {
          const isActive = tab.id === activeFileId && !settingsTabActive;
          return (
            <div
              key={tab.id}
              data-tab-id={tab.id}
              role="tab"
              tabIndex={isActive ? 0 : -1}
              aria-selected={isActive}
              className={`flex items-center gap-1 h-[calc(100%-5px)] mt-[5px] px-2.5 text-xs cursor-pointer whitespace-nowrap rounded-t-lg transition-[background-color,color] duration-100 select-none flex-none min-w-[60px] max-w-[200px] ${isActive ? "text-moflow-text bg-moflow-bg border-b-2 border-moflow-accent" : "text-ui-titlebar-inactive hover:bg-[color-mix(in_srgb,currentColor_8%,transparent)]"}`}
              onClick={() => switchTab(tab.id)}
              onAuxClick={(e) => handleAuxClick(tab.id, e)}
              title={tab.filePath || tab.fileName}
            >
              <span className="overflow-hidden text-ellipsis">
                {tab.fileName}
                {tab.isModified && <span className="text-ui-accent ml-px">*</span>}
              </span>
              <button
                aria-label={t("common.close")}
                className="flex items-center justify-center w-4 h-4 border-none bg-none text-inherit cursor-pointer rounded opacity-0 transition-[opacity,background-color] duration-100 shrink-0 group-hover:opacity-60 [.active_&]:opacity-60 hover:opacity-100! hover:bg-[color-mix(in_srgb,currentColor_12%,transparent)]"
                onClick={(e) => handleClose(tab.id, e)}
                title="Close"
              >
                <X size={10} strokeWidth={1.2} />
              </button>
            </div>
          );
        })}
        {showSettingsTab && (
          <div
            data-tab-id="__settings__"
            role="tab"
            tabIndex={settingsTabActive ? 0 : -1}
            aria-selected={settingsTabActive}
            className={`flex items-center gap-1 h-[calc(100%-5px)] mt-[5px] px-2.5 text-xs cursor-pointer whitespace-nowrap rounded-t-lg transition-[background-color,color] duration-100 select-none flex-none min-w-[60px] max-w-[200px] ${settingsTabActive ? "text-moflow-text bg-moflow-bg border-b-2 border-moflow-accent" : "text-ui-titlebar-inactive hover:bg-[color-mix(in_srgb,currentColor_8%,transparent)]"}`}
            onClick={activateSettingsTab}
            title={t("common.settings")}
          >
            <Settings className="shrink-0" size={12} />
            <span className="overflow-hidden text-ellipsis">{t("common.settings")}</span>
            <button
              aria-label={t("common.close")}
              className="flex items-center justify-center w-4 h-4 border-none bg-none text-inherit cursor-pointer rounded opacity-0 transition-[opacity,background-color] duration-100 shrink-0 group-hover:opacity-60 [.active_&]:opacity-60 hover:opacity-100! hover:bg-[color-mix(in_srgb,currentColor_12%,transparent)]"
              onClick={(e) => { e.stopPropagation(); closeSettingsTab(); }}
              title="Close"
            >
              <X size={10} strokeWidth={1.2} />
            </button>
          </div>
        )}
      </div>
        <button className="flex items-center justify-center w-7 h-full border-none bg-none text-ui-titlebar-inactive cursor-pointer shrink-0 transition-[background-color,color] duration-100 hover:bg-ui-hover hover:text-ui-titlebar-text" onClick={handleNewTab} title="New Tab">
          <Plus size={14} strokeWidth={1.5} />
        </button>
        <div className="flex-1 h-full min-w-0" data-tauri-drag-region />
    </div>
  );
}
