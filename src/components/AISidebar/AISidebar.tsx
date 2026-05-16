import { useEffect, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useChatStore, type Message, COMPACT_TAIL_TURNS } from "../../stores/chatStore";
import { useTabStore } from "../../stores/tabStore";
import { useThemeStore } from "../../stores/themeStore";
import { usePermissionStore } from "../../stores/permissionStore";
import { useSkillStore } from "../../stores/skillStore";
import { getLLMClient, type ChatMessage, TimeoutError } from "../../lib/llmClient";
import { buildSystemPrompt, estimateTokens } from "../../lib/contextBuilder";
import { getModelInfo, calculateCost, formatCost } from "../../lib/modelInfo";
import { appendMessage } from "../../lib/chatPersistence";
import { getToolDefinitions, executeTool, WEBFETCH_LIMIT, makeSkillTool, makeRunSkillScriptTool, shouldAddRunSkillScriptTool } from "../../lib/tools";
import type { ToolContext, OnPermissionCallback } from "../../lib/tools";
import type { PermissionRequest, PermissionAction } from "../../lib/permission";
import { useShallow } from "zustand/react/shallow";
import SlashCommandMenu from "./SlashCommandMenu";
import type { SlashCommandMenuHandle } from "./SlashCommandMenu";
import MessageContent from "./MessageContent";
import ContextView from "./ContextView";
import PermissionBar from "./PermissionBar";
import { t } from "../../i18n/core";
import { useT } from "../../i18n/useT";
import "./AISidebar.css";

const emptyMessages: Message[] = [];
const MAX_TOOL_ROUNDS = 10;

