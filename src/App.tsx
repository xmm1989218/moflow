import { lazy, Suspense, useEffect, useRef } from "react";
import Editor from "./components/Editor/Editor";
import StatusBar from "./components/StatusBar/StatusBar";
import TitleBar from "./components/TitleBar/TitleBar";
import ConfirmCloseDialog from "./components/ConfirmCloseDialog/ConfirmCloseDialog";
import UpdateDialog from "./components/UpdateDialog/UpdateDialog";
import AboutDialog from "./components/AboutDialog/AboutDialog";
import ErrorBoundary from "./components/ErrorBoundary";

const AISidebar = lazy(() => import("./components/AISidebar/AISidebar"));
import { initSession } from "./stores/appStore";
import { useTabStore } from "./stores/tabStore";
import { useThemeStore, resolveAppTheme } from "./stores/themeStore";
import { useUpdateStore } from "./stores/updateStore";
import { useAIConfigStore } from "./stores/aiConfigStore";
import { useSearchStore } from "./stores/searchStore";
import { useChatStore } from "./stores/chatStore";
import { openFile, saveFile, saveFileAs, confirmCloseTab, saveAllFiles, loadFileByPath, closeLastTab } from "./lib/fileOps";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";

const isZh = navigator.language.startsWith("zh");
const t = (zh: string, en: string) => (isZh ? zh : en);

function App() {
  const appTheme = useThemeStore((s) => s.appTheme);
  const editorTheme = useThemeStore((s) => s.editorTheme);
  const showAISidebar = useThemeStore((s) => s.showAISidebar);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    initSession().then(async () => {
      useAIConfigStore.getState().loadConfig();
      const tabs = useTabStore.getState().files;
      const paths = tabs.map((t) => t.filePath).filter(Boolean) as string[];
      if (paths.length > 0) {
        await invoke("allow_paths", { paths });
      }
      await Promise.all(tabs.map((tab) => useChatStore.getState().loadChatHistory(tab.id)));
      useUpdateStore.getState().checkUpdate();
      requestAnimationFrame(() => {
        getCurrentWindow().show();
      });
    });
  }, []);

  useEffect(() => {
    const fallback = setTimeout(() => {
      getCurrentWindow().show();
    }, 3000);
    return () => clearTimeout(fallback);
  }, []);

  useEffect(() => {
    const resolved = resolveAppTheme(appTheme);
    document.documentElement.setAttribute("data-app-theme", resolved);
  }, [appTheme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-editor-theme", editorTheme);
  }, [editorTheme]);

  const activeContent = useTabStore((s) => {
    const tab = s.files.find((f) => f.id === s.activeFileId);
    return tab?.content ?? "";
  });
  const activeFileId = useTabStore((s) => s.activeFileId);
  const autoSave = useThemeStore((s) => s.autoSave);

  useEffect(() => {
    if (!autoSave) return;
    const state = useTabStore.getState();
    const tab = state.files.find((f) => f.id === state.activeFileId);
    if (!tab || !tab.filePath || !tab.isModified || !tab.contentLoaded) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      const s = useTabStore.getState();
      if (!useThemeStore.getState().autoSave) return;
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
      event.preventDefault();
      try {
        await saveAllFiles();
      } catch (e) {
        console.error("saveAllFiles error:", e);
      }
      getCurrentWindow().destroy();
    });

    return () => { unlisten.then((fn) => fn()); };
  }, []);

  useEffect(() => {
    const unlisten = getCurrentWindow().onDragDropEvent((event) => {
      if (event.payload.type === "drop") {
        for (const path of event.payload.paths) {
          const ext = path.split(".").pop()?.toLowerCase();
          if (["md", "markdown", "txt"].includes(ext || "")) {
            loadFileByPath(path);
            break;
          }
        }
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

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
        useTabStore.getState().newFile();
      } else if (mod && e.key === "w") {
        e.preventDefault();
        const state = useTabStore.getState();
        const active = state.getActiveFile();

        if (state.files.length === 1) {
          closeLastTab(active);
          return;
        }

        const needConfirm = active.isModified || (active.filePath === null && active.content.length > 0);
        if (needConfirm) {
          const message = active.filePath === null
            ? t("草稿内容未保存，是否保存？", "Draft is unsaved. Save it?")
            : t(`「${active.fileName}」有未保存的修改，是否保存？`, `"${active.fileName}" has unsaved changes. Save?`);
          confirmCloseTab(message).then((result) => {
            if (result === "cancel") return;
            if (result === "save") {
              state.switchTab(active.id);
              if (active.filePath) {
                saveFile().then(() => state.closeTab(active.id));
              } else {
                saveFileAs().then(() => {
                  const saved = useTabStore.getState().files.find((f) => f.id === active.id);
                  if (saved?.filePath) state.closeTab(active.id);
                });
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
        const state = useTabStore.getState();
        const files = state.files;
        if (files.length <= 1) return;
        const idx = files.findIndex((f) => f.id === state.activeFileId);
        const dir = e.shiftKey ? -1 : 1;
        const nextIdx = (idx + dir + files.length) % files.length;
        state.switchTab(files[nextIdx].id);
      } else if (mod && e.key === "f") {
        e.preventDefault();
        useSearchStore.getState().toggleSearch(false);
      } else if (mod && e.key === "h") {
        e.preventDefault();
        useSearchStore.getState().toggleSearch(true);
      } else if (e.key === "F8") {
        e.preventDefault();
        e.stopPropagation();
        useThemeStore.getState().toggleAISidebar();
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

  useEffect(() => {
    const unlisten = getCurrentWindow().listen<string>("single-instance-file-open", (event) => {
      loadFileByPath(event.payload);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  return (
    <div
      className="h-full w-full flex flex-col overflow-hidden"
      data-app-theme={resolveAppTheme(appTheme)}
      data-editor-theme={editorTheme}
    >
      <TitleBar />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <ErrorBoundary resetKeys={[activeFileId]}>
          <Editor />
        </ErrorBoundary>
        {showAISidebar && <Suspense fallback={null}><AISidebar /></Suspense>}
      </div>
      <StatusBar />
      <ConfirmCloseDialog />
      <UpdateDialog />
      <AboutDialog />
    </div>
  );
}

export default App;
