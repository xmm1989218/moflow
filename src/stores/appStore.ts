import { create } from "zustand";

export type ThemeName = "github" | "github-dark" | "nord" | "nord-dark" | "catppuccin-latte" | "catppuccin-mocha";

export const THEMES: { id: ThemeName; label: string }[] = [
  { id: "github", label: "GitHub Light" },
  { id: "github-dark", label: "GitHub Dark" },
  { id: "nord", label: "Nord Light" },
  { id: "nord-dark", label: "Nord Dark" },
  { id: "catppuccin-latte", label: "Catppuccin Latte" },
  { id: "catppuccin-mocha", label: "Catppuccin Mocha" },
];

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
  theme: ThemeName;
  mode: EditorMode;
  showStatusBar: boolean;

  setFile: (file: Partial<FileState>) => void;
  setContent: (content: string) => void;
  setTheme: (theme: ThemeName) => void;
  setMode: (mode: EditorMode) => void;
  toggleStatusBar: () => void;
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
  theme: "github",
  mode: "wysiwyg",
  showStatusBar: true,

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

  setTheme: (theme) => set({ theme }),

  setMode: (mode) => set({ mode }),

  toggleStatusBar: () =>
    set((state) => ({ showStatusBar: !state.showStatusBar })),

  newFile: () => set({ file: { ...defaultFile } }),
}));
