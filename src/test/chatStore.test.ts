import { describe, it, expect, beforeEach } from "vitest";
import { useChatStore } from "../stores/chatStore";
import type { ToolCall } from "../lib/types";

const TEST_TAB = "test-tab-id";

describe("chatStore", () => {
  beforeEach(() => {
    useChatStore.setState({
      messagesMap: {},
      contextMap: {},
      contextTokensMap: {},
      totalTokensMap: {},
      costMap: {},
      isStreaming: false,
      abortController: null,
      streamingContentMap: {},
      inputHistoryMap: {},
    });
  });

  describe("streamingContentMap", () => {
    it("initial state has empty streamingContentMap", () => {
      expect(useChatStore.getState().streamingContentMap).toEqual({});
    });

    it("returns empty string for unknown tab", () => {
      expect(useChatStore.getState().streamingContentMap["unknown"] ?? "").toBe("");
    });

    it("appendStreamingContent accumulates content", () => {
      useChatStore.getState().appendStreamingContent(TEST_TAB, "Hello");
      expect(useChatStore.getState().streamingContentMap[TEST_TAB]).toBe("Hello");

      useChatStore.getState().appendStreamingContent(TEST_TAB, " World");
      expect(useChatStore.getState().streamingContentMap[TEST_TAB]).toBe("Hello World");
    });

    it("clearStreamingContent removes tab content", () => {
      useChatStore.getState().appendStreamingContent(TEST_TAB, "content");
      useChatStore.getState().clearStreamingContent(TEST_TAB);
      expect(useChatStore.getState().streamingContentMap[TEST_TAB] ?? "").toBe("");
    });

    it("clearStreamingContent does not affect other tabs", () => {
      useChatStore.getState().appendStreamingContent("tab1", "a");
      useChatStore.getState().appendStreamingContent("tab2", "b");
      useChatStore.getState().clearStreamingContent("tab1");
      expect(useChatStore.getState().streamingContentMap["tab2"]).toBe("b");
    });
  });

  describe("stopGeneration", () => {
    it("does not set isStreaming to false", () => {
      useChatStore.setState({ isStreaming: true });
      useChatStore.getState().stopGeneration();
      expect(useChatStore.getState().isStreaming).toBe(true);
    });

    it("clears abortController", () => {
      const ctrl = new AbortController();
      useChatStore.setState({ abortController: ctrl });
      useChatStore.getState().stopGeneration();
      expect(useChatStore.getState().abortController).toBeNull();
    });

    it("aborts the controller", () => {
      const ctrl = new AbortController();
      useChatStore.setState({ abortController: ctrl });
      useChatStore.getState().stopGeneration();
      expect(ctrl.signal.aborted).toBe(true);
    });
  });

  describe("cleanupIncompleteToolCalls", () => {
    it("does nothing when no messages", () => {
      useChatStore.getState().cleanupIncompleteToolCalls(TEST_TAB);
      expect(useChatStore.getState().messagesMap[TEST_TAB]).toBeUndefined();
    });

    it("does nothing when no incomplete tool calls", () => {
      useChatStore.getState().addMessage(TEST_TAB, { role: "user", content: "hi" });
      useChatStore.getState().addMessage(TEST_TAB, { role: "assistant", content: "hello" });
      const before = useChatStore.getState().messagesMap[TEST_TAB].length;
      useChatStore.getState().cleanupIncompleteToolCalls(TEST_TAB);
      expect(useChatStore.getState().messagesMap[TEST_TAB].length).toBe(before);
    });

    it("does nothing when all tool calls have results", () => {
      const tc: ToolCall = { id: "tc1", name: "webfetch", arguments: "{}" };
      useChatStore.getState().addMessage(TEST_TAB, { role: "user", content: "hi" });
      useChatStore.getState().addMessage(TEST_TAB, {
        role: "assistant",
        content: "",
        toolCalls: [tc],
      });
      useChatStore.getState().addMessage(TEST_TAB, {
        role: "tool",
        content: "result",
        toolCallId: "tc1",
        toolName: "webfetch",
      });
      const before = useChatStore.getState().messagesMap[TEST_TAB].length;
      useChatStore.getState().cleanupIncompleteToolCalls(TEST_TAB);
      expect(useChatStore.getState().messagesMap[TEST_TAB].length).toBe(before);
    });

    it("adds error tool result for missing tool calls", () => {
      const tc: ToolCall = { id: "tc1", name: "webfetch", arguments: "{}" };
      useChatStore.getState().addMessage(TEST_TAB, { role: "user", content: "hi" });
      useChatStore.getState().addMessage(TEST_TAB, {
        role: "assistant",
        content: "",
        toolCalls: [tc],
      });
      useChatStore.getState().cleanupIncompleteToolCalls(TEST_TAB);

      const msgs = useChatStore.getState().messagesMap[TEST_TAB];
      const lastMsg = msgs[msgs.length - 1];
      expect(lastMsg.role).toBe("tool");
      expect(lastMsg.toolCallId).toBe("tc1");
      expect(lastMsg.content).toBe("Tool call interrupted");
    });

    it("only adds missing tool results, not existing ones", () => {
      const tc1: ToolCall = { id: "tc1", name: "webfetch", arguments: "{}" };
      const tc2: ToolCall = { id: "tc2", name: "grep", arguments: "{}" };
      useChatStore.getState().addMessage(TEST_TAB, { role: "user", content: "hi" });
      useChatStore.getState().addMessage(TEST_TAB, {
        role: "assistant",
        content: "",
        toolCalls: [tc1, tc2],
      });
      useChatStore.getState().addMessage(TEST_TAB, {
        role: "tool",
        content: "result1",
        toolCallId: "tc1",
        toolName: "webfetch",
      });
      useChatStore.getState().cleanupIncompleteToolCalls(TEST_TAB);

      const msgs = useChatStore.getState().messagesMap[TEST_TAB];
      expect(msgs.filter((m) => m.role === "tool").length).toBe(2);
      const tc2Result = msgs.find((m) => m.toolCallId === "tc2");
      expect(tc2Result).toBeDefined();
      expect(tc2Result!.content).toBe("Tool call interrupted");
    });

    it("only checks the last assistant with toolCalls", () => {
      const tc1: ToolCall = { id: "tc1", name: "webfetch", arguments: "{}" };
      useChatStore.getState().addMessage(TEST_TAB, { role: "user", content: "hi" });
      useChatStore.getState().addMessage(TEST_TAB, {
        role: "assistant",
        content: "",
        toolCalls: [tc1],
      });
      useChatStore.getState().addMessage(TEST_TAB, {
        role: "tool",
        content: "result1",
        toolCallId: "tc1",
        toolName: "webfetch",
      });
      useChatStore.getState().addMessage(TEST_TAB, {
        role: "assistant",
        content: "done",
      });
      useChatStore.getState().cleanupIncompleteToolCalls(TEST_TAB);

      const msgs = useChatStore.getState().messagesMap[TEST_TAB];
      expect(msgs.filter((m) => m.role === "tool").length).toBe(1);
    });
  });

  describe("addMessage", () => {
    it("creates message with unique id and timestamp", () => {
      const msg = useChatStore.getState().addMessage(TEST_TAB, {
        role: "user",
        content: "test",
      });
      expect(msg.id).toBeDefined();
      expect(msg.timestamp).toBeGreaterThan(0);
      expect(msg.role).toBe("user");
      expect(msg.content).toBe("test");
    });

    it("adds message to messagesMap", () => {
      useChatStore.getState().addMessage(TEST_TAB, { role: "user", content: "test" });
      expect(useChatStore.getState().messagesMap[TEST_TAB]).toHaveLength(1);
    });
  });

  describe("inputHistoryMap", () => {
    it("initial state has empty inputHistoryMap", () => {
      expect(useChatStore.getState().inputHistoryMap).toEqual({});
    });

    it("appendInputHistory adds text to map", () => {
      useChatStore.getState().appendInputHistory(TEST_TAB, "hello");
      expect(useChatStore.getState().inputHistoryMap[TEST_TAB]).toEqual(["hello"]);
    });

    it("appendInputHistory deduplicates latest entry", () => {
      useChatStore.getState().appendInputHistory(TEST_TAB, "hello");
      useChatStore.getState().appendInputHistory(TEST_TAB, "hello");
      expect(useChatStore.getState().inputHistoryMap[TEST_TAB]).toEqual(["hello"]);
    });

    it("appendInputHistory prepends new entry", () => {
      useChatStore.getState().appendInputHistory(TEST_TAB, "first");
      useChatStore.getState().appendInputHistory(TEST_TAB, "second");
      expect(useChatStore.getState().inputHistoryMap[TEST_TAB]).toEqual(["second", "first"]);
    });

    it("appendInputHistory ignores empty/whitespace text", () => {
      useChatStore.getState().appendInputHistory(TEST_TAB, "");
      useChatStore.getState().appendInputHistory(TEST_TAB, "  ");
      expect(useChatStore.getState().inputHistoryMap[TEST_TAB]).toBeUndefined();
    });

    it("clearMessages does not clear inputHistoryMap", () => {
      useChatStore.getState().appendInputHistory(TEST_TAB, "hello");
      useChatStore.getState().clearMessages(TEST_TAB);
      expect(useChatStore.getState().inputHistoryMap[TEST_TAB]).toEqual(["hello"]);
    });

    it("deleteChat clears inputHistoryMap", () => {
      useChatStore.getState().appendInputHistory(TEST_TAB, "hello");
      useChatStore.getState().deleteChat(TEST_TAB);
      expect(useChatStore.getState().inputHistoryMap[TEST_TAB]).toBeUndefined();
    });
  });
});
