import { create } from "zustand";
import {
  writeSettings,
  type AIConfig,
  type EditorTheme as EditorThemeType,
} from "../lib/settings";

export type AppTheme = "system" | "light" | "dark";
export type EditorTheme = EditorThemeType;

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

function persistSettings(get: () => ThemeState) {
  const s = get();
  writeSettings({
    appTheme: s.appTheme,
    editorTheme: s.editorTheme,
    autoSave: s.autoSave,
    showStatusBar: s.showStatusBar,
    sidebarWidth: s.sidebarWidth,
    aiConfig: s.aiConfig,
  });
}

interface ThemeState {
  appTheme: AppTheme;
  editorTheme: EditorTheme;
  showStatusBar: boolean;
  showAISidebar: boolean;
  sidebarWidth: number;
  autoSave: boolean;
  aiConfig: AIConfig;

  setAppTheme: (theme: AppTheme) => void;
  setEditorTheme: (theme: EditorTheme) => void;
  toggleStatusBar: () => void;
  toggleAISidebar: () => void;
  setSidebarWidth: (w: number) => void;
  toggleAutoSave: () => void;
  setAIConfig: (config: AIConfig) => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  appTheme: "system",
  editorTheme: "github",
  showStatusBar: true,
  showAISidebar: false,
  sidebarWidth: 360,
  autoSave: false,
  aiConfig: { mode: "mock", providerId: "custom", provider: "openai-compatible", apiEndpoint: "", apiToken: "", model: "" },

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

  setAIConfig: (aiConfig) => {
    set({ aiConfig });
    persistSettings(get);
  },
}));
