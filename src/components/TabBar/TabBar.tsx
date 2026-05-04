import { useEffect, useRef } from "react";
import { useAppStore } from "../../stores/appStore";
import { confirmCloseTab, saveFile, saveFileAs, closeLastTab } from "../../lib/fileOps";
import "./TabBar.css";

export default function TabBar() {
  const files = useAppStore((s) => s.files);
  const activeFileId = useAppStore((s) => s.activeFileId);
  const switchTab = useAppStore((s) => s.switchTab);
  const closeTab = useAppStore((s) => s.closeTab);
  const openTab = useAppStore((s) => s.openTab);
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
        ? "草稿内容未保存，是否保存？"
        : `「${tab.fileName}」有未保存的修改，是否保存？`;
      const result = await confirmCloseTab(message);
      if (result === "cancel") return;
      if (result === "save") {
        const prevActive = useAppStore.getState().activeFileId;
        useAppStore.getState().switchTab(id);
        if (tab.filePath) {
          await saveFile();
        } else {
          await saveFileAs();
          const saved = useAppStore.getState().files.find((f) => f.id === id);
          if (!saved?.filePath) return;
        }
        if (prevActive !== id) useAppStore.getState().switchTab(prevActive);
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

  return (
    <div className="moflow-tabbar" data-tauri-drag-region>
      <div className="moflow-tabbar-tabs" ref={tabsRef}>
        {files.map((tab) => (
          <div
            key={tab.id}
            data-tab-id={tab.id}
            className={`moflow-tab${tab.id === activeFileId ? " active" : ""}`}
            onClick={() => switchTab(tab.id)}
            onAuxClick={(e) => handleAuxClick(tab.id, e)}
            title={tab.filePath || tab.fileName}
          >
            <span className="moflow-tab-name">
              {tab.fileName}
              {tab.isModified && <span className="moflow-tab-asterisk">*</span>}
            </span>
            <button
              className="moflow-tab-close"
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
      </div>
        <button className="moflow-tabbar-new" onClick={handleNewTab} title="New Tab">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="7" y1="1" x2="7" y2="13" />
            <line x1="1" y1="7" x2="13" y2="7" />
          </svg>
        </button>
        <div className="moflow-tabbar-drag" data-tauri-drag-region />
    </div>
  );
}
