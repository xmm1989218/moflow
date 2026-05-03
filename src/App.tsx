import { useEffect } from "react";
import Editor from "./components/Editor/Editor";
import StatusBar from "./components/StatusBar/StatusBar";
import { useAppStore, type ThemeName } from "./stores/appStore";
import { openFile, saveFile, saveFileAs, exportHtml, exportPdf, confirmUnsaved } from "./lib/fileOps";
import { getCurrentWindow } from "@tauri-apps/api/window";

function App() {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const newFile = useAppStore((s) => s.newFile);
  const toggleStatusBar = useAppStore((s) => s.toggleStatusBar);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    const unlisten = getCurrentWindow().listen<string>("moflow-menu", (event) => {
      const id = event.payload;
      if (id.startsWith("theme_")) {
        setTheme(id.slice(6).replace(/_/g, "-") as ThemeName);
        return;
      }
      switch (id) {
        case "new":
          confirmUnsaved("新建文件").then((ok) => { if (ok) newFile(); });
          break;
        case "open":
          confirmUnsaved("打开新文件").then((ok) => { if (ok) openFile(); });
          break;
        case "save":
          saveFile();
          break;
        case "save_as":
          saveFileAs();
          break;
        case "toggle_statusbar":
          toggleStatusBar();
          break;
        case "export_html":
          exportHtml();
          break;
        case "export_pdf":
          exportPdf();
          break;
        case "close":
          getCurrentWindow().close();
          break;
        case "fullscreen":
          getCurrentWindow().isFullscreen().then((fs) => {
            getCurrentWindow().setFullscreen(!fs);
          });
          break;
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [newFile, toggleStatusBar, setTheme]);

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
          document.title = `${file.name} - MoFlow`;
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
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [newFile]);

  return (
    <div className="h-full w-full flex flex-col overflow-hidden" data-theme={theme}>
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Editor />
      </div>
      <StatusBar />
    </div>
  );
}

export default App;
