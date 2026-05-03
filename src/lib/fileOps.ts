import { open, save, ask } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { useAppStore } from "../stores/appStore";
import { exportAsHtml } from "./exportHtml";
import { getCurrentWindow } from "@tauri-apps/api/window";

export async function openFile() {
  const selected = await open({
    multiple: false,
    filters: [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }],
  });

  if (!selected) return;

  const data = await readFile(selected);
  const content = new TextDecoder("utf-8").decode(data);
  const fileName = selected.split(/[/\\]/).pop() || "Untitled.md";

  useAppStore.getState().setFile({
    filePath: selected,
    fileName,
    content,
    isModified: false,
  });

  document.title = `${fileName} - MoFlow`;
}

export async function saveFile() {
  const { file, setFile } = useAppStore.getState();

  if (!file.filePath) {
    await saveFileAs();
    return;
  }

  const data = new TextEncoder().encode(file.content);
  await writeFile(file.filePath, data);
  setFile({ isModified: false, lastSavedContent: file.content });
}

export async function saveFileAs() {
  const { file, setFile, editorTheme } = useAppStore.getState();

  const selected = await save({
    defaultPath: file.fileName,
    filters: [
      { name: "Markdown", extensions: ["md"] },
      { name: "HTML", extensions: ["html"] },
    ],
  });

  if (!selected) return;

  const ext = selected.split(".").pop()?.toLowerCase();

  if (ext === "html") {
    const html = exportAsHtml(file.content, editorTheme);
    const data = new TextEncoder().encode(html);
    await writeFile(selected, data);
    setFile({ isModified: false, lastSavedContent: file.content });
  } else {
    const data = new TextEncoder().encode(file.content);
    await writeFile(selected, data);
    const fileName = selected.split(/[/\\]/).pop() || "Untitled.md";
    setFile({ filePath: selected, fileName, isModified: false, lastSavedContent: file.content });
    document.title = `${fileName} - MoFlow`;
  }
}

export async function exportHtml() {
  const { file, editorTheme } = useAppStore.getState();

  const selected = await save({
    defaultPath: file.fileName.replace(/\.md$/, ".html"),
    filters: [{ name: "HTML", extensions: ["html"] }],
  });

  if (!selected) return;

  const html = exportAsHtml(file.content, editorTheme);
  await writeFile(selected, new TextEncoder().encode(html));
}

export async function exportPdf() {
  const mainWindow = getCurrentWindow();
  // @ts-expect-error Tauri print API
  await mainWindow.print();}

export async function loadFileByPath(filePath: string) {
  const data = await readFile(filePath);
  const content = new TextDecoder("utf-8").decode(data);
  const fileName = filePath.split(/[/\\]/).pop() || "Untitled.md";
  useAppStore.getState().setFile({
    filePath,
    fileName,
    content,
    isModified: false,
  });
  document.title = `${fileName} - MoFlow`;
}

export async function confirmUnsaved(action: string): Promise<boolean> {
  const isModified = useAppStore.getState().file.isModified;
  if (!isModified) return true;
  return ask(`当前文件有未保存的修改，${action}？`, {
    title: "MoFlow",
    kind: "warning",
    okLabel: action,
    cancelLabel: "取消",
  });
}
