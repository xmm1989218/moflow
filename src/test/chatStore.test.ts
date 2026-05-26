import { describe, it, expect, beforeEach } from "vitest";
import { useChatStore } from "../stores/chatStore";
import type { ToolCall, SubAgentExecution } from "../lib/types";

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

  describe("subAgent state", () => {
    const mockExecution: SubAgentExecution = {
      taskId: "task-1",
      description: "Explore API",
      subagentType: "explore",
      messages: [],
      totalRounds: 3,
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      cost: 0.01,
      cachedTokens: 0,
      cacheSavings: 0,
      status: "completed",
      parentChatKey: TEST_TAB,
    };

    it("initial state has null activeSubAgentView", () => {
      expect(useChatStore.getState().activeSubAgentView).toBeNull();
    });

    it("initial state has empty subAgentResultsMap", () => {
      expect(useChatStore.getState().subAgentResultsMap).toEqual({});
    });

    it("setActiveSubAgentView sets the view", () => {
      useChatStore.getState().setActiveSubAgentView("task-1");
      expect(useChatStore.getState().activeSubAgentView).toBe("task-1");
    });

    it("setActiveSubAgentView clears with null", () => {
      useChatStore.getState().setActiveSubAgentView("task-1");
      useChatStore.getState().setActiveSubAgentView(null);
      expect(useChatStore.getState().activeSubAgentView).toBeNull();
    });

    it("addSubAgentResult stores execution", () => {
      useChatStore.getState().addSubAgentResult("task-1", mockExecution);
      expect(useChatStore.getState().subAgentResultsMap["task-1"]).toEqual(mockExecution);
    });

    it("addSubAgentResult stores multiple executions", () => {
      const exec2: SubAgentExecution = { ...mockExecution, taskId: "task-2", description: "General task", subagentType: "general" };
      useChatStore.getState().addSubAgentResult("task-1", mockExecution);
      useChatStore.getState().addSubAgentResult("task-2", exec2);
      expect(Object.keys(useChatStore.getState().subAgentResultsMap)).toHaveLength(2);
    });

    it("clearSubAgentViews removes executions for a chatKey", () => {
      useChatStore.getState().addSubAgentResult("task-1", mockExecution);
      useChatStore.getState().clearSubAgentViews(TEST_TAB);
      expect(useChatStore.getState().subAgentResultsMap["task-1"]).toBeUndefined();
    });

    it("clearSubAgentViews resets activeSubAgentView if viewing cleared task", () => {
      useChatStore.getState().addSubAgentResult("task-1", mockExecution);
      useChatStore.getState().setActiveSubAgentView("task-1");
      useChatStore.getState().clearSubAgentViews(TEST_TAB);
      expect(useChatStore.getState().activeSubAgentView).toBeNull();
    });

    it("clearSubAgentViews preserves other chatKey executions", () => {
      const otherExec: SubAgentExecution = { ...mockExecution, parentChatKey: "other-tab" };
      useChatStore.getState().addSubAgentResult("task-1", mockExecution);
      useChatStore.getState().addSubAgentResult("task-2", otherExec);
      useChatStore.getState().clearSubAgentViews(TEST_TAB);
      expect(useChatStore.getState().subAgentResultsMap["task-1"]).toBeUndefined();
      expect(useChatStore.getState().subAgentResultsMap["task-2"]).toBeDefined();
    });

    it("clearMessages clears subAgentResults for the tab", () => {
      useChatStore.getState().addSubAgentResult("task-1", mockExecution);
      useChatStore.getState().setActiveSubAgentView("task-1");
      useChatStore.getState().clearMessages(TEST_TAB);
      expect(useChatStore.getState().subAgentResultsMap["task-1"]).toBeUndefined();
      expect(useChatStore.getState().activeSubAgentView).toBeNull();
    });

    it("deleteChat clears subAgentResults for the tab", () => {
      useChatStore.getState().addSubAgentResult("task-1", mockExecution);
      useChatStore.getState().deleteChat(TEST_TAB);
      expect(useChatStore.getState().subAgentResultsMap["task-1"]).toBeUndefined();
    });
  });

  describe("undoFromMessage", () => {
    it("returns false when message not found", () => {
      const result = useChatStore.getState().undoFromMessage(TEST_TAB, "nonexistent");
      expect(result).toBe(false);
    });

    it("returns true when undoing first user message", () => {
      const msg = useChatStore.getState().addMessage(TEST_TAB, { role: "user", content: "hello" });
      const result = useChatStore.getState().undoFromMessage(TEST_TAB, msg.id);
      expect(result).toBe(true);
      expect(useChatStore.getState().messagesMap[TEST_TAB]).toHaveLength(0);
    });

    it("removes message and all subsequent messages", () => {
      const msg1 = useChatStore.getState().addMessage(TEST_TAB, { role: "user", content: "round1" });
      useChatStore.getState().addMessage(TEST_TAB, { role: "assistant", content: "answer1" });
      const msg2 = useChatStore.getState().addMessage(TEST_TAB, { role: "user", content: "round2" });
      useChatStore.getState().addMessage(TEST_TAB, { role: "assistant", content: "answer2" });

      const result = useChatStore.getState().undoFromMessage(TEST_TAB, msg2.id);
      expect(result).toBe(true);
      const msgs = useChatStore.getState().messagesMap[TEST_TAB];
      expect(msgs.length).toBe(2);
      expect(msgs[0].id).toBe(msg1.id);
      expect(msgs[1].content).toBe("answer1");
    });

    it("removes messages including tool messages", () => {
      const tc: ToolCall = { id: "tc1", name: "read", arguments: "{}" };
      const msg1 = useChatStore.getState().addMessage(TEST_TAB, { role: "user", content: "round1" });
      useChatStore.getState().addMessage(TEST_TAB, { role: "assistant", content: "answer1" });
      const msg2 = useChatStore.getState().addMessage(TEST_TAB, { role: "user", content: "round2" });
      useChatStore.getState().addMessage(TEST_TAB, { role: "assistant", content: "", toolCalls: [tc] });
      useChatStore.getState().addMessage(TEST_TAB, { role: "tool", content: "file content", toolCallId: "tc1", toolName: "read" });
      useChatStore.getState().addMessage(TEST_TAB, { role: "assistant", content: "final answer" });

      const result = useChatStore.getState().undoFromMessage(TEST_TAB, msg2.id);
      expect(result).toBe(true);
      const msgs = useChatStore.getState().messagesMap[TEST_TAB];
      expect(msgs.length).toBe(2);
      expect(msgs[0].id).toBe(msg1.id);
      expect(msgs[1].content).toBe("answer1");
    });

    it("rebuilds contextMap after undo", () => {
      useChatStore.getState().addMessage(TEST_TAB, { role: "user", content: "round1" });
      useChatStore.getState().addMessage(TEST_TAB, { role: "assistant", content: "answer1", promptTokens: 100 });
      const msg2 = useChatStore.getState().addMessage(TEST_TAB, { role: "user", content: "round2" });
      useChatStore.getState().addMessage(TEST_TAB, { role: "assistant", content: "answer2", promptTokens: 200 });

      useChatStore.getState().getContext(TEST_TAB);
      expect(useChatStore.getState().contextTokensMap[TEST_TAB]).toBe(200);

      useChatStore.getState().undoFromMessage(TEST_TAB, msg2.id);
      const ctx = useChatStore.getState().getContext(TEST_TAB);
      expect(ctx.length).toBe(2);
      expect(useChatStore.getState().contextTokensMap[TEST_TAB]).toBe(100);
    });

    it("can undo past compact", () => {
      const msg1 = useChatStore.getState().addMessage(TEST_TAB, { role: "user", content: "round1" });
      useChatStore.getState().addMessage(TEST_TAB, { role: "assistant", content: "answer1", promptTokens: 100 });
      useChatStore.getState().addMessage(TEST_TAB, { role: "user", content: "/compact" });
      useChatStore.getState().addMessage(TEST_TAB, { role: "assistant", content: "summary", isCompactSummary: true, promptTokens: 50 });
      const msg2 = useChatStore.getState().addMessage(TEST_TAB, { role: "user", content: "after compact" });
      useChatStore.getState().addMessage(TEST_TAB, { role: "assistant", content: "answer after" });

      const result = useChatStore.getState().undoFromMessage(TEST_TAB, msg2.id);
      expect(result).toBe(true);
      const msgs = useChatStore.getState().messagesMap[TEST_TAB];
      expect(msgs.length).toBe(4);
      expect(msgs[0].id).toBe(msg1.id);
      expect(msgs[1].content).toBe("answer1");
      expect(msgs[2].content).toBe("/compact");
      expect(msgs[3].content).toBe("summary");

      const ctx = useChatStore.getState().getContext(TEST_TAB);
      expect(ctx.length).toBe(3);
    });
  });

  describe("newMessageId", () => {
    it("returns unique ids", () => {
      const id1 = useChatStore.getState().newMessageId();
      const id2 = useChatStore.getState().newMessageId();
      expect(id1).not.toBe(id2);
      expect(id1.length).toBeGreaterThan(0);
    });
  });

  describe("addMessage with id", () => {
    it("uses provided id when given", () => {
      const msg = useChatStore.getState().addMessage(TEST_TAB, { role: "user", content: "test", id: "custom-id-123" });
      expect(msg.id).toBe("custom-id-123");
      expect(useChatStore.getState().messagesMap[TEST_TAB][0].id).toBe("custom-id-123");
    });

    it("generates id when not provided", () => {
      const msg = useChatStore.getState().addMessage(TEST_TAB, { role: "user", content: "test" });
      expect(msg.id).toBeDefined();
      expect(msg.id.length).toBeGreaterThan(0);
    });
  });
});
