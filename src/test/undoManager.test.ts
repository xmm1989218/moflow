import { describe, it, expect, vi } from "vitest";
import { findCommitForMessage, commit, undo, restore, discardUndoArchive, type UndoDeps } from "../lib/undoManager";
import type { SnapshotLogEntry } from "../lib/snapshot";
import type { Message } from "../stores/chatStore";

const makeMockDeps = (overrides?: Partial<UndoDeps>): UndoDeps => {
  const base: UndoDeps = {
    snapshotCommit: vi.fn(async () => ({ hash: "mock-hash" })),
    snapshotLog: vi.fn(async () => []),
    snapshotRestore: vi.fn(async () => []),
    backupChat: vi.fn(async () => {}),
    restoreChatBackup: vi.fn(async () => true),
    deleteChatBackup: vi.fn(async () => {}),
    truncateMessages: vi.fn(() => true),
    setArchive: vi.fn(() => {}),
    getArchive: vi.fn(() => null),
    clearArchive: vi.fn(() => {}),
    loadChatHistory: vi.fn(async () => {}),
    rebuildContext: vi.fn(() => {}),
    refreshTabs: vi.fn(async () => {}),
    getMessages: vi.fn(() => []),
  };
  return { ...base, ...overrides };
};

describe("findCommitForMessage", () => {
  const log: SnapshotLogEntry[] = [
    { hash: "h3", message: "post:msg-3", timestamp: 300 },
    { hash: "h2", message: "msg-2", timestamp: 200 },
    { hash: "h1", message: "msg-1", timestamp: 100 },
  ];

  it("finds exact match", () => {
    expect(findCommitForMessage(log, "msg-2")?.hash).toBe("h2");
  });

  it("returns undefined for nonexistent messageId", () => {
    expect(findCommitForMessage(log, "msg-999")).toBeUndefined();
  });

  it("does not match post: prefix when searching for plain messageId", () => {
    expect(findCommitForMessage(log, "msg-3")).toBeUndefined();
  });

  it("finds post: prefixed commit", () => {
    expect(findCommitForMessage(log, "post:msg-3")?.hash).toBe("h3");
  });

  it("returns first (newest) match from HEAD", () => {
    const dupLog: SnapshotLogEntry[] = [
      { hash: "h-new", message: "msg-1", timestamp: 300 },
      { hash: "h-old", message: "msg-1", timestamp: 100 },
    ];
    expect(findCommitForMessage(dupLog, "msg-1")?.hash).toBe("h-new");
  });

  it("returns undefined for empty log", () => {
    expect(findCommitForMessage([], "msg-1")).toBeUndefined();
  });
});

describe("commit", () => {
  it("calls snapshotCommit with messageId", async () => {
    const deps = makeMockDeps();
    await commit("chat-1", "msg-1", deps);
    expect(deps.snapshotCommit).toHaveBeenCalledWith("chat-1", "msg-1");
  });

  it("does not throw on snapshotCommit failure", async () => {
    const deps = makeMockDeps({
      snapshotCommit: vi.fn(async () => { throw new Error("fail"); }),
    });
    await commit("chat-1", "msg-1", deps);
  });
});

