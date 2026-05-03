import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { useAppStore, type CloseDialogResult, deleteUntitledContent, deleteSession } from "../stores/appStore";
import type { TabState } from "../stores/appStore";
import { exportAsHtml } from "./exportHtml";
import { showConfirmCloseDialog, showAlertDialog } from "./closeDialog";
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
    lastSavedContent: content,
    isModified: false,
    contentLoaded: true,
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

  try {
    const data = await readFile(filePath);
    const content = new TextDecoder("utf-8").decode(data);
    const fileName = filePath.split(/[/\\]/).pop() || "Untitled.md";
    useAppStore.getState().openTab({
      filePath,
      fileName,
      content,
      lastSavedContent: content,
      isModified: false,
      contentLoaded: true,
    });
  } catch {
    console.error("Failed to open file:", filePath);
  }
}

export async function loadTabContent(id: string) {
  const state = useAppStore.getState();
  const tab = state.files.find((f) => f.id === id);
  if (!tab || !tab.filePath) return;

  try {
    const data = await readFile(tab.filePath);
    const content = new TextDecoder("utf-8").decode(data);
    state.updateTabMeta(id, {
      content,
      lastSavedContent: content,
      contentLoaded: true,
      isModified: false,
    });
  } catch {
    await showAlertDialog(`文件「${tab.fileName}」已不存在或已被移动。`);
    state.closeTab(id);
  }
}

export async function confirmUnsaved(action: string): Promise<boolean> {
  const file = useAppStore.getState().getActiveFile();
  if (file.filePath === null && file.content.length > 0) {
    const result = await showConfirmCloseDialog(`草稿内容未保存，是否保存？`);
    if (result === "cancel") return false;
    if (result === "save") {
      await saveFileAs();
      const saved = useAppStore.getState().files.find((f) => f.id === file.id);
      if (!saved?.filePath) return false;
    }
    return true;
  }
  if (!file.isModified) return true;
  const result = await showConfirmCloseDialog(`「${file.fileName}」有未保存的修改，${action}？`);
  if (result === "cancel") return false;
  if (result === "save") await saveFile();
  return true;
}

export async function confirmCloseTab(message: string): Promise<CloseDialogResult> {
  return showConfirmCloseDialog(message);
}

export async function closeLastTab(tab: TabState) {
  const needConfirm = tab.isModified || (tab.filePath === null && tab.content.length > 0);

  if (needConfirm) {
    const message = tab.filePath === null
      ? "草稿内容未保存，是否保存？"
      : `「${tab.fileName}」有未保存的修改，是否保存？`;
    const result = await showConfirmCloseDialog(message);
    if (result === "cancel") return;

    if (result === "save") {
      if (tab.filePath) {
        try {
          await writeFile(tab.filePath, new TextEncoder().encode(tab.content));
        } catch {
          return;
        }
      } else {
        const selected = await save({
          defaultPath: tab.fileName,
          filters: [{ name: "Markdown", extensions: ["md"] }],
        });
        if (!selected) return;
        try {
          await writeFile(selected, new TextEncoder().encode(tab.content));
        } catch {
          return;
        }
      }
    }
  }

  if (tab.filePath === null) {
    await deleteUntitledContent(tab.id);
  }
  await deleteSession();

  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  getCurrentWindow().destroy();
}

export async function saveAllFiles() {
  const state = useAppStore.getState();
  for (const tab of state.files) {
    if (tab.filePath && tab.isModified) {
      try {
        const data = new TextEncoder().encode(tab.content);
        await writeFile(tab.filePath, data);
        state.updateTabMeta(tab.id, { isModified: false, lastSavedContent: tab.content });
      } catch (e) {
        console.error("Failed to save file:", tab.filePath, e);
      }
    }
  }
  const { flushAllUntitled, persistSessionFromStore } = await import("../stores/appStore");
  await flushAllUntitled();
  await persistSessionFromStore();
}
