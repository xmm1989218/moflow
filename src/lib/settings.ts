import { appDataDir, join } from "@tauri-apps/api/path";
import { readFile, writeFile, exists, remove } from "@tauri-apps/plugin-fs";
import { DEFAULT_PERMISSIONS } from "./permission";

export type EditorTheme = "github" | "github-dark" | "nord" | "nord-dark" | "catppuccin-latte" | "catppuccin-mocha";

export type SupportedLanguage = "system" | "zh" | "en" | "ja" | "ko";

export interface AIConfig {
  mode: "mock" | "real";
  providerId: string;
  provider: "openai-compatible" | "claude-compatible";
  apiEndpoint: string;
  apiToken: string;
  model: string;
}

export const defaultAIConfig: AIConfig = {
  mode: "mock",
  providerId: "custom",
  provider: "openai-compatible",
  apiEndpoint: "",
  apiToken: "",
  model: "",
};

export type AiMode = "build" | "plan";

export interface AppSettings {
  appTheme: "system" | "light" | "dark";
  editorTheme: EditorTheme;
  autoSave: boolean;
  showStatusBar: boolean;
  sidebarWidth: number;
  outlineWidth: number;
  aiConfig: AIConfig;
  proxyUrl: string;
  language: SupportedLanguage;
  permissions: import("./permission").Permissions;
  envVars: Record<string, string>;
  maxToolRounds: number;
  aiMode: AiMode;
  enableTrace: boolean;
  shortcutOverrides: Record<string, { key: string; modifiers: ("ctrl" | "shift" | "alt")[] }>;
}

export const defaultSettings: AppSettings = {
  appTheme: "system",
  editorTheme: "github",
  autoSave: false,
  showStatusBar: true,
  sidebarWidth: 360,
  outlineWidth: 240,
  aiConfig: { ...defaultAIConfig },
  proxyUrl: "",
  language: "system",
  permissions: { ...DEFAULT_PERMISSIONS },
  envVars: {},
  maxToolRounds: 20,
  aiMode: "build",
  enableTrace: false,
  shortcutOverrides: {},
};

export async function readSettings(): Promise<AppSettings> {
  try {
    const dir = await appDataDir();
    const path = await join(dir, "settings.json");
    if (!(await exists(path))) {
      const migrated = await migrateFromAIConfig();
      if (migrated) return migrated;
      return { ...defaultSettings };
    }
    const data = await readFile(path);
    const parsed = JSON.parse(new TextDecoder().decode(data));
    const settings = {
      ...defaultSettings,
      ...parsed,
      aiConfig: { ...defaultAIConfig, ...(parsed.aiConfig || {}) },
      proxyUrl: parsed.proxyUrl ?? "",
      outlineWidth: parsed.outlineWidth ?? 240,
      language: parsed.language ?? "system",
      permissions: { ...DEFAULT_PERMISSIONS, ...(parsed.permissions || {}) },
      envVars: parsed.envVars ?? {},
      maxToolRounds: parsed.maxToolRounds ?? 20,
      aiMode: parsed.aiMode ?? "build",
      enableTrace: parsed.enableTrace ?? false,
      shortcutOverrides: parsed.shortcutOverrides ?? {},
    };
    return settings;
  } catch {
    return { ...defaultSettings };
  }
}

async function migrateFromAIConfig(): Promise<AppSettings | null> {
  try {
    const dir = await appDataDir();
    const oldPath = await join(dir, "ai-config.json");
    if (!(await exists(oldPath))) return null;

    const data = await readFile(oldPath);
    const parsed = JSON.parse(new TextDecoder().decode(data));
    const aiConfig = { ...defaultAIConfig, ...parsed };

    const settings: AppSettings = { ...defaultSettings, aiConfig };
    await writeSettings(settings);

    try {
      await remove(oldPath);
    } catch { /* ignore */ }

    console.log("[settings] Migrated ai-config.json to settings.json");
    return settings;
  } catch {
    return null;
  }
}

export async function writeSettings(settings: AppSettings): Promise<void> {
  try {
    const dir = await appDataDir();
    const path = await join(dir, "settings.json");
    const json = JSON.stringify(settings, null, 2);
    await writeFile(path, new TextEncoder().encode(json));
  } catch (e) {
    console.error("[writeSettings] error:", e);
  }
}
