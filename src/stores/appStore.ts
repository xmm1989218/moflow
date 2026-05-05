import { create } from "zustand";
import { appDataDir, join } from "@tauri-apps/api/path";
import { readFile, writeFile, mkdir, remove, exists } from "@tauri-apps/plugin-fs";
import { useChatStore } from "./chatStore";
import {
  readSettings,
  writeSettings,
  type UpdateChannel,
} from "../lib/settings";

export type AppTheme = "system" | "light" | "dark";
export type EditorTheme = "github" | "github-dark" | "nord" | "nord-dark" | "catppuccin-latte" | "catppuccin-mocha";

export const EDITOR_THEMES: { id: EditorTheme; label: string }[] = [
  { id: "github", label: "GitHub Light" },
  { id: "github-dark", label: "GitHub Dark" },
  { id: "nord", label: "Nord Light" },
  { id: "nord-dark", label: "Nord Dark" },
  { id: "catppuccin-latte", label: "Catppuccin Latte" },
  { id: "catppuccin-mocha", label: "Catppuccin Mocha" },
];

export function resolveAppTheme(appTheme: AppTheme): "light" | "dark" {
  if (appTheme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return appTheme;
}

export type EditorMode = "wysiwyg" | "source";

export interface TabState {
  id: string;
  filePath: string | null;
  fileName: string;
  content: string;
  lastSavedContent: string;
  isModified: boolean;
  mode: EditorMode;
  contentLoaded: boolean;
}

function createTab(overrides?: Partial<TabState & { id: string }>): TabState {
  return {
    id: crypto.randomUUID(),
    filePath: null,
    fileName: "Untitled.md",
    content: "",
    lastSavedContent: "",
    isModified: false,
    mode: "wysiwyg",
    contentLoaded: true,
    ...overrides,
  };
}

export type CloseDialogResult = "save" | "discard" | "cancel";
export type DialogMode = "confirm-close" | "alert";

interface CloseDialogState {
  visible: boolean;
  message: string;
  mode: DialogMode;
}

interface SessionTab {
  tabId?: string;
  untitledId?: string;
  filePath: string | null;
  fileName: string;
  mode: EditorMode;
}

interface SessionData {
  tabs: SessionTab[];
  activeTabId?: string;
  activeFilePath?: string | null;
  activeUntitledId?: string;
}

async function writeUntitledContent(tabId: string, content: string) {
  try {
    const dir = await appDataDir();
    const untitledDir = await join(dir, "untitled");
    if (!(await exists(untitledDir))) {
      await mkdir(untitledDir, { recursive: true });
    }
    const filePath = await join(dir, "untitled", `${tabId}.md`);
    await writeFile(filePath, new TextEncoder().encode(content));
  } catch (e) {
    console.error("writeUntitledContent error:", e);
  }
}

async function readUntitledContent(tabId: string): Promise<string | null> {
  try {
    const dir = await appDataDir();
    const filePath = await join(dir, "untitled", `${tabId}.md`);
    const data = await readFile(filePath);
    return new TextDecoder().decode(data);
  } catch {
    return null;
  }
}

export async function deleteUntitledContent(tabId: string) {
  try {
    const dir = await appDataDir();
    const filePath = await join(dir, "untitled", `${tabId}.md`);
    await remove(filePath);
  } catch { /* file may not exist */ }
}

export async function deleteSession() {
  try {
    const dir = await appDataDir();
    const sessionPath = await join(dir, "session.json");
    if (await exists(sessionPath)) {
      await remove(sessionPath);
    }
  } catch { /* ignore */ }
}

async function persistSession(files: TabState[], activeFileId: string) {
  try {
    const session: SessionData = {
      tabs: files.map((tab) => ({
        tabId: tab.id,
        filePath: tab.filePath,
        fileName: tab.fileName,
        mode: tab.mode,
      })),
      activeTabId: activeFileId,
    };

    const dir = await appDataDir();
    if (!(await exists(dir))) {
      await mkdir(dir, { recursive: true });
    }
    const json = JSON.stringify(session);
    await writeFile(await join(dir, "session.json"), new TextEncoder().encode(json));
  } catch (e) {
    console.error("[persistSession] error:", e);
  }
}

async function restoreSession(): Promise<{ files: TabState[]; activeFileId: string } | null> {
  try {
    const dir = await appDataDir();
    const sessionPath = await join(dir, "session.json");
    if (!(await exists(sessionPath))) {
      return null;
    }

    const data = await readFile(sessionPath);
    const session: SessionData = JSON.parse(new TextDecoder().decode(data));
    if (!session.tabs || session.tabs.length === 0) return null;

    const tabs: TabState[] = [];
    for (const st of session.tabs) {
      const tabId = st.tabId || st.untitledId;

      if (st.filePath) {
        tabs.push(
          createTab({
            id: tabId,
            filePath: st.filePath,
            fileName: st.fileName,
            mode: st.mode,
            content: "",
            lastSavedContent: "",
            isModified: false,
            contentLoaded: false,
          })
        );
      } else {
        const content = tabId ? (await readUntitledContent(tabId)) ?? "" : "";
        tabs.push(
          createTab({
            id: tabId,
            filePath: null,
            fileName: st.fileName,
            mode: st.mode,
            content,
            lastSavedContent: content,
            isModified: false,
            contentLoaded: true,
          })
        );
      }
    }

    let activeFileId = tabs[0].id;
    if (session.activeTabId) {
      const found = tabs.find((t) => t.id === session.activeTabId);
      if (found) activeFileId = found.id;
    } else if (session.activeFilePath) {
      const found = tabs.find((t) => t.filePath === session.activeFilePath);
      if (found) activeFileId = found.id;
    } else if (session.activeUntitledId) {
      const found = tabs.find((t) => t.id === session.activeUntitledId);
      if (found) activeFileId = found.id;
    }

    return { files: tabs, activeFileId };
  } catch (e) {
    console.error("restoreSession error:", e);
    return null;
  }
}

const untitledTimers = new Map<string, ReturnType<typeof setTimeout>>();

function persistSettings(get: () => AppState) {
  const s = get();
  writeSettings({
    appTheme: s.appTheme,
    editorTheme: s.editorTheme,
    autoSave: s.autoSave,
    showStatusBar: s.showStatusBar,
    sidebarWidth: s.sidebarWidth,
    updateChannel: s.updateChannel,
  });
}

interface AppState {
  files: TabState[];
  activeFileId: string;
  appTheme: AppTheme;
  editorTheme: EditorTheme;
  showStatusBar: boolean;
  showAISidebar: boolean;
  sidebarWidth: number;
  autoSave: boolean;
  updateChannel: UpdateChannel;
  closeDialog: CloseDialogState;
  getEditorHTML: (() => string) | null;
  sessionInitialized: boolean;

  openTab: (overrides?: Partial<Omit<TabState, "id">>) => string;
  closeTab: (id: string) => void;
  switchTab: (id: string) => void;
  updateTabContent: (id: string, content: string) => void;
  updateTabMeta: (id: string, meta: Partial<TabState>) => void;
  getActiveFile: () => TabState;
  findTabByPath: (filePath: string) => TabState | undefined;
  setAppTheme: (theme: AppTheme) => void;
  setEditorTheme: (theme: EditorTheme) => void;
  toggleStatusBar: () => void;
  toggleAISidebar: () => void;
  setSidebarWidth: (w: number) => void;
  toggleAutoSave: () => void;
  setUpdateChannel: (channel: UpdateChannel) => void;
  newFile: () => string;
  showCloseDialog: (message: string) => void;
  showAlertDialog: (message: string) => void;
  hideCloseDialog: () => void;
  setGetEditorHTML: (fn: (() => string) | null) => void;
}

const initialTab = createTab();

export const useAppStore = create<AppState>((set, get) => ({
  files: [initialTab],
  activeFileId: initialTab.id,
  appTheme: "system",
  editorTheme: "github",
  showStatusBar: true,
  showAISidebar: false,
  sidebarWidth: 360,
  autoSave: false,
  updateChannel: "stable",
  closeDialog: { visible: false, message: "", mode: "confirm-close" },
  getEditorHTML: null,
  sessionInitialized: false,

  openTab: (overrides) => {
    const tab = createTab(overrides);
    set((state) => ({
      files: [...state.files, tab],
      activeFileId: tab.id,
    }));
    document.title = `${tab.fileName} - MoFlow`;
    if (tab.filePath === null) {
      writeUntitledContent(tab.id, tab.content);
    }
    const state = get();
    persistSession(state.files, state.activeFileId);
    return tab.id;
  },

  closeTab: (id) => {
    const state = get();
    const idx = state.files.findIndex((f) => f.id === id);
    if (idx === -1) return;

    const tab = state.files.find((f) => f.id === id);
    if (tab && tab.filePath === null) {
      deleteUntitledContent(id);
    }

    import("../lib/chatPersistence").then(({ removeChat }) => removeChat(id));
    useChatStore.getState().deleteChat(id);

    const newFiles = state.files.filter((f) => f.id !== id);

    if (newFiles.length === 0) {
      const newTab = createTab();
      set({ files: [newTab], activeFileId: newTab.id });
      document.title = `${newTab.fileName} - MoFlow`;
      persistSession([newTab], newTab.id);
      return;
    }

    let newActiveId = state.activeFileId;
    if (id === state.activeFileId) {
      const newIdx = Math.min(idx, newFiles.length - 1);
      newActiveId = newFiles[newIdx].id;
    }

    set({ files: newFiles, activeFileId: newActiveId });

    if (newActiveId !== state.activeFileId || id === state.activeFileId) {
      const active = newFiles.find((f) => f.id === newActiveId);
      if (active) {
        document.title = `${active.fileName}${active.isModified ? "*" : ""} - MoFlow`;
      }
    }
    persistSession(newFiles, newActiveId);
  },

  switchTab: (id) => {
    const state = get();
    if (id === state.activeFileId) return;
    const tab = state.files.find((f) => f.id === id);
    if (!tab) return;
    set({ activeFileId: id });
    document.title = `${tab.fileName}${tab.isModified ? "*" : ""} - MoFlow`;
    persistSession(get().files, id);

    if (!tab.contentLoaded && tab.filePath) {
      import("../lib/fileOps").then(({ loadTabContent }) => {
        loadTabContent(id);
      });
    }
  },

  updateTabContent: (id, content) => {
    set((state) => ({
      files: state.files.map((f) =>
        f.id === id
          ? { ...f, content, isModified: content !== f.lastSavedContent }
          : f
      ),
    }));

    const state = get();
    const tab = state.files.find((f) => f.id === id);
    if (tab && tab.filePath === null) {
      if (untitledTimers.has(id)) clearTimeout(untitledTimers.get(id));
      untitledTimers.set(
        id,
        setTimeout(() => {
          const s = get();
          const t = s.files.find((f) => f.id === id);
          if (t && t.filePath === null) {
            writeUntitledContent(id, t.content);
          }
          untitledTimers.delete(id);
        }, 3000)
      );
    }
  },

  updateTabMeta: (id, meta) => {
    const prevTab = get().files.find((f) => f.id === id);

    set((state) => ({
      files: state.files.map((f) => {
        if (f.id !== id) return f;
        const merged = { ...f, ...meta };
        if (meta.content !== undefined) {
          merged.lastSavedContent = meta.content;
          merged.isModified = false;
        }
        return merged;
      }),
    }));

    if (prevTab && prevTab.filePath === null && meta.filePath) {
      deleteUntitledContent(id);
    }

    const state = get();
    if (id === state.activeFileId) {
      const tab = state.files.find((f) => f.id === id);
      if (tab) {
        document.title = `${tab.fileName}${tab.isModified ? "*" : ""} - MoFlow`;
      }
    }
    persistSession(state.files, state.activeFileId);
  },

  getActiveFile: () => {
    const state = get();
    return state.files.find((f) => f.id === state.activeFileId)!;
  },

  findTabByPath: (filePath) => {
    return get().files.find((f) => f.filePath === filePath);
  },

  setAppTheme: (appTheme) => {
    set({ appTheme });
    persistSettings(get);
  },

  setEditorTheme: (editorTheme) => {
    set({ editorTheme });
    persistSettings(get);
  },

  toggleStatusBar: () => {
    set((state) => ({ showStatusBar: !state.showStatusBar }));
    persistSettings(get);
  },

  toggleAISidebar: () =>
    set((state) => ({ showAISidebar: !state.showAISidebar })),

  setSidebarWidth: (w) => {
    set({ sidebarWidth: w });
    persistSettings(get);
  },

  toggleAutoSave: () => {
    set((state) => ({ autoSave: !state.autoSave }));
    persistSettings(get);
  },

  setUpdateChannel: (channel) => {
    set({ updateChannel: channel });
    persistSettings(get);
  },

  newFile: () => {
    return get().openTab();
  },

  showCloseDialog: (message) => {
    set({ closeDialog: { visible: true, message, mode: "confirm-close" } });
  },

  showAlertDialog: (message) => {
    set({ closeDialog: { visible: true, message, mode: "alert" } });
  },

  hideCloseDialog: () => {
    set({ closeDialog: { visible: false, message: "", mode: "confirm-close" } });
  },

  setGetEditorHTML: (fn) => {
    set({ getEditorHTML: fn });
  },
}));

export async function initSession() {
  const settings = await readSettings();
  useAppStore.setState({
    appTheme: settings.appTheme,
    editorTheme: settings.editorTheme,
    autoSave: settings.autoSave,
    showStatusBar: settings.showStatusBar,
    sidebarWidth: settings.sidebarWidth,
    updateChannel: settings.updateChannel,
  });

  const restored = await restoreSession();
  if (restored) {
    useAppStore.setState({
      files: restored.files,
      activeFileId: restored.activeFileId,
      sessionInitialized: true,
    });

    const activeTab = restored.files.find((f) => f.id === restored.activeFileId);
    if (activeTab && !activeTab.contentLoaded && activeTab.filePath) {
      const { loadTabContent } = await import("../lib/fileOps");
      loadTabContent(activeTab.id);
    }
  } else {
    useAppStore.setState({ sessionInitialized: true });
  }

  const state = useAppStore.getState();
  await persistSession(state.files, state.activeFileId);
}

export async function flushAllUntitled() {
  const state = useAppStore.getState();
  for (const tab of state.files) {
    if (tab.filePath === null && tab.content.length > 0) {
      await writeUntitledContent(tab.id, tab.content);
    }
  }
}

export async function persistSessionFromStore() {
  const state = useAppStore.getState();
  await persistSession(state.files, state.activeFileId);
}
