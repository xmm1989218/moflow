import { appDataDir, join } from "@tauri-apps/api/path";
import { readFile, writeFile, mkdir, remove, exists } from "@tauri-apps/plugin-fs";
import type { Message } from "../stores/chatStore";

async function ensureChatDir(): Promise<string> {
  const dir = await appDataDir();
  const chatDirPath = await join(dir, "chat");
  if (!(await exists(chatDirPath))) {
    await mkdir(chatDirPath, { recursive: true });
  }
  return chatDirPath;
}

async function chatFilePath(tabId: string): Promise<string> {
  const dir = await ensureChatDir();
  return await join(dir, `${tabId}.jsonl`);
}

function serializeMessage(msg: Message): string {
  return JSON.stringify(msg);
}

function deserializeMessage(line: string): Message | null {
  try {
    const obj = JSON.parse(line);
    if (obj.id && obj.role && obj.content !== undefined && obj.timestamp) {
      return obj as Message;
    }
    return null;
  } catch {
    return null;
  }
}

export async function appendMessage(tabId: string, msg: Message): Promise<void> {
  try {
    const path = await chatFilePath(tabId);
    const line = new TextEncoder().encode(serializeMessage(msg) + "\n");
    await writeFile(path, line, { append: true });
  } catch (e) {
    console.error("[chatPersistence] appendMessage error:", e);
  }
}

export async function rewriteMessages(tabId: string, msgs: Message[]): Promise<void> {
  try {
    const path = await chatFilePath(tabId);
    if (msgs.length === 0) {
      if (await exists(path)) {
        await remove(path);
      }
      return;
    }
    const lines = msgs.map(serializeMessage).join("\n") + "\n";
    await writeFile(path, new TextEncoder().encode(lines));
  } catch (e) {
    console.error("[chatPersistence] rewriteMessages error:", e);
  }
}

export async function removeChat(tabId: string): Promise<void> {
  try {
    const path = await chatFilePath(tabId);
    if (await exists(path)) {
      await remove(path);
    }
  } catch (e) {
    console.error("[chatPersistence] removeChat error:", e);
  }
}

export async function loadChat(tabId: string): Promise<Message[]> {
  try {
    const path = await chatFilePath(tabId);
    if (!(await exists(path))) {
      return [];
    }
    const data = await readFile(path);
    const text = new TextDecoder().decode(data);
    const lines = text.split("\n").filter((l) => l.trim().length > 0);
    const msgs: Message[] = [];
    for (const line of lines) {
      const msg = deserializeMessage(line);
      if (msg) msgs.push(msg);
    }
    return msgs;
  } catch (e) {
    console.error("[chatPersistence] loadChat error:", e);
    return [];
  }
}
