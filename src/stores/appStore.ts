import { create } from "zustand";

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
}

function createTab(overrides?: Partial<Omit<TabState, "id">>): TabState {
  return {
    id: crypto.randomUUID(),
    filePath: null,
    fileName: "Untitled.md",
    content: "",
    lastSavedContent: "",
    isModified: false,
    mode: "wysiwyg",
    ...overrides,
  };
}

export type CloseDialogResult = "save" | "discard" | "cancel";

interface CloseDialogState {
  visible: boolean;
  message: string;
}

interface AppState {
  files: TabState[];
  activeFileId: string;
  appTheme: AppTheme;
  editorTheme: EditorTheme;
  showStatusBar: boolean;
  showAISidebar: boolean;
  autoSave: boolean;
  closeDialog: CloseDialogState;
  getEditorHTML: (() => string) | null;

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
  toggleAutoSave: () => void;
  newFile: () => string;
  showCloseDialog: (message: string) => void;
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
  autoSave: localStorage.getItem("moflow-autoSave") !== "false",
  closeDialog: { visible: false, message: "" },
  getEditorHTML: null,

  openTab: (overrides) => {
    const tab = createTab(overrides);
    set((state) => ({
      files: [...state.files, tab],
      activeFileId: tab.id,
    }));
    document.title = `${tab.fileName} - MoFlow`;
    return tab.id;
  },

  closeTab: (id) => {
    const state = get();
    const idx = state.files.findIndex((f) => f.id === id);
    if (idx === -1) return;

    const newFiles = state.files.filter((f) => f.id !== id);

    if (newFiles.length === 0) {
      const tab = createTab();
      set({ files: [tab], activeFileId: tab.id });
      document.title = `${tab.fileName} - MoFlow`;
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
  },

  switchTab: (id) => {
    const state = get();
    if (id === state.activeFileId) return;
    const tab = state.files.find((f) => f.id === id);
    if (!tab) return;
    set({ activeFileId: id });
    document.title = `${tab.fileName}${tab.isModified ? "*" : ""} - MoFlow`;
  },

  updateTabContent: (id, content) => {
    set((state) => ({
      files: state.files.map((f) =>
        f.id === id
          ? { ...f, content, isModified: content !== f.lastSavedContent }
          : f
      ),
    }));
  },

  updateTabMeta: (id, meta) => {
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
    const state = get();
    if (id === state.activeFileId) {
      const tab = state.files.find((f) => f.id === id);
      if (tab) {
        document.title = `${tab.fileName}${tab.isModified ? "*" : ""} - MoFlow`;
      }
    }
  },

  getActiveFile: () => {
    const state = get();
    return state.files.find((f) => f.id === state.activeFileId)!;
  },

  findTabByPath: (filePath) => {
    return get().files.find((f) => f.filePath === filePath);
  },

  setAppTheme: (appTheme) => set({ appTheme }),
  setEditorTheme: (editorTheme) => set({ editorTheme }),

  toggleStatusBar: () =>
    set((state) => ({ showStatusBar: !state.showStatusBar })),

  toggleAISidebar: () =>
    set((state) => ({ showAISidebar: !state.showAISidebar })),

  toggleAutoSave: () =>
    set((state) => {
      const next = !state.autoSave;
      localStorage.setItem("moflow-autoSave", String(next));
      return { autoSave: next };
    }),

  newFile: () => {
    return get().openTab();
  },

  showCloseDialog: (message) => {
    set({ closeDialog: { visible: true, message } });
  },

  hideCloseDialog: () => {
    set({ closeDialog: { visible: false, message: "" } });
  },

  setGetEditorHTML: (fn) => {
    set({ getEditorHTML: fn });
  },
}));
