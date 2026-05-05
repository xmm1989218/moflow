import { check, type Update } from "@tauri-apps/plugin-updater";

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
  return await check();
}

export async function downloadUpdate(update: Update): Promise<void> {
  await update.download();
}

export async function installUpdate(update: Update): Promise<void> {
  await update.install();
}
