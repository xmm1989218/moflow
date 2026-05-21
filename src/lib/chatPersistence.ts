import { appDataDir, join } from "@tauri-apps/api/path";
import { readFile, writeFile, mkdir, remove, exists, rename, readDir } from "@tauri-apps/plugin-fs";
import type { Message } from "../stores/chatStore";

export function safeFileName(chatKey: string): string {
  return chatKey.replace(/[:/\\]/g, "_");
}

async function ensureChatsDir(): Promise<string> {
  const dir = await appDataDir();
  const chatsDir = await join(dir, "chats");
  if (!(await exists(chatsDir))) {
    await mkdir(chatsDir, { recursive: true });
  }
  return chatsDir;
}

async function chatDirPath(chatKey: string): Promise<string> {
  const chatsDir = await ensureChatsDir();
  const sessionDir = await join(chatsDir, safeFileName(chatKey));
  if (!(await exists(sessionDir))) {
    await mkdir(sessionDir, { recursive: true });
  }
  return sessionDir;
}

async function chatFilePath(chatKey: string): Promise<string> {
  const dir = await chatDirPath(chatKey);
  return await join(dir, "messages.jsonl");
}

async function traceFilePath(chatKey: string): Promise<string> {
  const dir = await chatDirPath(chatKey);
  return await join(dir, "trace.jsonl");
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
    await writeFile(path, new TextEncoder().encode(""));
  } catch (e) {
    console.error("[chatPersistence] clearChat error:", e);
  }
}

export async function removeChat(chatKey: string): Promise<void> {
  try {
    const dir = await chatDirPath(chatKey);
    if (await exists(dir)) {
      await remove(dir, { recursive: true });
    }
  } catch { /* dir may not exist */ }
}

async function repairIfNeeded(chatKey: string, path: string, lines: string[], msgs: Message[]): Promise<void> {
  if (msgs.length === lines.length) return;
  if (msgs.length === 0) return;
  try {
    const dir = await chatDirPath(chatKey);
    const tmpPath = await join(dir, "messages.jsonl.repair");
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

export async function rewriteChat(chatKey: string, keepCount: number): Promise<void> {
  try {
    const path = await chatFilePath(chatKey);
    if (!(await exists(path))) return;
    const data = await readFile(path);
    const text = new TextDecoder().decode(data);
    const allLines = text.split("\n").filter((l) => l.trim().length > 0);
    if (keepCount >= allLines.length) return;
    const keptLines = allLines.slice(0, keepCount);
    const content = keptLines.join("\n") + "\n";
    const dir = await chatDirPath(chatKey);
    const tmpPath = await join(dir, "messages.jsonl.rewrite");
    await writeFile(tmpPath, new TextEncoder().encode(content));
    await rename(tmpPath, path);
  } catch (e) {
    console.error("[chatPersistence] rewriteChat error:", e);
  }
}

export async function appendTraceEvent(chatKey: string, event: Record<string, unknown>): Promise<void> {
  try {
    const path = await traceFilePath(chatKey);
    const line = new TextEncoder().encode(JSON.stringify(event) + "\n");
    await writeFile(path, line, { append: true });
  } catch (e) {
    console.error("[chatPersistence] appendTraceEvent error:", e);
  }
}

export async function clearTrace(chatKey: string): Promise<void> {
  try {
    const path = await traceFilePath(chatKey);
    await writeFile(path, new TextEncoder().encode(""));
  } catch (e) {
    console.error("[chatPersistence] clearTrace error:", e);
  }
}

export async function migrateOldChatDir(): Promise<void> {
  try {
    const dir = await appDataDir();
    const oldDir = await join(dir, "chat");
    if (!(await exists(oldDir))) return;

    const newDir = await join(dir, "chats");
    if (!(await exists(newDir))) {
      await mkdir(newDir, { recursive: true });
    }

    const entries = await readDir(oldDir);
    for (const entry of entries) {
      if (!entry.name?.endsWith(".jsonl")) continue;
      const safeName = entry.name.replace(/\.jsonl$/, "");
      const sessionDir = await join(newDir, safeName);
      if (!(await exists(sessionDir))) {
        await mkdir(sessionDir, { recursive: true });
      }
      const oldPath = await join(oldDir, entry.name);
      const newPath = await join(sessionDir, "messages.jsonl");
      const data = await readFile(oldPath);
      await writeFile(newPath, data);
      await remove(oldPath);
    }

    const remaining = await readDir(oldDir);
    if (remaining.length === 0) {
      await remove(oldDir, { recursive: true });
    }
  } catch (e) {
    console.error("[chatPersistence] migrateOldChatDir error:", e);
  }
}
