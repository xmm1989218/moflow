import { appDataDir, join } from "@tauri-apps/api/path";
import { readFile, writeFile, exists } from "@tauri-apps/plugin-fs";

export type UpdateChannel = "stable" | "beta";

export interface AppSettings {
  appTheme: "system" | "light" | "dark";
  editorTheme: string;
  autoSave: boolean;
  showStatusBar: boolean;
  sidebarWidth: number;
  updateChannel: UpdateChannel;
}

export const defaultSettings: AppSettings = {
  appTheme: "system",
  editorTheme: "github",
  autoSave: false,
  showStatusBar: true,
  sidebarWidth: 360,
  updateChannel: "stable",
};

export async function readSettings(): Promise<AppSettings> {
  try {
    const dir = await appDataDir();
    const path = await join(dir, "settings.json");
    if (!(await exists(path))) {
      return { ...defaultSettings };
    }
    const data = await readFile(path);
    const parsed = JSON.parse(new TextDecoder().decode(data));
    return { ...defaultSettings, ...parsed };
  } catch {
    return { ...defaultSettings };
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
