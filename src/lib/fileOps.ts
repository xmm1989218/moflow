import { open, save, ask } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { useAppStore, type CloseDialogResult } from "../stores/appStore";
import { exportAsHtml } from "./exportHtml";
import { showConfirmCloseDialog } from "../components/ConfirmCloseDialog/ConfirmCloseDialog";
import { invoke } from "@tauri-apps/api/core";

export async function openFile() {
  const selected = await open({
    multiple: false,
    filters: [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }],
  });

  if (!selected) return;

  const existing = useAppStore.getState().findTabByPath(selected);
  if (existing) {
    useAppStore.getState().switchTab(existing.id);
    return;
  }

  const data = await readFile(selected);
  const content = new TextDecoder("utf-8").decode(data);
  const fileName = selected.split(/[/\\]/).pop() || "Untitled.md";

  useAppStore.getState().openTab({
    filePath: selected,
    fileName,
    content,
    isModified: false,
  });
}

export async function saveFile() {
  const state = useAppStore.getState();
  const file = state.getActiveFile();

  if (!file.filePath) {
    await saveFileAs();
    return;
  }

  const data = new TextEncoder().encode(file.content);
  await writeFile(file.filePath, data);
  state.updateTabMeta(file.id, { isModified: false, lastSavedContent: file.content });
}

export async function saveFileAs() {
  const state = useAppStore.getState();
  const file = state.getActiveFile();
  const editorTheme = state.editorTheme;

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
    const bodyHtml = state.getEditorHTML ? state.getEditorHTML() : "";
    const html = exportAsHtml(bodyHtml, editorTheme);
    const data = new TextEncoder().encode(html);
    await writeFile(selected, data);
    state.updateTabMeta(file.id, { isModified: false, lastSavedContent: file.content });
  } else {
    const data = new TextEncoder().encode(file.content);
    await writeFile(selected, data);
    const fileName = selected.split(/[/\\]/).pop() || "Untitled.md";
    state.updateTabMeta(file.id, { filePath: selected, fileName, isModified: false, lastSavedContent: file.content });
  }
}

export async function exportHtml() {
  const state = useAppStore.getState();
  const file = state.getActiveFile();
  const editorTheme = state.editorTheme;
  const getEditorHTML = state.getEditorHTML;

  const selected = await save({
    defaultPath: file.fileName.replace(/\.md$/, ".html"),
    filters: [{ name: "HTML", extensions: ["html"] }],
  });

  if (!selected) return;

  const bodyHtml = getEditorHTML ? getEditorHTML() : "";
  const html = exportAsHtml(bodyHtml, editorTheme);
  await writeFile(selected, new TextEncoder().encode(html));
}

export async function exportPdf() {
  const state = useAppStore.getState();
  const file = state.getActiveFile();
  const getEditorHTML = state.getEditorHTML;
  const editorTheme = state.editorTheme;

  const selected = await save({
    defaultPath: file.fileName.replace(/\.md$/, ".pdf"),
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });

  if (!selected) return;

  const bodyHtml = getEditorHTML ? getEditorHTML() : "";
  const html = exportAsHtml(bodyHtml, editorTheme);

  const ok: boolean = await invoke("export_pdf", { html, path: selected });
  if (!ok) {
    console.error("PDF export failed");
  }
}

export async function loadFileByPath(filePath: string) {
  const existing = useAppStore.getState().findTabByPath(filePath);
  if (existing) {
    useAppStore.getState().switchTab(existing.id);
    return;
  }

  const data = await readFile(filePath);
  const content = new TextDecoder("utf-8").decode(data);
  const fileName = filePath.split(/[/\\]/).pop() || "Untitled.md";
  useAppStore.getState().openTab({
    filePath,
    fileName,
    content,
    isModified: false,
  });
}

export async function confirmUnsaved(action: string): Promise<boolean> {
  const file = useAppStore.getState().getActiveFile();
  if (!file.isModified) return true;
  return ask(`当前文件有未保存的修改，${action}？`, {
    title: "MoFlow",
    kind: "warning",
    okLabel: action,
    cancelLabel: "取消",
  });
}

export async function confirmCloseTab(fileName: string, _hasFilePath: boolean): Promise<CloseDialogResult> {
  return showConfirmCloseDialog(`「${fileName}」有未保存的修改，是否保存？`);
}

export async function confirmCloseWindow(): Promise<boolean> {
  const state = useAppStore.getState();
  const modifiedTabs = state.files.filter((f) => f.isModified);

  if (modifiedTabs.length === 0) return true;

  const message =
    modifiedTabs.length === 1
      ? `「${modifiedTabs[0].fileName}」有未保存的修改，是否保存？`
      : `以下文件有未保存的修改：${modifiedTabs.map((f) => f.fileName).join("、")}。是否保存？`;

  const result = await showConfirmCloseDialog(message);

  if (result === "cancel") return false;

  if (result === "save") {
    const prevActive = state.activeFileId;
    for (const tab of modifiedTabs) {
      state.switchTab(tab.id);
      if (tab.filePath) {
        await saveFile();
      } else {
        await saveFileAs();
      }
    }
    if (prevActive !== useAppStore.getState().activeFileId) {
      const current = useAppStore.getState();
      const prev = current.files.find((f) => f.id === prevActive);
      if (prev) current.switchTab(prevActive);
    }
  }

  return true;
}
