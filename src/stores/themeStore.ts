import { create } from "zustand";
import {
  writeSettings,
  type AIConfig,
  type EditorTheme as EditorThemeType,
  type SupportedLanguage as SupportedLanguageType,
} from "../lib/settings";
import type { Permissions } from "../lib/permission";
import { DEFAULT_PERMISSIONS } from "../lib/permission";

export type AppTheme = "system" | "light" | "dark";
export type EditorTheme = EditorThemeType;
export type SupportedLanguage = SupportedLanguageType;

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
    outlineWidth: s.outlineWidth,
    aiConfig: s.aiConfig,
    proxyUrl: s.proxyUrl,
    language: s.language,
    permissions: s.permissions,
    envVars: s.envVars,
    maxToolRounds: s.maxToolRounds,
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
  proxyUrl: string;
  language: SupportedLanguage;
  permissions: Permissions;
  envVars: Record<string, string>;
  maxToolRounds: number;
  showSettingsTab: boolean;
  settingsTabActive: boolean;
  showOutline: boolean;
  outlineWidth: number;
  leftPanelTab: "files" | "outline";

  setAppTheme: (theme: AppTheme) => void;
  setEditorTheme: (theme: EditorTheme) => void;
  toggleStatusBar: () => void;
  toggleAISidebar: () => void;
  setSidebarWidth: (w: number) => void;
  toggleOutline: () => void;
  setOutlineWidth: (w: number) => void;
  toggleAutoSave: () => void;
  setAIConfig: (config: AIConfig) => void;
  setProxyUrl: (v: string) => void;
  setLanguage: (lang: SupportedLanguage) => void;
  setPermissions: (p: Permissions) => void;
  openSettingsTab: () => void;
  closeSettingsTab: () => void;
  activateSettingsTab: () => void;
  deactivateSettingsTab: () => void;
  setLeftPanelTab: (tab: "files" | "outline") => void;
  setEnvVars: (vars: Record<string, string>) => void;
  setMaxToolRounds: (n: number) => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  appTheme: "system",
  editorTheme: "github",
  showStatusBar: true,
  showAISidebar: false,
  sidebarWidth: 360,
  autoSave: false,
  aiConfig: { mode: "mock", providerId: "custom", provider: "openai-compatible", apiEndpoint: "", apiToken: "", model: "" },
  proxyUrl: "",
  language: "system",
  permissions: { ...DEFAULT_PERMISSIONS },
  envVars: {},
  maxToolRounds: 20,
  showSettingsTab: false,
  settingsTabActive: false,
  showOutline: false,
  outlineWidth: 240,
  leftPanelTab: "outline" as const,

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

  toggleOutline: () =>
    set((state) => ({ showOutline: !state.showOutline })),

  setOutlineWidth: (w) => {
    set({ outlineWidth: Math.max(180, Math.min(360, w)) });
    persistSettings(get);
  },

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

  setProxyUrl: (proxyUrl) => {
    set({ proxyUrl });
    persistSettings(get);
  },

  setLanguage: (language) => {
    set({ language });
    persistSettings(get);
  },

  setPermissions: (permissions) => {
    set({ permissions });
    persistSettings(get);
  },

  openSettingsTab: () => {
    set({ showSettingsTab: true, settingsTabActive: true });
  },

  closeSettingsTab: () => {
    set({ showSettingsTab: false, settingsTabActive: false });
  },

  activateSettingsTab: () => {
    set({ settingsTabActive: true });
  },

  deactivateSettingsTab: () => {
    set({ settingsTabActive: false });
  },

  setLeftPanelTab: (tab) => {
    set({ leftPanelTab: tab });
  },

  setEnvVars: (vars) => {
    set({ envVars: vars });
    persistSettings(get);
  },

  setMaxToolRounds: (maxToolRounds) => {
    set({ maxToolRounds });
    persistSettings(get);
  },
}));
