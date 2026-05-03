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

interface FileState {
  filePath: string | null;
  fileName: string;
  content: string;
  lastSavedContent: string;
  isModified: boolean;
}

export type EditorMode = "wysiwyg" | "source";

interface AppState {
  file: FileState;
  appTheme: AppTheme;
  editorTheme: EditorTheme;
  mode: EditorMode;
  showStatusBar: boolean;
  showAISidebar: boolean;

  setFile: (file: Partial<FileState>) => void;
  setContent: (content: string) => void;
  setAppTheme: (theme: AppTheme) => void;
  setEditorTheme: (theme: EditorTheme) => void;
  setMode: (mode: EditorMode) => void;
  toggleStatusBar: () => void;
  toggleAISidebar: () => void;
  newFile: () => void;
}

const defaultFile: FileState = {
  filePath: null,
  fileName: "Untitled.md",
  content: "",
  lastSavedContent: "",
  isModified: false,
};

export const useAppStore = create<AppState>((set) => ({
  file: { ...defaultFile },
  appTheme: "system",
  editorTheme: "github",
  mode: "wysiwyg",
  showStatusBar: true,
  showAISidebar: false,

  setFile: (file) =>
    set((state) => {
      const merged = { ...state.file, ...file };
      if (file.content !== undefined) {
        merged.lastSavedContent = file.content;
        merged.isModified = false;
      }
      return { file: merged };
    }),

  setContent: (content) =>
    set((state) => ({
      file: {
        ...state.file,
        content,
        isModified: content !== state.file.lastSavedContent,
      },
    })),

  setAppTheme: (appTheme) => set({ appTheme }),

  setEditorTheme: (editorTheme) => set({ editorTheme }),

  setMode: (mode) => set({ mode }),

  toggleStatusBar: () =>
    set((state) => ({ showStatusBar: !state.showStatusBar })),

  toggleAISidebar: () =>
    set((state) => ({ showAISidebar: !state.showAISidebar })),

  newFile: () => set({ file: { ...defaultFile } }),
}));
