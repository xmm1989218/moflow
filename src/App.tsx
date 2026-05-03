import { useEffect } from "react";
import Editor from "./components/Editor/Editor";
import StatusBar from "./components/StatusBar/StatusBar";
import TitleBar from "./components/TitleBar/TitleBar";
import AISidebar from "./components/AISidebar/AISidebar";
import { useAppStore, resolveAppTheme } from "./stores/appStore";
import { openFile, saveFile, saveFileAs, confirmUnsaved } from "./lib/fileOps";
import { getCurrentWindow } from "@tauri-apps/api/window";

function App() {
  const appTheme = useAppStore((s) => s.appTheme);
  const editorTheme = useAppStore((s) => s.editorTheme);
  const showAISidebar = useAppStore((s) => s.showAISidebar);
  const newFile = useAppStore((s) => s.newFile);


  useEffect(() => {
    const resolved = resolveAppTheme(appTheme);
    document.documentElement.setAttribute("data-app-theme", resolved);
  }, [appTheme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-editor-theme", editorTheme);
  }, [editorTheme]);

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
    const unlisten = getCurrentWindow().onCloseRequested((event) => {
      const isModified = useAppStore.getState().file.isModified;
      if (isModified) {
        event.preventDefault();
        confirmUnsaved("不保存并关闭").then((yes) => {
          if (yes) getCurrentWindow().destroy();
        });
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    function handleDrop(e: DragEvent) {
      e.preventDefault();
      if (!e.dataTransfer?.files.length) return;

      const file = e.dataTransfer.files[0];
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!["md", "markdown", "txt"].includes(ext || "")) return;

      confirmUnsaved("加载新文件").then((ok) => {
        if (!ok) return;
        const reader = new FileReader();
        reader.onload = () => {
          const content = reader.result as string;
          const { setFile } = useAppStore.getState();
          setFile({
            filePath: null,
            fileName: file.name,
            content,
            isModified: false,
          });
        };
        reader.readAsText(file);
      });
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
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key === "o") {
        e.preventDefault();
        confirmUnsaved("打开新文件").then((ok) => { if (ok) openFile(); });
      } else if (mod && e.key === "s" && !e.shiftKey) {
        e.preventDefault();
        saveFile();
      } else if (mod && e.key === "s" && e.shiftKey) {
        e.preventDefault();
        saveFileAs();
      } else if (mod && e.key === "n") {
        e.preventDefault();
        confirmUnsaved("新建文件").then((ok) => { if (ok) newFile(); });
      } else if (e.key === "F11") {
        e.preventDefault();
        const appWindow = getCurrentWindow();
        appWindow.isFullscreen().then((fs) => appWindow.setFullscreen(!fs));
      } else if (e.key === "F12") {
        e.preventDefault();
        const appWindow = getCurrentWindow();
        // @ts-expect-error Tauri devtools API
        appWindow.openDevtools();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [newFile]);

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
    </div>
  );
}

export default App;
