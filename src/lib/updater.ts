import { check, type Update } from "@tauri-apps/plugin-updater";
import type { UpdateChannel } from "./settings";

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

export async function checkForUpdate(
  channel: UpdateChannel = "stable"
): Promise<Update | null> {
  return await check({ target: channel });
}

export async function downloadUpdate(update: Update): Promise<void> {
  await update.download();
}

export async function installUpdate(update: Update): Promise<void> {
  await update.install();
}
