import { useEffect, useRef } from "react";
import Editor from "./components/Editor/Editor";
import StatusBar from "./components/StatusBar/StatusBar";
import TitleBar from "./components/TitleBar/TitleBar";
import AISidebar from "./components/AISidebar/AISidebar";
import ConfirmCloseDialog from "./components/ConfirmCloseDialog/ConfirmCloseDialog";
import { useAppStore, resolveAppTheme } from "./stores/appStore";
import { openFile, saveFile, saveFileAs, confirmCloseTab, confirmCloseWindow } from "./lib/fileOps";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";

function App() {
  const appTheme = useAppStore((s) => s.appTheme);
  const editorTheme = useAppStore((s) => s.editorTheme);
  const showAISidebar = useAppStore((s) => s.showAISidebar);
  const openTab = useAppStore((s) => s.openTab);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const resolved = resolveAppTheme(appTheme);
    document.documentElement.setAttribute("data-app-theme", resolved);
  }, [appTheme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-editor-theme", editorTheme);
  }, [editorTheme]);

  const activeContent = useAppStore((s) => {
    const tab = s.files.find((f) => f.id === s.activeFileId);
    return tab?.content ?? "";
  });
  const activeFileId = useAppStore((s) => s.activeFileId);
  const autoSave = useAppStore((s) => s.autoSave);

  useEffect(() => {
    if (!autoSave) return;
    const state = useAppStore.getState();
    const tab = state.files.find((f) => f.id === state.activeFileId);
    if (!tab || !tab.filePath || !tab.isModified) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      const s = useAppStore.getState();
      if (!s.autoSave) return;
      const t = s.files.find((f) => f.id === s.activeFileId);
      if (t && t.filePath && t.isModified) {
        saveFile();
      }
    }, 1500);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [activeContent, activeFileId, autoSave]);

  useEffect(() => {
    if (appTheme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const resolved = resolveAppTheme("system");
      document.documentElement.setAttribute("data-app-theme", resolved);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [appTheme]);

  useEffect(() => {
    const unlisten = getCurrentWindow().onCloseRequested(async (event) => {
      const state = useAppStore.getState();
      const hasModified = state.files.some((f) => f.isModified);
      if (!hasModified) return;

      event.preventDefault();
      const ok = await confirmCloseWindow();
      if (ok) getCurrentWindow().destroy();
    });

    return () => { unlisten.then((fn) => fn()); };
  }, []);

  useEffect(() => {
    function handleDrop(e: DragEvent) {
      e.preventDefault();
      if (!e.dataTransfer?.files.length) return;

      const file = e.dataTransfer.files[0];
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!["md", "markdown", "txt"].includes(ext || "")) return;

      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result as string;
        openTab({
          filePath: null,
          fileName: file.name,
          content,
          isModified: false,
        });
      };
      reader.readAsText(file);
    }

    function handleDragOver(e: DragEvent) {
      e.preventDefault();
    }

    document.addEventListener("drop", handleDrop);
    document.addEventListener("dragover", handleDragOver);
    return () => {
      document.removeEventListener("drop", handleDrop);
      document.removeEventListener("dragover", handleDragOver);
    };
  }, [openTab]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key === "o") {
        e.preventDefault();
        openFile();
      } else if (mod && e.key === "s" && !e.shiftKey) {
        e.preventDefault();
        saveFile();
      } else if (mod && e.key === "s" && e.shiftKey) {
        e.preventDefault();
        saveFileAs();
      } else if (mod && e.key === "n") {
        e.preventDefault();
        useAppStore.getState().newFile();
      } else if (mod && e.key === "w") {
        e.preventDefault();
        const state = useAppStore.getState();
        const active = state.getActiveFile();
        if (active.isModified) {
          confirmCloseTab(active.fileName, !!active.filePath).then((result) => {
            if (result === "cancel") return;
            if (result === "save") {
              state.switchTab(active.id);
              if (active.filePath) {
                saveFile().then(() => state.closeTab(active.id));
              } else {
                saveFileAs().then(() => state.closeTab(active.id));
              }
            } else {
              state.closeTab(active.id);
            }
          });
        } else {
          state.closeTab(active.id);
        }
      } else if (mod && e.key === "Tab") {
        e.preventDefault();
        const state = useAppStore.getState();
        const files = state.files;
        if (files.length <= 1) return;
        const idx = files.findIndex((f) => f.id === state.activeFileId);
        const dir = e.shiftKey ? -1 : 1;
        const nextIdx = (idx + dir + files.length) % files.length;
        state.switchTab(files[nextIdx].id);
      } else if (e.key === "F11") {
        e.preventDefault();
        const appWindow = getCurrentWindow();
        appWindow.isFullscreen().then((fs) => appWindow.setFullscreen(!fs));
      } else if (e.key === "F12") {
        e.preventDefault();
        invoke("toggle_devtools");
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div
      className="h-full w-full flex flex-col overflow-hidden"
      data-app-theme={resolveAppTheme(appTheme)}
      data-editor-theme={editorTheme}
    >
      <TitleBar />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Editor />
        {showAISidebar && <AISidebar />}
      </div>
      <StatusBar />
      <ConfirmCloseDialog />
    </div>
  );
}

export default App;
