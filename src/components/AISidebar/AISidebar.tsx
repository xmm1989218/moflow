import { useEffect, useRef, useState } from "react";
import { useChatStore, type Message } from "../../stores/chatStore";
import { useAppStore } from "../../stores/appStore";
import { useAIConfigStore } from "../../stores/aiConfigStore";
import { getLLMClient } from "../../lib/llmClient";
import { buildSystemPrompt } from "../../lib/contextBuilder";
import { getModelInfo, calculateCost, formatCost } from "../../lib/modelInfo";
import AIConfigModal from "./AIConfigModal";
import SlashCommandMenu from "./SlashCommandMenu";
import type { SlashCommandMenuHandle } from "./SlashCommandMenu";
import MessageContent from "./MessageContent";
import "./AISidebar.css";

const isZh = navigator.language.startsWith("zh");
const t = (zh: string, en: string) => (isZh ? zh : en);
const emptyMessages: Message[] = [];

function UsageBadge({ tabId, providerId, model }: { tabId: string; providerId: string; model: string }) {
  const usage = useChatStore((s) => s.usageMap[tabId]);
  const [showTooltip, setShowTooltip] = useState(false);

  const promptTokens = usage?.promptTokens ?? 0;
  const completionTokens = usage?.completionTokens ?? 0;
  const totalTokens = usage?.totalTokens ?? 0;
  const modelInfo = getModelInfo(providerId, model);
  const maxContext = modelInfo.maxContext || 0;
  const pct = maxContext > 0 ? Math.min(totalTokens / maxContext, 1) : 0;
  const radius = 10;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);

  let ringColor = "#22c55e";
  if (pct > 0.8) ringColor = "#ef4444";
  else if (pct > 0.5) ringColor = "#eab308";

  const { cost, currency } = totalTokens > 0
    ? calculateCost(usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, providerId, model)
    : { cost: 0, currency: modelInfo.currency || "USD" };

  return (
    <div
      className="moflow-ai-usage-badge"
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
            <span>{t("输入", "Input")}</span>
            <span>{promptTokens.toLocaleString()} tokens</span>
          </div>
          <div className="moflow-ai-usage-tooltip-row">
            <span>{t("输出", "Output")}</span>
            <span>{completionTokens.toLocaleString()} tokens</span>
          </div>
          <div className="moflow-ai-usage-tooltip-row moflow-ai-usage-tooltip-total">
            <span>{t("总计", "Total")}</span>
            <span>{totalTokens.toLocaleString()} tokens</span>
          </div>
          <div className="moflow-ai-usage-tooltip-row">
            <span>{t("用量", "Usage")}</span>
            <span>{(pct * 100).toFixed(1)}%</span>
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

export default function AISidebar() {
  const activeFileId = useAppStore((s) => s.activeFileId);
  const messages = useChatStore((s) => s.messagesMap[activeFileId] || emptyMessages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const addMessage = useChatStore((s) => s.addMessage);
  const appendToLastMessage = useChatStore((s) => s.appendToLastMessage);
  const addUsage = useChatStore((s) => s.addUsage);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const compactMessages = useChatStore((s) => s.compactMessages);
  const flushAssistantMessage = useChatStore((s) => s.flushAssistantMessage);
  const setStreaming = useChatStore((s) => s.setStreaming);
  const stopGeneration = useChatStore((s) => s.stopGeneration);
  const docContent = useAppStore((s) => {
    const tab = s.files.find((f) => f.id === s.activeFileId);
    return tab?.content ?? "";
  });
  const aiConfig = useAIConfigStore((s) => s.config);
  const saveConfig = useAIConfigStore((s) => s.saveConfig);
  const sidebarWidth = useAppStore((s) => s.sidebarWidth);
  const setSidebarWidth = useAppStore((s) => s.setSidebarWidth);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const slashMenuRef = useRef<SlashCommandMenuHandle>(null);
  const [input, setInput] = useState("");
  const [showConfig, setShowConfig] = useState(false);

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

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    if (text.startsWith("/")) return;

    setInput("");
    addMessage(activeFileId, { role: "user", content: text });

    setStreaming(true);
    addMessage(activeFileId, { role: "assistant", content: "" });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const client = getLLMClient(aiConfig);
      const systemPrompt = buildSystemPrompt(docContent);

      const chatMessages = [
        { role: "system" as const, content: systemPrompt },
        ...messages.slice(-20).map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user" as const, content: text },
      ];

      const result = await client.chat(
        chatMessages,
        (chunk) => {
          appendToLastMessage(activeFileId, chunk);
        },
        controller.signal
      );
      addUsage(activeFileId, result.usage);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      const errorMsg = e instanceof Error ? e.message : String(e);
      appendToLastMessage(activeFileId, `\n\n❌ ${t("请求失败", "Request failed")}: ${errorMsg}`);
    } finally {
      setStreaming(false);
      abortRef.current = null;
      flushAssistantMessage(activeFileId);
    }
  };

  const handleSlashCommand = async (id: string) => {
    setInput("");

    if (id === "new") {
      clearMessages(activeFileId);
      return;
    }

    if (id === "compact") {
      const msgs = useChatStore.getState().getMessages(activeFileId);
      if (msgs.length === 0) return;

      const summaryParts: string[] = [];
      for (const m of msgs) {
        const label = m.role === "user" ? "User" : "AI";
        summaryParts.push(`${label}: ${m.content.slice(0, 200)}`);
      }
      const summaryContent = summaryParts.join("\n");

      compactMessages(activeFileId, "");
      setStreaming(true);
      addMessage(activeFileId, { role: "assistant", content: "" });

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const client = getLLMClient(aiConfig);
        const systemPrompt = buildSystemPrompt(docContent);
        const result = await client.chat(
          [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: `请将以下对话历史总结为简洁的摘要，保留关键信息：\n\n${summaryContent}`,
            },
          ],
          (chunk) => {
            appendToLastMessage(activeFileId, chunk);
          },
          controller.signal
        );
        addUsage(activeFileId, result.usage);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        const errorMsg = e instanceof Error ? e.message : String(e);
        appendToLastMessage(activeFileId, `\n\n❌ ${t("请求失败", "Request failed")}: ${errorMsg}`);
      } finally {
        setStreaming(false);
        abortRef.current = null;
        flushAssistantMessage(activeFileId);
      }
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
      const newWidth = Math.max(280, Math.min(600, startWidth + delta));
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
        <span className="moflow-ai-header-title">{t("AI 助手", "AI Assistant")}</span>
        <span className="moflow-ai-header-mode">
          {aiConfig.mode === "mock" ? "Mock" : aiConfig.model || "API"}
        </span>
        <UsageBadge tabId={activeFileId} providerId={aiConfig.providerId} model={aiConfig.model} />
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

      <div className="moflow-ai-messages">
        {messages.length === 0 && (
          <div className="moflow-ai-empty">
            <div className="moflow-ai-empty-icon">✨</div>
            <p>{t("有什么关于当前文档的问题？", "Questions about the current document?")}</p>
          </div>
        )}
        {messages.map((msg) => (
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
        ))}
        <div ref={messagesEndRef} />
      </div>

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
