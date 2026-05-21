import { snapshotCommit, snapshotLog, snapshotRestore, type SnapshotLogEntry } from "./snapshot";
import { backupChatForUndo, restoreFromUndoBackup, deleteUndoBackup } from "./chatPersistence";
import { useChatStore, type Message } from "../stores/chatStore";
import { useTabStore } from "../stores/tabStore";
import { toPosix } from "./pathUtils";

export function findCommitForMessage(log: SnapshotLogEntry[], messageId: string): SnapshotLogEntry | undefined {
  return log.find((entry) => entry.message === messageId);
}

export interface UndoDeps {
  snapshotCommit: (chatKey: string, message: string) => Promise<{ hash: string }>;
  snapshotLog: (chatKey: string) => Promise<SnapshotLogEntry[]>;
  snapshotRestore: (chatKey: string, hash: string) => Promise<string[]>;
  backupChat: (chatKey: string) => Promise<void>;
  restoreChatBackup: (chatKey: string) => Promise<boolean>;
  deleteChatBackup: (chatKey: string) => Promise<void>;
  truncateMessages: (chatKey: string, messageId: string) => boolean;
  setArchive: (chatKey: string, messageId: string, hash: string, content: string) => void;
  getArchive: (chatKey: string) => { hash: string; messageId: string; content: string } | null;
  clearArchive: (chatKey: string) => void;
  loadChatHistory: (chatKey: string) => Promise<void>;
  rebuildContext: (chatKey: string) => void;
  refreshTabs: (changedFiles: string[]) => Promise<void>;
  getMessages: (chatKey: string) => Message[];
}

const defaultDeps: UndoDeps = {
  snapshotCommit,
  snapshotLog,
  snapshotRestore,
  backupChat: backupChatForUndo,
  restoreChatBackup: restoreFromUndoBackup,
  deleteChatBackup: deleteUndoBackup,
  truncateMessages: (chatKey, messageId) => useChatStore.getState().undoFromMessage(chatKey, messageId),
  setArchive: (chatKey, messageId, hash, content) => useChatStore.getState().setUndoArchive(chatKey, messageId, hash, content),
  getArchive: (chatKey) => useChatStore.getState().undoArchiveMap[chatKey] ?? null,
  clearArchive: (chatKey) => useChatStore.getState().clearUndoArchive(chatKey),
  loadChatHistory: (chatKey) => useChatStore.getState().loadChatHistory(chatKey),
  rebuildContext: (chatKey) => { useChatStore.getState().getContext(chatKey); },
  refreshTabs: refreshChangedTabs,
  getMessages: (chatKey) => useChatStore.getState().messagesMap[chatKey] ?? [],
};

export async function commit(chatKey: string, messageId: string, deps?: Partial<UndoDeps>): Promise<void> {
  const d = { ...defaultDeps, ...deps };
  try {
    await d.snapshotCommit(chatKey, messageId);
  } catch {
    // snapshot commit failure is non-critical
  }
}

export async function undo(chatKey: string, messageId: string, deps?: Partial<UndoDeps>): Promise<void> {
  const d = { ...defaultDeps, ...deps };
  const msgs = d.getMessages(chatKey);
  const msg = msgs.find((m) => m.id === messageId);
  const msgContent = msg?.content?.slice(0, 60) ?? "";

  try {
    const archiveResult = await d.snapshotCommit(chatKey, "post:" + messageId);
    d.setArchive(chatKey, messageId, archiveResult.hash, msgContent);
    await d.backupChat(chatKey);
  } catch {
    // archive commit failure is non-critical, proceed with undo anyway
  }

  const truncated = d.truncateMessages(chatKey, messageId);
  if (!truncated) return;

  try {
    const log = await d.snapshotLog(chatKey);
    const target = findCommitForMessage(log, messageId);
    if (target) {
      const changedFiles = await d.snapshotRestore(chatKey, target.hash);
      if (changedFiles.length > 0) {
        await d.refreshTabs(changedFiles);
      }
    }
  } catch {
    // snapshot restore failure is non-critical
  }
}

export async function restore(chatKey: string, deps?: Partial<UndoDeps>): Promise<void> {
  const d = { ...defaultDeps, ...deps };
  const archive = d.getArchive(chatKey);
  if (!archive) return;

  try {
    const changedFiles = await d.snapshotRestore(chatKey, archive.hash);
    const restored = await d.restoreChatBackup(chatKey);
    if (restored) {
      await d.loadChatHistory(chatKey);
      d.rebuildContext(chatKey);
    }
    if (changedFiles.length > 0) {
      await d.refreshTabs(changedFiles);
    }
    await d.deleteChatBackup(chatKey);
  } catch {
    // restore failure — leave backup intact so user can retry
  }
  d.clearArchive(chatKey);
}

export async function refreshChangedTabs(changedFiles: string[]): Promise<void> {
  if (changedFiles.length === 0) return;
  const { loadTabContent } = await import("./fileOps");
  const openTabs = useTabStore.getState().files;
  const changedSet = new Set(changedFiles.map((f) => f.toLowerCase()));
  for (const tab of openTabs) {
    if (tab.filePath && changedSet.has(toPosix(tab.filePath).toLowerCase())) {
      await loadTabContent(tab.id);
    }
  }
}

export async function discardUndoArchive(chatKey: string, deps?: Partial<UndoDeps>): Promise<void> {
  const d = { ...defaultDeps, ...deps };
  d.clearArchive(chatKey);
  d.deleteChatBackup(chatKey).catch(() => {});
}
