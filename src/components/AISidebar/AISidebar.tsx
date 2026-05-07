import { useEffect, useRef, useState } from "react";
import { useChatStore, type Message, COMPACT_TAIL_TURNS } from "../../stores/chatStore";
import { useTabStore } from "../../stores/tabStore";
import { useThemeStore } from "../../stores/themeStore";
import { useAIConfigStore } from "../../stores/aiConfigStore";
import { getLLMClient, type ChatMessage, TimeoutError } from "../../lib/llmClient";
import { buildSystemPrompt, estimateTokens } from "../../lib/contextBuilder";
import { getModelInfo, calculateCost, formatCost } from "../../lib/modelInfo";
import { appendMessage } from "../../lib/chatPersistence";
import { docToolDefinitions, networkToolDefinitions, executeTool, WEBFETCH_LIMIT } from "../../lib/tools";
import AIConfigModal from "./AIConfigModal";
import SlashCommandMenu from "./SlashCommandMenu";
import type { SlashCommandMenuHandle } from "./SlashCommandMenu";
import MessageContent from "./MessageContent";
import ContextView from "./ContextView";
import "./AISidebar.css";

const isZh = navigator.language.startsWith("zh");
const t = (zh: string, en: string) => (isZh ? zh : en);
const emptyMessages: Message[] = [];
const MAX_TOOL_ROUNDS = 10;

