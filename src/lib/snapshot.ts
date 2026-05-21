import { invoke } from "@tauri-apps/api/core";

export interface SnapshotCommitResult {
  hash: string;
}

export interface SnapshotLogEntry {
  hash: string;
  message: string;
  timestamp: number;
}

export async function snapshotInit(chatKey: string, workspacePath: string, filePaths?: string[]): Promise<void> {
  await invoke("snapshot_init", {
    chatKey,
    workspacePath,
    filePaths: filePaths ?? null,
  });
}

export async function snapshotCommit(chatKey: string, message: string): Promise<SnapshotCommitResult> {
  return await invoke("snapshot_commit", { chatKey, message });
}

export async function snapshotCheckoutFiles(chatKey: string, commitHash: string, filePaths: string[]): Promise<void> {
  await invoke("snapshot_checkout_files", { chatKey, commitHash, filePaths });
}

export async function snapshotRestore(chatKey: string, commitHash: string): Promise<string[]> {
  return await invoke("snapshot_restore", { chatKey, commitHash });
}

export async function snapshotLog(chatKey: string): Promise<SnapshotLogEntry[]> {
  return await invoke("snapshot_log", { chatKey });
}

export async function snapshotDestroy(chatKey: string): Promise<void> {
  await invoke("snapshot_destroy", { chatKey });
}