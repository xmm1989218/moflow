import { appDataDir, join } from "@tauri-apps/api/path";
import { readFile, writeFile, mkdir, remove, exists, rename } from "@tauri-apps/plugin-fs";
import type { Message } from "../stores/chatStore";

function safeFileName(chatKey: string): string {
  return chatKey.replace(/[:/\\]/g, "_");
}

async function ensureChatDir(): Promise<string> {
  const dir = await appDataDir();
  const chatDirPath = await join(dir, "chat");
  if (!(await exists(chatDirPath))) {
    await mkdir(chatDirPath, { recursive: true });
  }
  return chatDirPath;
}

async function chatFilePath(chatKey: string): Promise<string> {
  const dir = await ensureChatDir();
  return await join(dir, `${safeFileName(chatKey)}.jsonl`);
}

function serializeMessage(msg: Message): string {
  return JSON.stringify(msg);
}

function deserializeMessage(line: string): Message | null {
  try {
    const obj = JSON.parse(line);
    if (obj.id && obj.role && obj.content !== undefined && obj.timestamp) {
      return {
        id: obj.id,
        role: obj.role,
        content: obj.content,
        timestamp: obj.timestamp,
        promptTokens: obj.promptTokens,
        toolCalls: obj.toolCalls,
        toolCallId: obj.toolCallId,
        toolName: obj.toolName,
        reasoningContent: obj.reasoningContent,
        isCompactSummary: obj.isCompactSummary,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function appendMessage(chatKey: string, msg: Message): Promise<void> {
  try {
    const path = await chatFilePath(chatKey);
    const line = new TextEncoder().encode(serializeMessage(msg) + "\n");
    await writeFile(path, line, { append: true });
  } catch (e) {
    console.error("[chatPersistence] appendMessage error:", e);
  }
}

export async function clearChat(chatKey: string): Promise<void> {
  try {
    const path = await chatFilePath(chatKey);
    if (await exists(path)) {
      await remove(path);
    }
  } catch (e) {
    console.error("[chatPersistence] clearChat error:", e);
  }
}

export async function removeChat(chatKey: string): Promise<void> {
  try {
    const path = await chatFilePath(chatKey);
    if (await exists(path)) {
      await remove(path);
    }
  } catch { /* file may not exist */ }
}

async function repairIfNeeded(chatKey: string, path: string, lines: string[], msgs: Message[]): Promise<void> {
  if (msgs.length === lines.length) return;
  if (msgs.length === 0) return;
  try {
    const dir = await ensureChatDir();
    const tmpPath = await join(dir, `${safeFileName(chatKey)}.jsonl.repair`);
    const content = msgs.map(serializeMessage).join("\n") + "\n";
    await writeFile(tmpPath, new TextEncoder().encode(content));
    try {
      await rename(tmpPath, path);
    } catch {
      try { await remove(tmpPath); } catch { /* ignore */ }
    }
  } catch (e) {
    console.error("[chatPersistence] repair error:", e);
  }
}

export async function loadChat(chatKey: string): Promise<Message[]> {
  performance.mark(`loadChat-start-${chatKey}`);
  try {
    const path = await chatFilePath(chatKey);
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
    await repairIfNeeded(chatKey, path, lines, msgs);
    performance.mark(`loadChat-end-${chatKey}`);
    performance.measure(`loadChat-${chatKey}`, `loadChat-start-${chatKey}`, `loadChat-end-${chatKey}`);
    return msgs;
  } catch (e) {
    console.error("[chatPersistence] loadChat error:", e);
    performance.mark(`loadChat-end-${chatKey}`);
    performance.measure(`loadChat-${chatKey}`, `loadChat-start-${chatKey}`, `loadChat-end-${chatKey}`);
    return [];
  }
}
