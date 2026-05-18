import { appDataDir, join } from "@tauri-apps/api/path";
import { readFile, writeFile, mkdir, exists } from "@tauri-apps/plugin-fs";
import { safeFileName } from "./chatPersistence";

const MAX_HISTORY = 200;

async function historyFilePath(chatKey: string): Promise<string> {
  const dir = await appDataDir();
  const sessionDir = await join(dir, "chats", safeFileName(chatKey));
  if (!(await exists(sessionDir))) {
    await mkdir(sessionDir, { recursive: true });
  }
  return await join(sessionDir, "input_history.json");
}

export async function loadInputHistory(chatKey: string): Promise<string[]> {
  try {
    const path = await historyFilePath(chatKey);
    if (!(await exists(path))) return [];
    const data = await readFile(path);
    const arr: string[] = JSON.parse(new TextDecoder().decode(data));
    return arr;
  } catch {
    return [];
  }
}

export async function saveInputHistory(chatKey: string, history: string[]): Promise<void> {
  try {
    const path = await historyFilePath(chatKey);
    await writeFile(path, new TextEncoder().encode(JSON.stringify(history)));
  } catch (e) {
    console.error("[inputHistory] saveInputHistory error:", e);
  }
}

export async function appendInputHistory(chatKey: string, text: string): Promise<void> {
  try {
    if (!text.trim()) return;
    const history = await loadInputHistory(chatKey);
    if (history.length > 0 && history[0] === text) return;
    history.unshift(text);
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
    await saveInputHistory(chatKey, history);
  } catch (e) {
    console.error("[inputHistory] appendInputHistory error:", e);
  }
}