function UsageBadge({ tabId, providerId, model, onClick, active }: { tabId: string; providerId: string; model: string; onClick: () => void; active: boolean }) {
  const contextTokens = useChatStore((s) => s.contextTokensMap[tabId] ?? 0);
  const totalTokens = useChatStore((s) => s.totalTokensMap[tabId] ?? 0);
  const cost = useChatStore((s) => s.costMap[tabId] ?? 0);
  const [showTooltip, setShowTooltip] = useState(false);
  useT();

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
            <span>{t("ai.usage.context")}</span>
            <span>{contextTokens.toLocaleString()} tokens</span>
          </div>
          <div className="moflow-ai-usage-tooltip-row">
            <span>{t("ai.usage.usage")}</span>
            <span>{(pct * 100).toFixed(1)}%</span>
          </div>
          <div className="moflow-ai-usage-tooltip-row">
            <span>{t("ai.usage.total")}</span>
            <span>{totalTokens.toLocaleString()} tokens</span>
          </div>
          <div className="moflow-ai-usage-tooltip-row moflow-ai-usage-tooltip-cost">
            <span>{t("ai.usage.cost")}</span>
            <span>{formatCost(cost, currency)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ToolCallStatus({ name, args }: { name: string; args: Record<string, unknown> }) {
  useT();
  let text: string;
  switch (name) {
    case "outline":
      text = t("ai.toolStatus.outline");
      break;
    case "read":
      text = t("ai.toolStatus.read");
      break;
    case "read_section":
      text = t("ai.toolStatus.readSection", { heading: String(args.heading) });
      break;
    case "grep":
      text = t("ai.toolStatus.grep", { pattern: String(args.pattern) });
      break;
    case "find":
      text = t("ai.toolStatus.find", { pattern: String(args.pattern) });
      break;
    case "glob":
      text = t("ai.toolStatus.glob", { pattern: String(args.pattern) });
      break;
    case "ls":
      text = t("ai.toolStatus.ls");
      break;
    case "webfetch":
      text = t("ai.toolStatus.webfetch", { url: String(args.url) });
      break;
    case "skill":
      text = t("ai.toolStatus.skill") + `: ${args.name ?? ""}`;
      break;
    case "run_skill_script":
      text = t("ai.toolStatus.runSkillScript") + `: ${args.script ?? ""}${args.args ? " " + String(args.args) : ""}`;
      break;
    case "write":
      text = `Editing: ${args.path ?? ""}`;
      break;
    case "edit":
      text = `Editing: ${args.path ?? ""}`;
      break;
    default:
      text = t("ai.toolStatus.default", { name });
  }

  return (
    <div className="moflow-ai-tool-status">
      <span className="moflow-ai-tool-spinner" />
      <span>{text}</span>
    </div>
  );
}

function formatToolArgs(name: string, args: Record<string, unknown>): string {
  if (name === "write" || name === "edit") return `edit(${args.path ?? ""})`;
  const entries = Object.entries(args);
  if (entries.length === 0) return `${name}()`;
  const parts = entries.map(([, v]) => String(v));
  return `${name}(${parts.join(", ")})`;
}

function ToolResultBlock({ msg, messages }: { msg: Message; messages: Message[] }) {
  const [open, setOpen] = useState(false);
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
      <details aria-expanded={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary className="moflow-ai-tool-result-summary">
          <span className="moflow-ai-tool-result-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg></span>
          <span className="moflow-ai-tool-args-text">{argsLabel}</span>
        </summary>
        <pre className="moflow-ai-tool-result-content">{msg.content}</pre>
      </details>
    </div>
  );
}


export default function AISidebar() {
  const activeFileId = useTabStore((s) => s.activeFileId);
  const workspaceRoot = useTabStore((s) => s.workspaceRoot);
  const chatKey = useTabStore((s) => {
    if (s.workspaceRoot) return "dir:" + s.workspaceRoot.replace(/\\/g, "/").toLowerCase();
    return s.activeFileId;
  });
  const activeFilePath = useTabStore((s) => {
    const tab = s.files.find((f) => f.id === s.activeFileId);
    return tab?.filePath ?? null;
  });
  const chatLoaded = useChatStore((s) => s.chatLoadedMap[chatKey] ?? true);
  const { messages, isStreaming, streamingContent, addMessage, appendStreamingContent, clearStreamingContent, clearMessages, setStreaming, stopGeneration } = useChatStore(
    useShallow((s) => ({
      messages: s.messagesMap[chatKey] || emptyMessages,
      isStreaming: s.isStreaming,
      streamingContent: s.streamingContentMap[chatKey] ?? "",
      addMessage: s.addMessage,
      appendStreamingContent: s.appendStreamingContent,
      clearStreamingContent: s.clearStreamingContent,
      clearMessages: s.clearMessages,
      setStreaming: s.setStreaming,
      stopGeneration: s.stopGeneration,
    }))
  );
  const docContent = useTabStore((s) => {
    const tab = s.files.find((f) => f.id === s.activeFileId);
    return tab?.content ?? "";
  });
  const aiConfig = useThemeStore((s) => s.aiConfig);
  const setAIConfig = useThemeStore((s) => s.setAIConfig);
  const sidebarWidth = useThemeStore((s) => s.sidebarWidth);
  const setSidebarWidth = useThemeStore((s) => s.setSidebarWidth);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const slashMenuRef = useRef<SlashCommandMenuHandle>(null);
  const [input, setInput] = useState("");
  const [showContext, setShowContext] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [toolCallStatus, setToolCallStatus] = useState<{ name: string; args: Record<string, unknown> } | null>(null);
  const historyIndexRef = useRef(-1);
  const draftInputRef = useRef("");
  const [permissionRequest, setPermissionRequest] = useState<PermissionRequest | null>(null);
  const resolvePermissionRef = useRef<((action: PermissionAction) => void) | null>(null);
  useT();

  useEffect(() => {
    if (!isStreaming) {
      inputRef.current?.focus();
    }
  }, [isStreaming]);

  const slashMenuVisible = input.startsWith("/") && !input.includes(" ");

  const prevFileIdRef = useRef<string>(activeFileId);
  const scrollPosMap = useRef<Record<string, number>>({});
  const skipAutoScrollRef = useRef(false);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        isAtBottomRef.current = atBottom;
        setShowScrollBottom(!atBottom);
        scrollPosMap.current[activeFileId] = el.scrollTop;
      }, 100);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => { el.removeEventListener("scroll", onScroll); if (timer) clearTimeout(timer); };
  }, [activeFileId]);

  useEffect(() => {
    if (prevFileIdRef.current !== activeFileId) {
      const prevEl = messagesContainerRef.current;
      if (prevEl) {
        scrollPosMap.current[prevFileIdRef.current] = prevEl.scrollTop;
      }
      prevFileIdRef.current = activeFileId;
      skipAutoScrollRef.current = true;
      requestAnimationFrame(() => {
        const el = messagesContainerRef.current;
        if (el) {
          const saved = scrollPosMap.current[activeFileId] ?? -1;
          if (saved >= 0) {
            el.scrollTop = saved;
            const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
            isAtBottomRef.current = atBottom;
            setShowScrollBottom(!atBottom);
          } else {
            el.scrollTop = el.scrollHeight;
            isAtBottomRef.current = true;
            setShowScrollBottom(false);
          }
        }
        skipAutoScrollRef.current = false;
      });
    }
  }, [activeFileId]);

  useEffect(() => {
    if (!isAtBottomRef.current || skipAutoScrollRef.current) return;
    if (isStreaming) {
      requestAnimationFrame(() => {
        const el = messagesContainerRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, streamingContent, isStreaming]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
    isAtBottomRef.current = true;
    setShowScrollBottom(false);
  };

  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 120) + "px";
    }
  }, [input, isStreaming]);

  const doCompact = async () => {
    const contextMsgs = useChatStore.getState().getContext(chatKey);

    const contextTokens = useChatStore.getState().contextTokensMap[chatKey] ?? 0;

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
      ? t("ai.compact.summaryWithPrevious", { prev: previousSummary.content, content: summaryContent })
      : t("ai.compact.summaryNew", { content: summaryContent });

    const compactMsg = addMessage(chatKey, { role: "user", content: "/compact" });
    await appendMessage(chatKey, compactMsg);

    setStreaming(true);
    clearStreamingContent(chatKey);

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
          appendStreamingContent(chatKey, chunk);
        },
        controller.signal
      );

      const promptTokens = result.usage.promptTokens;
      const completionTokens = result.usage.completionTokens;
      const { cost: costVal } = calculateCost(promptTokens, completionTokens, aiConfig.providerId, aiConfig.model);
      useChatStore.getState().recordUsage(chatKey, promptTokens, completionTokens, costVal);

      const content = useChatStore.getState().streamingContentMap[chatKey] ?? "";
      const summaryMsg = addMessage(chatKey, { role: "assistant", content, isCompactSummary: true });
      await appendMessage(chatKey, summaryMsg);

      useChatStore.setState((state) => ({
        contextMap: { ...state.contextMap, [chatKey]: [...tailMsgs, summaryMsg] },
      }));
    } catch (e) {
      if (e instanceof TimeoutError) {
        console.error(`[AISidebar] Request timeout: ${e.message}`);
        appendStreamingContent(chatKey, `\n\n? ${t("ai.error.timeout")}`);
      } else if (e instanceof DOMException && e.name === "AbortError") {
        const content = useChatStore.getState().streamingContentMap[chatKey];

        if (content) {
          const summaryMsg = addMessage(chatKey, { role: "assistant", content, isCompactSummary: true });
          await appendMessage(chatKey, summaryMsg);
          useChatStore.setState((state) => ({
            contextMap: { ...state.contextMap, [chatKey]: [...tailMsgs, summaryMsg] },
          }));
        }
      } else {
        const errorMsg = e instanceof Error ? e.message : String(e);
        appendStreamingContent(chatKey, `\n\n|?${t("ai.error.requestFailed")}: ${errorMsg}`);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      clearStreamingContent(chatKey);
    }
  };

  const onPermission: OnPermissionCallback = useCallback((request: PermissionRequest) => {
    return new Promise<PermissionAction>((resolve) => {
      setPermissionRequest(request);
      resolvePermissionRef.current = resolve;
    });
  }, []);

  const handlePermissionAllow = useCallback(() => {
    resolvePermissionRef.current?.("allow");
    resolvePermissionRef.current = null;
    setPermissionRequest(null);
  }, []);

  const handlePermissionAlwaysAllow = useCallback(() => {
    if (permissionRequest) {
      const { permissionKey, input, alwaysPatterns } = permissionRequest;
      const pattern = alwaysPatterns[0] ?? input;
      usePermissionStore.getState().addSessionRule(chatKey, {
        permissionKey,
        pattern,
        action: "allow",
      });
    }
    resolvePermissionRef.current?.("allow");
    resolvePermissionRef.current = null;
    setPermissionRequest(null);
  }, [chatKey, permissionRequest]);

  const handlePermissionDeny = useCallback(() => {
    resolvePermissionRef.current?.("deny");
    resolvePermissionRef.current = null;
    setPermissionRequest(null);
  }, []);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    isAtBottomRef.current = true;
    setShowScrollBottom(false);

    if (text.startsWith("/")) {
      const errMsg = addMessage(chatKey, { role: "assistant", content: `|?${t("ai.error.unknownCommand")}` });
      await appendMessage(chatKey, errMsg);
      setInput("");
      return;
    }

    const maxContext = getModelInfo(aiConfig.providerId, aiConfig.model).maxContext || 0;
    const contextTokens = useChatStore.getState().contextTokensMap[chatKey] ?? 0;

    if (maxContext > 0 && contextTokens > maxContext * 0.8) {
      await doCompact();
    }

    setInput("");
    historyIndexRef.current = -1;
    const userMsg = addMessage(chatKey, { role: "user", content: text });
    await appendMessage(chatKey, userMsg);

    setStreaming(true);
    clearStreamingContent(chatKey);

    const controller = new AbortController();
    abortRef.current = controller;

    const docTokens = estimateTokens(docContent);
    const docRatio = 0.50;
    const reserved = Math.floor(maxContext * (1 - docRatio));
    const needsDocTools = docTokens > (maxContext - reserved);

    const { prompt: systemPrompt } = buildSystemPrompt(docContent, maxContext, needsDocTools, workspaceRoot, activeFilePath);
    const tools = getToolDefinitions(needsDocTools, workspaceRoot, activeFilePath);
    const availableSkills = useSkillStore.getState().discoveredSkills.filter((s) => s.enabled);
    if (availableSkills.length > 0) {
      tools.push(makeSkillTool());
    }
    const hasRunScript = shouldAddRunSkillScriptTool();
    if (hasRunScript) {
      tools.push(makeRunSkillScriptTool());
    }

    const toolCtx: ToolContext = {
      workspaceRoot: workspaceRoot ?? undefined,
      activeFilePath: activeFilePath ?? undefined,
      docContent,
      permissions: useThemeStore.getState().permissions,
      sessionRules: usePermissionStore.getState().sessionRules[chatKey] ?? [],
      chatKey,
    };

    try {
      const client = getLLMClient(aiConfig);
      let round = 0;
      let webfetchCount = 0;

      while (round <= MAX_TOOL_ROUNDS) {
        round++;

        const contextMsgs = useChatStore.getState().getContext(chatKey);
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
            appendStreamingContent(chatKey, chunk);
          },
          controller.signal,
          { tools }
        );

        const promptTokens = result.usage.promptTokens;
        const completionTokens = result.usage.completionTokens;
        const { cost: costVal } = calculateCost(promptTokens, completionTokens, aiConfig.providerId, aiConfig.model);
        useChatStore.getState().recordUsage(chatKey, promptTokens, completionTokens, costVal);

        const content = useChatStore.getState().streamingContentMap[chatKey] ?? "";

        if (result.finishReason !== "tool_calls" || !result.toolCalls?.length) {
          const assistantMsg = addMessage(chatKey, {
            role: "assistant",
            content,
            reasoningContent: result.reasoningContent || undefined,
          });
          await appendMessage(chatKey, assistantMsg);
          clearStreamingContent(chatKey);
          break;
        }

        if (controller.signal.aborted) {
          if (content) {
            const assistantMsg = addMessage(chatKey, { role: "assistant", content });
            await appendMessage(chatKey, assistantMsg);
          }
          clearStreamingContent(chatKey);
          break;
        }

        const assistantMsg = addMessage(chatKey, {
          role: "assistant",
          content,
          toolCalls: result.toolCalls,
          reasoningContent: result.reasoningContent || undefined,
        });
        await appendMessage(chatKey, assistantMsg);
        clearStreamingContent(chatKey);

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
              const limitMsg = t("ai.error.webfetchLimit", { n: WEBFETCH_LIMIT });
              const toolMsg = addMessage(chatKey, {
                role: "tool",
                content: limitMsg,
                toolCallId: tc.id,
                toolName: tc.name,
              });
              await appendMessage(chatKey, toolMsg);
              continue;
            }
          }

          setToolCallStatus({ name: tc.name, args });

          let toolResult: string;
          try {
            toolResult = await executeTool(tc.name, args, controller.signal, toolCtx, onPermission);
          } catch (e) {
            toolResult = `|?${t("ai.error.toolExecution")}: ${e instanceof Error ? e.message : String(e)}`;
          }

          if (controller.signal.aborted) break;

          const toolMsg = addMessage(chatKey, {
            role: "tool",
            content: toolResult,
            toolCallId: tc.id,
            toolName: tc.name,
          });
          await appendMessage(chatKey, toolMsg);
        }

        if (controller.signal.aborted) break;

        setToolCallStatus(null);

        if (round >= MAX_TOOL_ROUNDS) {
          const limitMsg = addMessage(chatKey, {
            role: "assistant",
            content: t("ai.error.toolRoundsLimit"),
          });
          await appendMessage(chatKey, limitMsg);
          break;
        }
      }
    } catch (e) {
      if (e instanceof TimeoutError) {
        console.error(`[AISidebar] Request timeout: ${e.message}`);
        appendStreamingContent(chatKey, `\n\n? ${t("ai.error.timeout")}`);
      } else if (e instanceof DOMException && e.name === "AbortError") {
        // handled in finally
      } else {
        const errorMsg = e instanceof Error ? e.message : String(e);
        appendStreamingContent(chatKey, `\n\n|?${t("ai.error.requestFailed")}: ${errorMsg}`);
      }

      const content = useChatStore.getState().streamingContentMap[chatKey];
      if (content) {
        const assistantMsg = addMessage(chatKey, { role: "assistant", content });
        await appendMessage(chatKey, assistantMsg);
      }
    } finally {
      useChatStore.getState().cleanupIncompleteToolCalls(chatKey);
      setToolCallStatus(null);
      setStreaming(false);
      abortRef.current = null;
      clearStreamingContent(chatKey);
      if (resolvePermissionRef.current) {
        resolvePermissionRef.current("deny");
        resolvePermissionRef.current = null;
      }
      setPermissionRequest(null);
    }
  };

  const handleSlashCommand = async (id: string) => {
    setInput("");

    if (id === "new") {
      clearMessages(chatKey);
      usePermissionStore.getState().clearSessionRules(chatKey);
      return;
    }

if (id === "compact") {
      await doCompact();
      return;
    }
  };

  const handleSelectModel = (modelId: string) => {
    setInput("");
    setAIConfig({ ...aiConfig, model: modelId });
  };

  const handleStop = () => {
    stopGeneration();
    abortRef.current?.abort();
    invoke("cancel_requests");
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

  const getUserHistory = useCallback((): string[] => {
    const msgs = useChatStore.getState().messagesMap[chatKey] ?? [];
    const history: string[] = [];
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === "user") {
        history.push(msgs[i].content);
      }
    }
    return history;
  }, [chatKey]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (slashMenuVisible && slashMenuRef.current) {
      const handled = slashMenuRef.current.handleKeyDown(e);
      if (handled) return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
      return;
    }

    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      const textarea = e.currentTarget as HTMLTextAreaElement;
      const { selectionStart, selectionEnd } = textarea;
      const isFirstLine = input.substring(0, selectionStart).indexOf("\n") === -1;
      const isLastLine = input.substring(selectionEnd).indexOf("\n") === -1;

      if (e.key === "ArrowUp") {
        if (isFirstLine && selectionStart === selectionEnd) {
          e.preventDefault();
          const history = getUserHistory();
          if (history.length === 0) return;

          if (historyIndexRef.current === -1) {
            draftInputRef.current = input;
            historyIndexRef.current = 0;
          } else if (historyIndexRef.current < history.length - 1) {
            historyIndexRef.current++;
          } else {
            return;
          }
          setInput(history[historyIndexRef.current]);
          return;
        }
      }

      if (e.key === "ArrowDown") {
        if (historyIndexRef.current !== -1 && isLastLine && selectionStart === selectionEnd) {
          e.preventDefault();
          const history = getUserHistory();
          if (historyIndexRef.current > 0) {
            historyIndexRef.current--;
            setInput(history[historyIndexRef.current]);
          } else {
            historyIndexRef.current = -1;
            setInput(draftInputRef.current);
          }
          return;
        }
      }
    }

    if (historyIndexRef.current !== -1 && e.key.length === 1) {
      historyIndexRef.current = -1;
    }
  };

  if (!chatKey) {
    return (
      <div className="moflow-ai-sidebar" style={{ width: sidebarWidth, minWidth: sidebarWidth }}>
        <div className="moflow-ai-resize-handle" onMouseDown={handleResizeStart} />
        <div className="moflow-ai-header">
          <span className="moflow-ai-header-title" style={{ flex: "none" }}>{t("ai.header.title")}</span>
        </div>
        <div className="moflow-ai-messages flex items-center justify-center">
          <div className="moflow-ai-empty">
            <div className="moflow-ai-empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
            <p>{t("ai.empty.openDoc")}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="moflow-ai-sidebar" style={{ width: sidebarWidth, minWidth: sidebarWidth }}>
      <div className="moflow-ai-resize-handle" onMouseDown={handleResizeStart} />
      <div className="moflow-ai-header">
        <span className="moflow-ai-header-title" style={{ flex: "none" }}>{showContext ? t("ai.header.context") : t("ai.header.title")}</span>
        <span className="flex-1" />
        <span className="moflow-ai-header-mode">
          {aiConfig.mode === "mock" ? "Mock" : aiConfig.model || "API"}
        </span>
        <UsageBadge tabId={chatKey} providerId={aiConfig.providerId} model={aiConfig.model} onClick={() => setShowContext((v) => !v)} active={showContext} />
      </div>

      {showContext ? (
        <ContextView tabId={chatKey} providerId={aiConfig.providerId} model={aiConfig.model} docContent={docContent} />
      ) : (
      <div className="moflow-ai-messages" ref={messagesContainerRef} role="log" aria-live="polite">
        {!chatLoaded ? (
          <div className="moflow-ai-empty">
            <div className="moflow-ai-loading-spinner" />
            <p>{t("ai.empty.loading")}</p>
          </div>
        ) : messages.length === 0 && !streamingContent ? (
          <div className="moflow-ai-empty">
            <div className="moflow-ai-empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
            <p>{t("ai.empty.prompt")}</p>
          </div>
        ) : null}
        {chatLoaded && messages.map((msg) => {
          if (msg.content === "/compact" && msg.role === "user") {
            return (
              <div key={msg.id} className="moflow-ai-compact-divider">
                <span>{t("ai.compacted")}</span>
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
              </div>
            </div>
          );
        })}
        {streamingContent && (
          <div className="moflow-ai-message moflow-ai-message-assistant">
            <div className="moflow-ai-message-content">
              <MessageContent content={streamingContent} />
              {isStreaming && <span className="moflow-ai-cursor">▊</span>}
            </div>
          </div>
        )}
        {toolCallStatus && <ToolCallStatus name={toolCallStatus.name} args={toolCallStatus.args} />}
        <div ref={messagesEndRef} />
        {showScrollBottom && (
          <button className="moflow-ai-scroll-bottom-btn" onClick={scrollToBottom} aria-label={t("ai.scrollBottom")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 13l5 5 5-5" />
              <path d="M7 6l5 5 5-5" />
            </svg>
          </button>
        )}
      </div>
      )}

      {!showContext && (
      <div className="moflow-ai-input-area">
        {permissionRequest && (
          <PermissionBar
            request={permissionRequest}
            onAllow={handlePermissionAllow}
            onAlwaysAllow={handlePermissionAlwaysAllow}
            onDeny={handlePermissionDeny}
          />
        )}
        <div className="moflow-ai-input-wrap relative">
          <textarea
            ref={inputRef}
            className="moflow-ai-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("ai.input.placeholder")}
            rows={2}
            disabled={isStreaming || !!permissionRequest}
          />
          {isStreaming ? (
            <button className="moflow-ai-action-btn moflow-ai-action-stop" onClick={handleStop}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              className="moflow-ai-action-btn moflow-ai-action-send"
              onClick={handleSend}
              disabled={!input.trim()}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          )}
        </div>
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

    </div>
  );
}