describe("undo", () => {
  const mockMessages: Message[] = [
    { id: "msg-1", role: "user", content: "hello", timestamp: 100 },
    { id: "msg-2", role: "assistant", content: "hi", timestamp: 200 },
    { id: "msg-3", role: "user", content: "long content here that exceeds sixty chars maybe it does maybe it doesnt", timestamp: 300 },
  ];

  it("full undo flow: post commit → backup → truncate → find commit → restore → refresh", async () => {
    const log: SnapshotLogEntry[] = [
      { hash: "h-post", message: "post:msg-3", timestamp: 400 },
      { hash: "h-before", message: "msg-3", timestamp: 300 },
    ];
    const deps = makeMockDeps({
      snapshotLog: vi.fn(async () => log),
      snapshotRestore: vi.fn(async () => ["file1.md", "file2.md"]),
      getMessages: vi.fn(() => mockMessages),
    });

    await undo("chat-1", "msg-3", deps);

    expect(deps.snapshotCommit).toHaveBeenCalledWith("chat-1", "post:msg-3");
    expect(deps.setArchive).toHaveBeenCalledWith("chat-1", "msg-3", "mock-hash", "long content here that exceeds sixty chars maybe it does may");
    expect(deps.backupChat).toHaveBeenCalledWith("chat-1");
    expect(deps.truncateMessages).toHaveBeenCalledWith("chat-1", "msg-3");
    expect(deps.snapshotRestore).toHaveBeenCalledWith("chat-1", "h-before");
    expect(deps.refreshTabs).toHaveBeenCalledWith(["file1.md", "file2.md"]);
  });

  it("skips file restore when commit not found", async () => {
    const deps = makeMockDeps({
      snapshotLog: vi.fn(async () => []),
      getMessages: vi.fn(() => mockMessages),
    });

    await undo("chat-1", "msg-3", deps);

    expect(deps.truncateMessages).toHaveBeenCalledWith("chat-1", "msg-3");
    expect(deps.snapshotRestore).not.toHaveBeenCalled();
    expect(deps.refreshTabs).not.toHaveBeenCalled();
  });

  it("continues undo when post commit fails", async () => {
    const log: SnapshotLogEntry[] = [
      { hash: "h-before", message: "msg-3", timestamp: 300 },
    ];
    const deps = makeMockDeps({
      snapshotCommit: vi.fn(async () => { throw new Error("fail"); }),
      snapshotLog: vi.fn(async () => log),
      getMessages: vi.fn(() => mockMessages),
    });

    await undo("chat-1", "msg-3", deps);

    expect(deps.truncateMessages).toHaveBeenCalledWith("chat-1", "msg-3");
    expect(deps.snapshotRestore).toHaveBeenCalledWith("chat-1", "h-before");
  });

  it("returns early when truncateMessages returns false (message not found)", async () => {
    const deps = makeMockDeps({
      truncateMessages: vi.fn(() => false),
      getMessages: vi.fn(() => []),
    });

    await undo("chat-1", "nonexistent", deps);

    expect(deps.snapshotRestore).not.toHaveBeenCalled();
  });
});

describe("restore", () => {
  it("full restore flow: snapshotRestore → restoreChatBackup → loadChatHistory → refresh → cleanup", async () => {
    const archive = { hash: "archive-hash", messageId: "msg-3", content: "preview text" };
    const deps = makeMockDeps({
      getArchive: vi.fn(() => archive),
      snapshotRestore: vi.fn(async () => ["file1.md"]),
    });

    await restore("chat-1", deps);

    expect(deps.snapshotRestore).toHaveBeenCalledWith("chat-1", "archive-hash");
    expect(deps.restoreChatBackup).toHaveBeenCalledWith("chat-1");
    expect(deps.loadChatHistory).toHaveBeenCalledWith("chat-1");
    expect(deps.rebuildContext).toHaveBeenCalledWith("chat-1");
    expect(deps.refreshTabs).toHaveBeenCalledWith(["file1.md"]);
    expect(deps.deleteChatBackup).toHaveBeenCalledWith("chat-1");
    expect(deps.clearArchive).toHaveBeenCalledWith("chat-1");
  });

  it("returns early when no archive", async () => {
    const deps = makeMockDeps({
      getArchive: vi.fn(() => null),
    });

    await restore("chat-1", deps);

    expect(deps.snapshotRestore).not.toHaveBeenCalled();
  });

  it("clears archive even on restore failure", async () => {
    const archive = { hash: "archive-hash", messageId: "msg-3", content: "preview" };
    const deps = makeMockDeps({
      getArchive: vi.fn(() => archive),
      snapshotRestore: vi.fn(async () => { throw new Error("fail"); }),
    });

    await restore("chat-1", deps);

    expect(deps.clearArchive).toHaveBeenCalledWith("chat-1");
  });
});

describe("discardUndoArchive", () => {
  it("calls clearArchive and deleteChatBackup", async () => {
    const deps = makeMockDeps();
    await discardUndoArchive("chat-1", deps);
    expect(deps.clearArchive).toHaveBeenCalledWith("chat-1");
    expect(deps.deleteChatBackup).toHaveBeenCalledWith("chat-1");
  });
});