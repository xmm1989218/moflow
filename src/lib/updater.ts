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

const STABLE_ENDPOINT =
  "https://github.com/xmm1989218/moflow/releases/latest/download/latest.json";
const BETA_ENDPOINT =
  "https://github.com/xmm1989218/moflow/releases/latest/download/latest-beta.json";

export function getEndpoint(channel: UpdateChannel): string {
  return channel === "beta" ? BETA_ENDPOINT : STABLE_ENDPOINT;
}

export async function checkForUpdate(
  channel: UpdateChannel = "stable"
): Promise<Update | null> {
  const endpoint = getEndpoint(channel);
  return await check({ endpoints: [endpoint] });
}

export async function downloadUpdate(update: Update): Promise<void> {
  await update.download();
}

export async function installUpdate(update: Update): Promise<void> {
  await update.install();
}
