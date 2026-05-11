import { describe, it, expect, beforeEach } from "vitest";
import { useTabStore } from "../stores/tabStore";
import { useChatStore } from "../stores/chatStore";

describe("tabStore chatKey", () => {
  beforeEach(() => {
    useTabStore.setState({
      files: [],
      activeFileId: "",
      workspaceRoot: null,
      sessionInitialized: true,
    });
    useChatStore.setState({
      messagesMap: {},
      chatLoadedMap: {},
      contextMap: {},
      contextTokensMap: {},
      totalTokensMap: {},
      costMap: {},
      isStreaming: false,
      abortController: null,
      streamingContentMap: {},
    });
  });

  describe("getChatKey", () => {
    it("returns activeFileId when no workspace", () => {
      useTabStore.setState({ activeFileId: "tab-1", workspaceRoot: null });
      expect(useTabStore.getState().getChatKey()).toBe("tab-1");
    });

    it("returns empty string when no workspace and no activeFile", () => {
      useTabStore.setState({ activeFileId: "", workspaceRoot: null });
      expect(useTabStore.getState().getChatKey()).toBe("");
    });

    it('returns "dir:" prefixed key when workspace is set', () => {
      useTabStore.setState({ workspaceRoot: "D:/projects/foo" });
      expect(useTabStore.getState().getChatKey()).toBe("dir:d:/projects/foo");
    });

    it("normalizes backslashes to forward slashes", () => {
      useTabStore.setState({ workspaceRoot: "D:\\projects\\foo" });
      expect(useTabStore.getState().getChatKey()).toBe("dir:d:/projects/foo");
    });

    it("lowercases the workspace path", () => {
      useTabStore.setState({ workspaceRoot: "D:/Projects/Foo" });
      expect(useTabStore.getState().getChatKey()).toBe("dir:d:/projects/foo");
    });

    it("uses workspace key even when activeFileId exists", () => {
      useTabStore.setState({ workspaceRoot: "D:/projects/foo", activeFileId: "tab-1" });
      expect(useTabStore.getState().getChatKey()).toBe("dir:d:/projects/foo");
    });
  });

  describe("closeTab in workspace mode", () => {
    it("does not delete chat when workspace is open", () => {
      useTabStore.setState({
        files: [
          { id: "tab-1", fileName: "a.md", filePath: "D:/projects/foo/a.md", content: "", lastSavedContent: "", isModified: false, contentLoaded: true, mode: "wysiwyg" as const },
          { id: "tab-2", fileName: "b.md", filePath: "D:/projects/foo/b.md", content: "", lastSavedContent: "", isModified: false, contentLoaded: true, mode: "wysiwyg" as const },
        ],
        activeFileId: "tab-1",
        workspaceRoot: "D:/projects/foo",
      });

      useChatStore.getState().addMessage("dir:d:/projects/foo", { role: "user", content: "hello" });
      expect(useChatStore.getState().messagesMap["dir:d:/projects/foo"]).toHaveLength(1);

      useTabStore.getState().closeTab("tab-1");

      expect(useChatStore.getState().messagesMap["dir:d:/projects/foo"]).toHaveLength(1);
    });

    it("deletes chat when no workspace", () => {
      useTabStore.setState({
        files: [
          { id: "tab-1", fileName: "a.md", filePath: null, content: "", lastSavedContent: "", isModified: false, contentLoaded: true, mode: "wysiwyg" as const },
        ],
        activeFileId: "tab-1",
        workspaceRoot: null,
      });

      useChatStore.getState().addMessage("tab-1", { role: "user", content: "hello" });
      expect(useChatStore.getState().messagesMap["tab-1"]).toHaveLength(1);

      useTabStore.getState().closeTab("tab-1");

      expect(useChatStore.getState().messagesMap["tab-1"]).toBeUndefined();
    });

    it("last tab close keeps workspaceRoot", () => {
      useTabStore.setState({
        files: [
          { id: "tab-1", fileName: "a.md", filePath: "D:/projects/foo/a.md", content: "", lastSavedContent: "", isModified: false, contentLoaded: true, mode: "wysiwyg" as const },
        ],
        activeFileId: "tab-1",
        workspaceRoot: "D:/projects/foo",
      });

      useTabStore.getState().closeTab("tab-1");

      expect(useTabStore.getState().workspaceRoot).toBe("D:/projects/foo");
      expect(useTabStore.getState().files).toHaveLength(0);
      expect(useTabStore.getState().activeFileId).toBe("");
    });
  });
});
