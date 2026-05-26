import { lazy, Suspense, useEffect, useRef } from "react";
import Editor from "./components/Editor/Editor";
import StatusBar from "./components/StatusBar/StatusBar";
import TitleBar from "./components/TitleBar/TitleBar";
import ConfirmCloseDialog from "./components/ConfirmCloseDialog/ConfirmCloseDialog";
import UpdateDialog from "./components/UpdateDialog/UpdateDialog";
import SettingsPanel from "./components/SettingsPanel/SettingsPanel";
import OutlineSidebar from "./components/OutlineSidebar/OutlineSidebar";
import ErrorBoundary from "./components/ErrorBoundary";
import ToastContainer from "./components/ToastContainer/ToastContainer";

const AISidebar = lazy(() => import("./components/AISidebar/AISidebar"));
import { initFromStartupData, initSession } from "./stores/appStore";
import { useTabStore } from "./stores/tabStore";
import { useThemeStore, resolveAppTheme } from "./stores/themeStore";
import { useUpdateStore } from "./stores/updateStore";
import { useSearchStore } from "./stores/searchStore";
import { useChatStore } from "./stores/chatStore";
import { openFile, saveFile, saveFileAs, confirmCloseTab, saveAllFiles, loadFileByPath, closeLastTab, openFolder } from "./lib/fileOps";
import { t } from "./i18n/core";
import { I18nProvider } from "./i18n";
import { getAllShortcuts } from "./lib/shortcuts";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";

function startupReport() {
  const marks = performance.getEntriesByType("mark");
  const measures = performance.getEntriesByType("measure");
  console.group("[startup] Timeline");
  console.log("Marks:");
  marks.forEach((m) => console.log(`  ${m.name}: ${Math.round(m.startTime)}ms`));
  console.log("Measures:");
  measures.forEach((m) => console.log(`  ${m.name}: ${Math.round(m.duration)}ms`));
  console.groupEnd();
}