function UsageBadge({ tabId, providerId, model, onClick, active }: { tabId: string; providerId: string; model: string; onClick: () => void; active: boolean }) {
  const contextTokens = useChatStore((s) => s.contextTokensMap[tabId] ?? 0);
  const totalTokens = useChatStore((s) => s.totalTokensMap[tabId] ?? 0);
  const cost = useChatStore((s) => s.costMap[tabId] ?? 0);
  const [showTooltip, setShowTooltip] = useState(false);

  const modelInfo = getModelInfo(providerId, model);
  const maxContext = modelInfo.maxContext || 0;
  const pct = maxContext > 0 ? Math.min(contextTokens / maxContext, 1) : 0;
  const radius = 10;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);

  let ringColor = "#22c55e";
  if (pct > 0.8) ringColor = "#ef4444";
  else if (pct > 0.5) ringColor = "#eab308";

  const currency = modelInfo.currency || "USD";

  return (
    <div
      className={`moflow-ai-usage-badge${active ? " moflow-ai-usage-badge-active" : ""}`}
      onClick={onClick}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" className="moflow-ai-usage-ring">
        <circle cx="12" cy="12" r={radius} fill="none" stroke="var(--moflow-border)" strokeWidth="2.5" />
        <circle
          cx="12" cy="12" r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth="2.5"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 12 12)"
        />
      </svg>
      {showTooltip && (
        <div className="moflow-ai-usage-tooltip">
          <div className="moflow-ai-usage-tooltip-row">
            <span>{t("上下文", "Context")}</span>
            <span>{contextTokens.toLocaleString()} tokens</span>
          </div>
          <div className="moflow-ai-usage-tooltip-row">
            <span>{t("使用率", "Usage")}</span>
            <span>{(pct * 100).toFixed(1)}%</span>
          </div>
          <div className="moflow-ai-usage-tooltip-row">
            <span>{t("累计", "Total")}</span>
            <span>{totalTokens.toLocaleString()} tokens</span>
          </div>
          <div className="moflow-ai-usage-tooltip-row moflow-ai-usage-tooltip-cost">
            <span>{t("费用", "Cost")}</span>
            <span>{formatCost(cost, currency)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ToolCallStatus({ name, args }: { name: string; args: Record<string, unknown> }) {
  let text: string;
  switch (name) {
    case "outline":
      text = t("正在获取文档大纲...", "Getting document outline...");
      break;
    case "grep":
      text = t(`正在搜索: "${args.pattern}"`, `Searching: "${args.pattern}"`);
      break;
    case "read_lines":
      text = t(`正在读取第 ${args.start}-${args.end} 行`, `Reading lines ${args.start}-${args.end}`);
      break;
    case "read_section":
      text = t(`正在读取: ${args.heading}`, `Reading: ${args.heading}`);
      break;
    case "webfetch":
      text = t(`正在访问: ${args.url}`, `Fetching: ${args.url}`);
      break;
    default:
      text = t(`正在执行: ${name}`, `Executing: ${name}`);
  }

  return (
    <div className="moflow-ai-tool-status">
      <span className="moflow-ai-tool-spinner" />
      <span>{text}</span>
    </div>
  );
}

function formatToolArgs(name: string, args: Record<string, unknown>): string {
  const entries = Object.entries(args);
  if (entries.length === 0) return `${name}()`;
  const parts = entries.map(([, v]) => String(v));
  return `${name}(${parts.join(", ")})`;
}

function ToolResultBlock({ msg, messages }: { msg: Message; messages: Message[] }) {
  let argsLabel = msg.toolName ?? "";
  if (msg.toolCallId) {
    for (const m of messages) {
      if (m.role === "assistant" && m.toolCalls) {
        const tc = m.toolCalls.find((c) => c.id === msg.toolCallId);
        if (tc) {
          try {
            const args = JSON.parse(tc.arguments || "{}");
            argsLabel = formatToolArgs(tc.name, args);
          } catch {
            argsLabel = tc.name + "()";
          }
          break;
        }
      }
    }
  }

  return (
    <div className="moflow-ai-tool-result">
      <details>
        <summary className="moflow-ai-tool-result-summary">
          <span className="moflow-ai-tool-result-icon">🔧</span>
          <span className="moflow-ai-tool-args-text">{argsLabel}</span>
        </summary>
        <pre className="moflow-ai-tool-result-content">{msg.content}</pre>
      </details>
    </div>
  );
}

export default function AISidebar() {
  const activeFileId = useTabStore((s) => s.activeFileId);
  const messages = useChatStore((s) => s.messagesMap[activeFileId] || emptyMessages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const addMessage = useChatStore((s) => s.addMessage);
  const appendToLastMessage = useChatStore((s) => s.appendToLastMessage);
  const addToolCallsToLastMessage = useChatStore((s) => s.addToolCallsToLastMessage);
  const addReasoningContentToLastMessage = useChatStore((s) => s.addReasoningContentToLastMessage);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const flushAssistantMessage = useChatStore((s) => s.flushAssistantMessage);
  const setStreaming = useChatStore((s) => s.setStreaming);
  const stopGeneration = useChatStore((s) => s.stopGeneration);
  const docContent = useTabStore((s) => {
    const tab = s.files.find((f) => f.id === s.activeFileId);
    return tab?.content ?? "";
  });
  const aiConfig = useAIConfigStore((s) => s.config);
  const saveConfig = useAIConfigStore((s) => s.saveConfig);
  const sidebarWidth = useThemeStore((s) => s.sidebarWidth);
  const setSidebarWidth = useThemeStore((s) => s.setSidebarWidth);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const slashMenuRef = useRef<SlashCommandMenuHandle>(null);
  const [input, setInput] = useState("");
  const [showConfig, setShowConfig] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [toolCallStatus, setToolCallStatus] = useState<{ name: string; args: Record<string, unknown> } | null>(null);

  useEffect(() => {
    if (!isStreaming) {
      inputRef.current?.focus();
    }
  }, [isStreaming]);

  const slashMenuVisible = input.startsWith("/") && !input.includes(" ");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 120) + "px";
    }
  }, [input]);

  const doCompact = async () => {
    const contextMsgs = useChatStore.getState().getContext(activeFileId);
    if (contextMsgs.length === 0) return;

    const contextTokens = useChatStore.getState().contextTokensMap[activeFileId] ?? 0;

    let tailStart = contextMsgs.length;
    let turnCount = 0;
    for (let i = contextMsgs.length - 1; i >= 0 && turnCount < COMPACT_TAIL_TURNS; i--) {
      if (contextMsgs[i].role === "user") {
        turnCount++;
        tailStart = i;
      }
    }
    if (turnCount === 0) return;

    const headMsgs = contextMsgs.slice(0, tailStart);
    const tailMsgs = contextMsgs.slice(tailStart);

    if (headMsgs.length === 0) return;

    const pruneThreshold = contextTokens * 0.1;
    const keepBudget = contextTokens * 0.15;
    let prunedHead = headMsgs;
    if (contextTokens > 0) {
      const assistantMsgs = headMsgs.filter((m) => m.role === "assistant" && m.promptTokens !== undefined);
      if (assistantMsgs.length >= 2) {
        const sorted = [...assistantMsgs].sort((a, b) => (a.promptTokens ?? 0) - (b.promptTokens ?? 0));
        const diffs: number[] = [];
        for (let i = 1; i < sorted.length; i++) {
          diffs.push((sorted[i].promptTokens ?? 0) - (sorted[i - 1].promptTokens ?? 0));
        }
        let prunableTokens = 0;
        for (let i = 0; i < diffs.length; i++) {
          prunableTokens += diffs[i];
        }
        if (prunableTokens >= pruneThreshold) {
          let keptFromEnd = 0;
          let cutRound = diffs.length;
          for (let i = diffs.length - 1; i >= 0; i--) {
            if (keptFromEnd + diffs[i] > keepBudget) break;
            keptFromEnd += diffs[i];
            cutRound = i;
          }
          if (cutRound < diffs.length) {
            const cutAtToken = sorted[cutRound].promptTokens ?? 0;
            prunedHead = headMsgs.map((m) => {
              if (m.role === "tool") {
                let isOldTool = false;
                for (const a of headMsgs) {
                  if (a.role === "assistant" && a.promptTokens !== undefined && a.promptTokens < cutAtToken && a.toolCalls) {
                    if (a.toolCalls.some((tc) => tc.id === m.toolCallId)) {
                      isOldTool = true;
                      break;
                    }
                  }
                }
                if (isOldTool) {
                  return { ...m, content: "[Tool result cleared]" };
                }
              }
              return m;
            });
          }
        }
      }
    }

    let previousSummary: Message | null = null;
    for (let i = contextMsgs.length - 1; i >= 0; i--) {
      if (contextMsgs[i].role === "assistant" && contextMsgs[i].isCompactSummary) {
        previousSummary = contextMsgs[i];
        break;
      }
    }

    let summaryContentParts: string[];
    const allMsgs = [...prunedHead, ...tailMsgs];
    if (previousSummary) {
      const prevIdx = allMsgs.findIndex((m) => m.id === previousSummary.id);
      const newMsgs = prevIdx >= 0 ? allMsgs.slice(prevIdx + 1) : allMsgs;
      summaryContentParts = newMsgs.map((m) => {
        const label = m.role === "user" ? "User" : m.role === "tool" ? "Tool" : "AI";
        return `${label}: ${m.content}`;
      });
    } else {
      summaryContentParts = allMsgs.map((m) => {
        const label = m.role === "user" ? "User" : m.role === "tool" ? "Tool" : "AI";
        return `${label}: ${m.content}`;
      });
    }
    const summaryContent = summaryContentParts.join("\n");

    const summaryPrompt = previousSummary
      ? isZh
        ? `<previous-summary>\n${previousSummary.content}\n</previous-summary>\n\n请将以上历史摘要和以下新对话一起总结为一份更新后的摘要，保留关键信息：\n\n${summaryContent}`
        : `<previous-summary>\n${previousSummary.content}\n</previous-summary>\n\nPlease summarize the previous summary above together with the new conversation below into an updated summary, preserving key information:\n\n${summaryContent}`
      : isZh
        ? `请将以下对话历史总结为简洁的摘要，保留关键信息：\n\n${summaryContent}`
        : `Please summarize the following conversation history concisely, preserving key information:\n\n${summaryContent}`;

    const compactMsg = addMessage(activeFileId, { role: "user", content: "/compact" });
    await appendMessage(activeFileId, compactMsg);

    setStreaming(true);
    addMessage(activeFileId, { role: "assistant", content: "", isCompactSummary: true });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const client = getLLMClient(aiConfig);
      const maxContext = getModelInfo(aiConfig.providerId, aiConfig.model).maxContext;
      const { prompt: systemPrompt } = buildSystemPrompt(docContent, maxContext);
      const result = await client.chat(
        [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: summaryPrompt,
          },
        ],
        (chunk) => {
          appendToLastMessage(activeFileId, chunk);
        },
        controller.signal
      );

      const promptTokens = result.usage.promptTokens;
      const completionTokens = result.usage.completionTokens;
      const { cost: costVal } = calculateCost(promptTokens, completionTokens, aiConfig.providerId, aiConfig.model);
      useChatStore.getState().recordUsage(activeFileId, promptTokens, completionTokens, costVal);
    } catch (e) {
      if (e instanceof TimeoutError) {
        console.error(`[AISidebar] Request timeout: ${e.message}`);
        appendToLastMessage(activeFileId, `\n\n❌ ${t("请求超时", "Request timed out")}`);
      } else if (e instanceof DOMException && e.name === "AbortError") {
        return;
      } else {
        const errorMsg = e instanceof Error ? e.message : String(e);
        appendToLastMessage(activeFileId, `\n\n❌ ${t("请求失败", "Request failed")}: ${errorMsg}`);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      await flushAssistantMessage(activeFileId);

      const allMsgs = useChatStore.getState().messagesMap[activeFileId] ?? [];
      const summaryMsg = allMsgs[allMsgs.length - 1];
      useChatStore.setState((state) => ({
        contextMap: { ...state.contextMap, [activeFileId]: [...tailMsgs, summaryMsg] },
      }));
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    if (text.startsWith("/")) return;

    const maxContext = getModelInfo(aiConfig.providerId, aiConfig.model).maxContext || 0;
    const contextTokens = useChatStore.getState().contextTokensMap[activeFileId] ?? 0;

    if (maxContext > 0 && contextTokens > maxContext * 0.8) {
      await doCompact();
    }

    setInput("");
    const userMsg = addMessage(activeFileId, { role: "user", content: text });
    await appendMessage(activeFileId, userMsg);

    setStreaming(true);
    addMessage(activeFileId, { role: "assistant", content: "" });

    const controller = new AbortController();
    abortRef.current = controller;

    const docTokens = estimateTokens(docContent);
    const docRatio = 0.50;
    const reserved = Math.floor(maxContext * (1 - docRatio));
    const needsDocTools = docTokens > (maxContext - reserved);

    const { prompt: systemPrompt } = buildSystemPrompt(docContent, maxContext, needsDocTools);
    const tools = needsDocTools
      ? [...docToolDefinitions, ...networkToolDefinitions]
      : [...networkToolDefinitions];

    try {
      const client = getLLMClient(aiConfig);
      let round = 0;
      let webfetchCount = 0;

      while (round <= MAX_TOOL_ROUNDS) {
        round++;

        const contextMsgs = useChatStore.getState().getContext(activeFileId);
        const historyMsgs: ChatMessage[] = contextMsgs.map((m) => {
          const msg: ChatMessage = { role: m.role as ChatMessage["role"], content: m.content };
          if (m.role === "assistant" && m.toolCalls?.length) {
            msg.tool_calls = m.toolCalls;
          }
          if (m.role === "assistant" && m.reasoningContent) {
            msg.reasoningContent = m.reasoningContent;
          }
          if (m.role === "tool") {
            msg.tool_call_id = m.toolCallId;
            msg.name = m.toolName;
          }
          return msg;
        });

        const chatMessages: ChatMessage[] = [
          { role: "system", content: systemPrompt },
          ...historyMsgs,
        ];

        const result = await client.chat(
          chatMessages,
          (chunk) => {
            appendToLastMessage(activeFileId, chunk);
          },
          controller.signal,
          { tools }
        );

        const promptTokens = result.usage.promptTokens;
        const completionTokens = result.usage.completionTokens;
        const { cost: costVal } = calculateCost(promptTokens, completionTokens, aiConfig.providerId, aiConfig.model);
        useChatStore.getState().recordUsage(activeFileId, promptTokens, completionTokens, costVal);

        if (result.reasoningContent) {
          addReasoningContentToLastMessage(activeFileId, result.reasoningContent);
        }

        if (result.finishReason !== "tool_calls" || !result.toolCalls?.length) {
          break;
        }

        addToolCallsToLastMessage(activeFileId, result.toolCalls);
        await flushAssistantMessage(activeFileId);

        for (const tc of result.toolCalls) {
          if (controller.signal.aborted) break;

          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.arguments || "{}");
          } catch {
            args = {};
          }

          if (tc.name === "webfetch") {
            webfetchCount++;
            if (webfetchCount > WEBFETCH_LIMIT) {
              console.warn(`[AISidebar] webfetch limit reached (${WEBFETCH_LIMIT} per request)`);
              const limitMsg = t(
                `Webfetch 调用次数已达上限（${WEBFETCH_LIMIT} 次）`,
                `Webfetch call limit reached (${WEBFETCH_LIMIT} per request)`
              );
              const toolMsg = addMessage(activeFileId, {
                role: "tool",
                content: limitMsg,
                toolCallId: tc.id,
                toolName: tc.name,
              });
              await appendMessage(activeFileId, toolMsg);
              continue;
            }
          }

          setToolCallStatus({ name: tc.name, args });

          const toolResult = await executeTool(tc.name, args, docContent, controller.signal);

          const toolMsg = addMessage(activeFileId, {
            role: "tool",
            content: toolResult,
            toolCallId: tc.id,
            toolName: tc.name,
          });
          await appendMessage(activeFileId, toolMsg);
        }

        setToolCallStatus(null);

        addMessage(activeFileId, { role: "assistant", content: "" });

        if (round >= MAX_TOOL_ROUNDS) {
          appendToLastMessage(activeFileId, t(
            "（已达到工具调用次数上限，请基于已有信息回答）",
            "(Maximum tool call rounds reached. Please answer based on available information.)"
          ));
          break;
        }
      }
    } catch (e) {
      if (e instanceof TimeoutError) {
        console.error(`[AISidebar] Request timeout: ${e.message}`);
        appendToLastMessage(activeFileId, `\n\n❌ ${t("请求超时", "Request timed out")}`);
      } else if (e instanceof DOMException && e.name === "AbortError") {
        return;
      } else {
        const errorMsg = e instanceof Error ? e.message : String(e);
        appendToLastMessage(activeFileId, `\n\n❌ ${t("请求失败", "Request failed")}: ${errorMsg}`);
      }
    } finally {
      setToolCallStatus(null);
      setStreaming(false);
      abortRef.current = null;
      await flushAssistantMessage(activeFileId);
    }
  };

  const handleSlashCommand = async (id: string) => {
    setInput("");

    if (id === "new") {
      clearMessages(activeFileId);
      return;
    }

    if (id === "compact") {
      await doCompact();
    }
  };

  const handleSelectModel = (modelId: string) => {
    setInput("");
    saveConfig({ ...aiConfig, model: modelId });
  };

  const handleStop = () => {
    stopGeneration();
    abortRef.current?.abort();
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const handleMouseMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      const newWidth = Math.max(280, Math.min(720, startWidth + delta));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (slashMenuVisible && slashMenuRef.current) {
      const handled = slashMenuRef.current.handleKeyDown(e);
      if (handled) return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="moflow-ai-sidebar" style={{ width: sidebarWidth, minWidth: sidebarWidth }}>
      <div className="moflow-ai-resize-handle" onMouseDown={handleResizeStart} />
      <div className="moflow-ai-header">
        <span className="moflow-ai-header-title">{showContext ? t("上下文", "Context") : t("AI 助手", "AI Assistant")}</span>
        <span className="moflow-ai-header-mode">
          {aiConfig.mode === "mock" ? "Mock" : aiConfig.model || "API"}
        </span>
        <UsageBadge tabId={activeFileId} providerId={aiConfig.providerId} model={aiConfig.model} onClick={() => setShowContext((v) => !v)} active={showContext} />
        <button
          className="moflow-ai-config-btn"
          onClick={() => setShowConfig(true)}
          title={t("AI 配置", "AI Configuration")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      {showContext ? (
        <ContextView tabId={activeFileId} providerId={aiConfig.providerId} model={aiConfig.model} docContent={docContent} />
      ) : (
      <div className="moflow-ai-messages">
        {messages.length === 0 && (
          <div className="moflow-ai-empty">
            <div className="moflow-ai-empty-icon">✨</div>
            <p>{t("有什么关于当前文档的问题？", "Questions about the current document?")}</p>
          </div>
        )}
        {messages.map((msg) => {
          if (msg.content === "/compact" && msg.role === "user") {
            return (
              <div key={msg.id} className="moflow-ai-compact-divider">
                <span>{t("已压缩", "Compacted")}</span>
              </div>
            );
          }

          if (msg.role === "tool") {
            return <ToolResultBlock key={msg.id} msg={msg} messages={messages} />;
          }

          if (msg.role === "assistant" && !msg.content && msg.toolCalls?.length) {
            return null;
          }

          return (
            <div key={msg.id} className={`moflow-ai-message moflow-ai-message-${msg.role}`}>
              <div className="moflow-ai-message-content">
                {msg.role === "assistant" ? (
                  <MessageContent content={msg.content} />
                ) : (
                  msg.content
                )}
                {msg.role === "assistant" && isStreaming && msg === messages[messages.length - 1] && (
                  <span className="moflow-ai-cursor">▌</span>
                )}
              </div>
            </div>
          );
        })}
        {toolCallStatus && <ToolCallStatus name={toolCallStatus.name} args={toolCallStatus.args} />}
        <div ref={messagesEndRef} />
      </div>
      )}

      {!showContext && (
      <div className="moflow-ai-input-area">
        {isStreaming ? (
          <button className="moflow-ai-stop-btn" onClick={handleStop}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
            <span>{t("停止", "Stop")}</span>
          </button>
        ) : (
          <>
            <textarea
              ref={inputRef}
              className="moflow-ai-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("输入消息...", "Type a message...")}
              rows={1}
              disabled={isStreaming}
            />
            <button
              className="moflow-ai-send-btn"
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </>
        )}
      </div>
      )}

      {slashMenuVisible && !isStreaming && (
        <SlashCommandMenu
          ref={slashMenuRef}
          input={input}
          inputRef={inputRef}
          onSelectCommand={handleSlashCommand}
          onSelectModel={handleSelectModel}
          onClose={() => setInput("")}
        />
      )}

      <AIConfigModal key={showConfig ? "open" : "closed"} open={showConfig} onClose={() => setShowConfig(false)} />
    </div>
  );
}
