import { check, type Update } from "@tauri-apps/plugin-updater";
import { readSettings } from "./settings";

export interface UpdateInfo {
  version: string;
  date?: string;
  body?: string;
  currentVersion: string;
}

export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "up-to-date"; version: string }
  | { state: "available"; info: UpdateInfo }
  | { state: "error"; message: string };

export async function checkForUpdate(): Promise<Update | null> {
  const settings = await readSettings();
  const proxy = settings.proxyUrl || undefined;
  console.log("[updater] checking for update, proxy:", proxy || "none");
  return await check(proxy ? { proxy } : undefined);
}

export async function downloadUpdate(update: Update): Promise<void> {
  await update.download();
}

export async function installUpdate(update: Update): Promise<void> {
  await update.install();
}