function App() {
  const appTheme = useThemeStore((s) => s.appTheme);
  const editorTheme = useThemeStore((s) => s.editorTheme);
  const showAISidebar = useThemeStore((s) => s.showAISidebar);
  const showOutline = useThemeStore((s) => s.showOutline);
  const showSettingsTab = useThemeStore((s) => s.showSettingsTab);
  const settingsTabActive = useThemeStore((s) => s.settingsTabActive);
  const language = useThemeStore((s) => s.language);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    window.__startupMark?.("react-mount", "js-exec");
  }, []);

  useEffect(() => {
    getCurrentWindow().show();
    initFromStartupData()
      .then(async (ok) => {
        if (!ok) {
          await initSession();
        }
        await import("./lib/chatPersistence").then(({ migrateOldChatDir }) => migrateOldChatDir());
        window.__startupMark?.("session-loaded", "react-mount");
        window.__startupMark?.("window-shown", "session-loaded");
        startupReport();
        const chatKey = useTabStore.getState().getChatKey();
        if (chatKey) useChatStore.getState().loadChatHistory(chatKey);
        useUpdateStore.getState().checkUpdate();
        const tabs = useTabStore.getState().files;
        const activeFileId = useTabStore.getState().activeFileId;
        const workspaceRoot = useTabStore.getState().workspaceRoot;
        const paths = tabs.map((t) => t.filePath).filter(Boolean) as string[];
        if (workspaceRoot) paths.push(workspaceRoot);
        if (paths.length > 0) {
          await invoke("allow_paths", { paths });
        }
        const activeTab = tabs.find((t) => t.id === activeFileId);
        if (activeTab && !activeTab.contentLoaded && activeTab.filePath) {
          const { loadTabContent } = await import("./lib/fileOps");
          loadTabContent(activeTab.id);
        }
        try {
          const { useSkillStore } = await import("./stores/skillStore");
          await useSkillStore.getState().discoverSkills();
          const skills = useSkillStore.getState().discoveredSkills;
          console.info("[App] discoverSkills completed:", skills.length, "skills", skills.map((s) => `${s.name}(${s.enabled ? "on" : "off"})`));
        } catch (e) {
          console.error("[App] discoverSkills failed:", e);
        }
      })
      .catch((e) => {
        console.error("initFromStartupData failed:", e);
      });
  }, []);

  useEffect(() => {
    const resolved = resolveAppTheme(appTheme);
    document.documentElement.setAttribute("data-app-theme", resolved);
  }, [appTheme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-editor-theme", editorTheme);
  }, [editorTheme]);

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
  }, [activeFileId, autoSave]);

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
      const allShortcuts = getAllShortcuts();
      let matched: string | null = null;

      for (const s of allShortcuts) {
        const ctrlMatch = s.modifiers.includes("ctrl") ? (e.ctrlKey || e.metaKey) : !e.ctrlKey && !e.metaKey;
        const shiftMatch = s.modifiers.includes("shift") ? e.shiftKey : !e.shiftKey;
        const altMatch = s.modifiers.includes("alt") ? e.altKey : !e.altKey;
        const keyMatch = e.key.toLowerCase() === s.key.toLowerCase() || e.key === s.key;
        if (ctrlMatch && shiftMatch && altMatch && keyMatch) {
          matched = s.id;
          break;
        }
      }

      if (!matched) return;
      e.preventDefault();

      switch (matched) {
        case "openFile": openFile(); break;
        case "openFolder": openFolder(); break;
        case "saveFile": saveFile(); break;
        case "saveFileAs": saveFileAs(); break;
        case "newFile": useTabStore.getState().newFile(); break;
        case "closeTab": {
          const state = useTabStore.getState();
          if (state.files.length === 0) return;
          const active = state.getActiveFile();
          if (state.files.length === 1) { closeLastTab(active); return; }
          const needConfirm = active.isModified || (active.filePath === null && active.content.length > 0);
          if (needConfirm) {
            const message = active.filePath === null ? t("common.draftUnsaved") : t("common.fileUnsaved", { fileName: active.fileName });
            confirmCloseTab(message).then((result) => {
              if (result === "cancel") return;
              if (result === "save") {
                state.switchTab(active.id);
                if (active.filePath) { saveFile().then(() => state.closeTab(active.id)); }
                else { saveFileAs().then(() => { const saved = useTabStore.getState().files.find((f) => f.id === active.id); if (saved?.filePath) state.closeTab(active.id); }); }
              } else { state.closeTab(active.id); }
            });
          } else { state.closeTab(active.id); }
          break;
        }
        case "nextTab": {
          const state = useTabStore.getState();
          const files = state.files;
          if (files.length <= 1) return;
          const idx = files.findIndex((f) => f.id === state.activeFileId);
          state.switchTab(files[(idx + 1) % files.length].id);
          break;
        }
        case "prevTab": {
          const state = useTabStore.getState();
          const files = state.files;
          if (files.length <= 1) return;
          const idx = files.findIndex((f) => f.id === state.activeFileId);
          state.switchTab(files[(idx - 1 + files.length) % files.length].id);
          break;
        }
        case "settings": useThemeStore.getState().openSettingsTab(); break;
        case "find": useSearchStore.getState().toggleSearch(false); break;
        case "replace": useSearchStore.getState().toggleSearch(true); break;
        case "outline": useThemeStore.getState().toggleOutline(); break;
        case "aiSidebar": useThemeStore.getState().toggleAISidebar(); break;
        case "fullscreen": { const appWindow = getCurrentWindow(); appWindow.isFullscreen().then((fs) => appWindow.setFullscreen(!fs)); break; }
        case "devtools": invoke("toggle_devtools"); break;
        case "undo": {
          const activeId = useTabStore.getState().activeFileId;
          useTabStore.getState().editorActionMap.get(activeId)?.undo?.();
          break;
        }
        case "redo": {
          const activeId = useTabStore.getState().activeFileId;
          useTabStore.getState().editorActionMap.get(activeId)?.redo?.();
          break;
        }
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
    <I18nProvider language={language}>
    <div
      className="h-full w-full flex flex-col overflow-hidden"
      data-app-theme={resolveAppTheme(appTheme)}
      data-editor-theme={editorTheme}
    >
      <TitleBar />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {showOutline && !(showSettingsTab && settingsTabActive) && <OutlineSidebar />}
        <div
          className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden"
          style={{ display: showSettingsTab && settingsTabActive ? "none" : undefined }}
        >
          <ErrorBoundary>
            <Editor />
          </ErrorBoundary>
        </div>
        {showSettingsTab && settingsTabActive && <SettingsPanel />}
        {showAISidebar && !(showSettingsTab && settingsTabActive) && <Suspense fallback={null}><AISidebar /></Suspense>}
      </div>
      <StatusBar />
      <ConfirmCloseDialog />
      <UpdateDialog />
      <ToastContainer />
    </div>
    </I18nProvider>
  );
}

export default App;
