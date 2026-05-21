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
import { snapshotInit, snapshotCommit, snapshotLog, snapshotRestore } from "../../lib/snapshot";
import { posixDirname, toPosix } from "../../lib/pathUtils";
import { getToolDefinitions, executeTool, WEBFETCH_LIMIT, makeSkillTool, makeRunSkillScriptTool, shouldAddRunSkillScriptTool, type QuestionItem } from "../../lib/tools";
import { createTracer, truncateArgsSummary } from "../../lib/tracer";
import type { TracerHandle } from "../../lib/tracer";
import type { ToolContext, OnPermissionCallback } from "../../lib/tools";
import type { PermissionRequest, PermissionAction } from "../../lib/permission";
import { runSubAgent } from "../../lib/subAgentRunner";
import type { SubAgentExecution } from "../../lib/types";
import { useShallow } from "zustand/react/shallow";
import SlashCommandMenu from "./SlashCommandMenu";
import type { SlashCommandMenuHandle } from "./SlashCommandMenu";
import MessageContent from "./MessageContent";
import ContextView from "./ContextView";
import PermissionBar from "./PermissionBar";
import QuestionBar from "./QuestionBar";
import SubAgentCard from "./SubAgentCard";
import SubAgentView from "./SubAgentView";
import { t } from "../../i18n/core";
import { useT } from "../../i18n/useT";
import "./AISidebar.css";

const emptyMessages: Message[] = [];

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

function ToolCallStatus({ name, args, completedReadStats }: { name: string; args: Record<string, unknown>; completedReadStats?: { reads: number; searches: number } }) {
  useT();

  const isReadTool = READ_TOOLS.has(name);

  if (isReadTool && completedReadStats) {
    const currentReads = completedReadStats.reads + (READ_TYPE_TOOLS.has(name) ? 1 : 0);
    const currentSearches = completedReadStats.searches + (SEARCH_TYPE_TOOLS.has(name) ? 1 : 0);
    const parts: string[] = [];
    if (currentReads > 0) parts.push(`${currentReads} ${t("ai.toolLabel.reads")}`);
    if (currentSearches > 0) parts.push(`${currentSearches} ${t("ai.toolLabel.searches")}`);
    const label = parts.join(" ");

    return (
      <div className="moflow-ai-tool-status">
        <span className="moflow-ai-tool-spinner" />
        <span className="moflow-ai-tool-status-icon"><ToolIcon type="read" /></span>
        <span>{t("ai.toolLabel.exploring")} · {label}</span>
      </div>
    );
  }

  let text: string;
  switch (name) {
    case "outline":
      text = t("ai.toolStatus.outline");
      break;
    case "read":
      text = t("ai.toolStatus.read");
      break;
    case "readSection":
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
      text = `${t("ai.toolLabel.skill")} ${args.name ?? ""}`;
      break;
    case "runSkillScript":
      text = `${t("ai.toolLabel.runSkillScript")} ${args.script ?? ""}${args.args ? " " + String(args.args) : ""}`;
      break;
    case "write":
      text = `${t("ai.toolLabel.write")} ${args.path ?? ""}`;
      break;
    case "edit":
      text = `${t("ai.toolLabel.edit")} ${args.path ?? ""}`;
      break;
    case "question":
      text = `${t("ai.toolLabel.question")}`;
      break;
    case "task":
      text = `${t("ai.toolLabel.task")} ${args.description ?? ""}`;
      break;
    default:
      text = t("ai.toolStatus.default", { name });
  }

  return (
    <div className="moflow-ai-tool-status">
      <span className="moflow-ai-tool-spinner" />
      <span className="moflow-ai-tool-status-icon"><ToolIcon type={name === "runSkillScript" ? "script" : name === "webfetch" ? "webfetch" : name === "skill" ? "skill" : READ_TOOLS.has(name) ? "read" : EDIT_TOOLS.has(name) ? "edit" : "generic"} /></span>
      <span>{text}</span>
    </div>
  );
}

function formatToolArgs(name: string, args: Record<string, unknown>): string {
  const labelKey = `ai.toolLabel.${name}`;
  const label = t(labelKey) !== labelKey ? t(labelKey) : name.charAt(0).toUpperCase() + name.slice(1);
  if (name === "write" || name === "edit") return `${label} ${args.path ?? ""}`;
  if (name === "runSkillScript") return `${label} ${args.script ?? ""}${args.args ? " " + String(args.args) : ""}`;
  if (name === "webfetch") return `${label} ${args.url ?? ""}`;
  if (name === "skill") return `${label} ${args.name ?? ""}`;
  if (name === "read") {
    const parts = [label, args.path ?? ""];
    if (args.offset != null) parts.push(`offset=${args.offset}`);
    if (args.limit != null) parts.push(`limit=${args.limit}`);
    return parts.join(" ");
  }
  if (name === "readSection") {
    const parts = [label];
    if (args.path) parts.push(String(args.path));
    if (args.heading) parts.push(`heading=${args.heading}`);
    return parts.join(" ");
  }
  if (name === "grep") {
    const parts = [label];
    if (args.path) parts.push(String(args.path));
    if (args.pattern) parts.push(`pattern=${args.pattern}`);
    return parts.join(" ");
  }
  if (name === "outline") {
    if (args.path) return `${label} ${args.path}`;
    return label;
  }
  if (name === "question") {
    const qs = Array.isArray(args.questions) ? (args.questions as { question?: string }[]).map((q) => q.question ?? "").join("; ") : "";
    return `${label} ${qs}`;
  }
  if (name === "task") {
    return `${label} ${args.description ?? ""} (${args.subagent_type ?? "explore"})`;
  }
  const entries = Object.entries(args);
  if (entries.length === 0) return label;
  const parts = entries.map(([, v]) => String(v));
  return `${label} ${parts.join(" ")}`;
}

const READ_TOOLS = new Set(["outline", "read", "readSection", "grep", "find", "glob", "ls"]);
const EDIT_TOOLS = new Set(["write", "edit"]);

function ToolIcon({ type }: { type: "read" | "edit" | "script" | "webfetch" | "skill" | "generic" }) {
  const svgProps = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (type) {
    case "read":
      return <svg {...svgProps}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
    case "edit":
      return <svg {...svgProps}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
    case "script":
      return <svg {...svgProps}><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>;
    case "webfetch":
      return <svg {...svgProps}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>;
    case "skill":
      return <svg {...svgProps}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
    default:
      return <svg {...svgProps}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>;
  }
}

function getToolCallInfo(msg: Message, messages: Message[]): { name: string; args: Record<string, unknown> } | null {
  if (!msg.toolCallId) return null;
  for (const m of messages) {
    if (m.role === "assistant" && m.toolCalls) {
      const tc = m.toolCalls.find((c) => c.id === msg.toolCallId);
      if (tc) {
        try {
          return { name: tc.name, args: JSON.parse(tc.arguments || "{}") };
        } catch {
          return { name: tc.name, args: {} };
        }
      }
    }
  }
  return null;
}

function isToolError(content: string): boolean {
  const lower = content.toLowerCase();
  return lower.includes("error") || lower.includes("not found") || lower.includes("denied") || lower.includes("failed") || lower.includes("no match");
}

function getLangFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    json: "json", ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    md: "markdown", py: "python", css: "css", html: "html", yml: "yaml", yaml: "yaml",
    toml: "toml", rs: "rust", go: "go", sh: "bash", sql: "sql", xml: "xml",
  };
  return map[ext] ?? "";
}

interface ToolItem {
  msg: Message;
  info: { name: string; args: Record<string, unknown> } | null;
  isError: boolean;
}

const READ_TYPE_TOOLS = new Set(["outline", "read", "readSection"]);
const SEARCH_TYPE_TOOLS = new Set(["grep", "find", "glob", "ls"]);
function buildReadLabel(items: ToolItem[]): string {
  let reads = 0;
  let searches = 0;
  for (const item of items) {
    const name = item.info?.name ?? item.msg.toolName ?? "";
    if (READ_TYPE_TOOLS.has(name)) reads++;
    else if (SEARCH_TYPE_TOOLS.has(name)) searches++;
    else reads++;
  }
  const parts: string[] = [];
  if (reads > 0) parts.push(`${reads} ${t("ai.toolLabel.reads")}`);
  if (searches > 0) parts.push(`${searches} ${t("ai.toolLabel.searches")}`);
  return parts.join(" ");
}

function ReadToolGroup({ items }: { items: ToolItem[] }) {
  const [open, setOpen] = useState(false);
  const label = buildReadLabel(items);

  return (
    <div className="moflow-ai-tool-group">
      <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary className="moflow-ai-tool-group-summary">
          <span className="moflow-ai-tool-group-icon"><ToolIcon type="read" /></span>
          <span>{t("ai.toolLabel.explored")} · {label}</span>
        </summary>
        <div className="moflow-ai-tool-group-items">
          {items.map((item) => (
            <div key={item.msg.id} className={`moflow-ai-tool-group-item${item.isError ? " moflow-ai-tool-error" : ""}`}>
              <span className="moflow-ai-tool-group-item-label">{item.info ? formatToolArgs(item.info.name, item.info.args) : (item.msg.toolName ?? "")}</span>
              {item.isError && (
                <details>
                  <summary className="moflow-ai-tool-error-summary">Error</summary>
                  <pre className="moflow-ai-tool-error-content">{item.msg.content}</pre>
                </details>
              )}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function EditToolResult({ item }: { item: ToolItem }) {
  const [open, setOpen] = useState(false);
  const path = item.info?.args.path ? String(item.info.args.path) : "";
  const lang = getLangFromPath(path);

  let displayContent: string;
  if (item.isError) {
    displayContent = item.msg.content;
  } else {
    const toolName = item.info?.name;
    if (toolName === "write") {
      displayContent = item.msg.content;
    } else {
      const oldString = String(item.info?.args.old_string ?? "");
      const newString = String(item.info?.args.new_string ?? "");
      const diffLines: string[] = [];
      for (const line of oldString.split("\n")) diffLines.push(`- ${line}`);
      for (const line of newString.split("\n")) diffLines.push(`+ ${line}`);
      const diff = diffLines.join("\n");
      displayContent = lang ? `\`\`\`${lang}\n${diff}\n\`\`\`` : diff;
      displayContent = `**${item.msg.content}**\n\n${displayContent}`;
    }
  }

  if (item.isError) {
    return (
      <div className="moflow-ai-tool-edit moflow-ai-tool-error">
        <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
          <summary className="moflow-ai-tool-edit-header">
            <span className="moflow-ai-tool-edit-icon"><ToolIcon type="edit" /></span>
            <span>{t("ai.toolLabel.edit")} {path}</span>
            <span className="moflow-ai-tool-error-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span>
          </summary>
          <pre className="moflow-ai-tool-error-content">{item.msg.content}</pre>
        </details>
      </div>
    );
  }

  return (
    <div className="moflow-ai-tool-edit">
      <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary className="moflow-ai-tool-edit-header">
          <span className="moflow-ai-tool-edit-icon"><ToolIcon type="edit" /></span>
          <span>{t("ai.toolLabel.edit")} {path}</span>
        </summary>
        <div className="moflow-ai-tool-edit-content">
          <MessageContent content={displayContent} />
        </div>
      </details>
    </div>
  );
}

function GenericToolResult({ item, iconType }: { item: ToolItem; iconType: "read" | "edit" | "script" | "webfetch" | "skill" | "generic" }) {
  const [open, setOpen] = useState(false);
  const label = item.info ? formatToolArgs(item.info.name, item.info.args) : (item.msg.toolName ?? "");

  if (item.isError) {
    return (
      <div className="moflow-ai-tool-group moflow-ai-tool-error">
        <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
          <summary className="moflow-ai-tool-group-summary">
            <span className="moflow-ai-tool-group-icon"><ToolIcon type={iconType} /></span>
            <span>{label}</span>
            <span className="moflow-ai-tool-error-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span>
          </summary>
          <pre className="moflow-ai-tool-error-content">{item.msg.content}</pre>
        </details>
      </div>
    );
  }

  return (
    <div className="moflow-ai-tool-group">
      <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary className="moflow-ai-tool-group-summary">
          <span className="moflow-ai-tool-group-icon"><ToolIcon type={iconType} /></span>
          <span>{label}</span>
        </summary>
        <pre className="moflow-ai-tool-result-content">{item.msg.content}</pre>
      </details>
    </div>
  );
}

function ToolResultGroups({ toolMessages, messages }: { toolMessages: Message[]; messages: Message[] }) {
  const subAgentMap = useChatStore((s) => s.subAgentResultsMap);

  const groups: Array<"read" | "edit" | "script" | "task" | "generic">[] = [];
  const groupItems: ToolItem[][] = [];

  for (const msg of toolMessages) {
    const info = getToolCallInfo(msg, messages);
    const name = info?.name ?? msg.toolName ?? "";
    const isError = isToolError(msg.content);
    const item: ToolItem = { msg, info, isError };

    let type: "read" | "edit" | "script" | "task" | "generic";
    if (READ_TOOLS.has(name)) type = "read";
    else if (EDIT_TOOLS.has(name)) type = "edit";
    else if (name === "runSkillScript") type = "script";
    else if (name === "task") type = "task";
    else type = "generic";

    const lastGroup = groups.length > 0 ? groups[groups.length - 1] : null;
    const lastItems = groupItems.length > 0 ? groupItems[groupItems.length - 1] : null;

    if (lastGroup && lastGroup.length === 1 && lastGroup[0] === "read" && type === "read" && !isError && !lastItems?.some((i) => i.isError)) {
      lastItems!.push(item);
    } else {
      groups.push([type]);
      groupItems.push([item]);
    }
  }

  const elements: React.ReactNode[] = [];
  for (let gi = 0; gi < groups.length; gi++) {
    const items = groupItems[gi];
    const type = groups[gi][0];

    if (type === "task") {
      const taskMsg = items[0]?.msg;
      const taskIdMatch = taskMsg?.content.match(/task_id="([^"]+)"/);
      const taskId = taskIdMatch?.[1];
      const execution = taskId ? subAgentMap[taskId] : undefined;
      elements.push(
        <SubAgentCard
          key={`task-${gi}`}
          description={execution?.description ?? ""}
          subagentType={execution?.subagentType ?? "explore"}
          totalRounds={execution?.totalRounds ?? 0}
          content={taskMsg?.content ?? ""}
          onClick={() => {
            useChatStore.getState().setActiveSubAgentView(taskId ?? null);
          }}
        />
      );
    } else if (type === "read") {
      elements.push(<ReadToolGroup key={`read-${gi}`} items={items} />);
    } else if (type === "edit") {
      for (const item of items) {
        elements.push(<EditToolResult key={item.msg.id} item={item} />);
      }
    } else if (type === "script") {
      for (const item of items) {
        elements.push(<GenericToolResult key={item.msg.id} item={item} iconType="script" />);
      }
    } else {
      for (const item of items) {
        const iconType: "read" | "edit" | "script" | "webfetch" | "skill" | "generic" = item.info?.name === "webfetch" ? "webfetch" : item.info?.name === "skill" ? "skill" : "generic";
        elements.push(<GenericToolResult key={item.msg.id} item={item} iconType={iconType} />);
      }
    }
  }

  return <>{elements}</>;
}


export default function AISidebar() {
  const activeFileId = useTabStore((s) => s.activeFileId);
  const workspaceRoot = useTabStore((s) => s.workspaceRoot);
  const chatKey = useTabStore((s) => {
    if (s.workspaceRoot) return "dir:" + toPosix(s.workspaceRoot).toLowerCase();
    return s.activeFileId;
  });
  const activeFilePath = useTabStore((s) => {
    const tab = s.files.find((f) => f.id === s.activeFileId);
    return tab?.filePath ?? null;
  });
  const chatLoaded = useChatStore((s) => s.chatLoadedMap[chatKey] ?? true);
  const activeSubAgentView = useChatStore((s) => s.activeSubAgentView);
  const subAgentResults = useChatStore((s) => s.subAgentResultsMap);
  const permissionRequest = useChatStore((s) => s.permissionRequestMap[chatKey] ?? null);
  const pendingQuestion = useChatStore((s) => s.pendingQuestionMap[chatKey] ?? null);
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
  const currentAiMode = usePermissionStore((s) => s.sessionAiModeMap[chatKey] ?? "build");
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false);
  const modeDropdownRef = useRef<HTMLDivElement>(null);
  useT();

  useEffect(() => {
    if (!chatKey) return;
    const ws = workspaceRoot ?? (activeFilePath ? posixDirname(activeFilePath) : undefined);
    console.log("[snapshot] init:", { chatKey, ws, workspaceRoot, activeFilePath, filePaths: workspaceRoot ? undefined : [activeFilePath!] });
    if (!ws) return;
    snapshotInit(chatKey, ws, workspaceRoot ? undefined : [activeFilePath!]).then(() => {
      console.log("[snapshot] init OK for", chatKey);
    }).catch((e) => {
      console.error("[snapshot] init failed:", e);
    });
  }, [chatKey, workspaceRoot, activeFilePath]);

  useEffect(() => {
    if (!isStreaming) {
      inputRef.current?.focus();
    }
  }, [isStreaming]);

  useEffect(() => {
    if (!modeDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (modeDropdownRef.current && !modeDropdownRef.current.contains(e.target as Node)) {
        setModeDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [modeDropdownOpen]);

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

  const handleUndo = useCallback(async (messageId: string) => {
    if (isStreaming) return;
    const userRound = useChatStore.getState().undoFromMessage(chatKey, messageId);
    console.log("[undo] userRound:", userRound);
    if (userRound < 0) return;
    try {
      const log = await snapshotLog(chatKey);
      console.log("[undo] snapshot log:", log.map((e) => e.message));
      const target = log.find((e) => e.message === `round-${userRound + 1}`);
      console.log("[undo] looking for round-", userRound + 1, "found:", target?.hash);
      if (target) {
        const changedFiles = await snapshotRestore(chatKey, target.hash);
        console.log("[undo] restored files:", changedFiles);
        if (changedFiles.length > 0) {
          const { loadTabContent } = await import("../../lib/fileOps");
          const openTabs = useTabStore.getState().files;
          const changedSet = new Set(changedFiles.map((f) => f.toLowerCase()));
          for (const tab of openTabs) {
            if (tab.filePath && changedSet.has(toPosix(tab.filePath).toLowerCase())) {
              console.log("[undo] reloading tab:", tab.filePath);
              await loadTabContent(tab.id);
            }
          }
        }
      }
    } catch (e) {
      console.error("[undo] failed:", e);
    }
  }, [chatKey, isStreaming]);

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
    if (turnCount === 0) {
      const msg = addMessage(chatKey, { role: "assistant", content: `|!${t("ai.compact.nothingToCompact")}` });
      await appendMessage(chatKey, msg);
      return;
    }

    const headMsgs = contextMsgs.slice(0, tailStart);
    const tailMsgs = contextMsgs.slice(tailStart);

    if (headMsgs.length === 0) {
      const msg = addMessage(chatKey, { role: "assistant", content: `|!${t("ai.compact.nothingToCompact")}` });
      await appendMessage(chatKey, msg);
      return;
    }

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

    const messagesBefore = contextMsgs.length;
    const compactTracer = createTracer(chatKey, "/compact", aiConfig.model);
    const compactSpanId = compactTracer.startSpan("compact", "compact");

    setStreaming(true);
    clearStreamingContent(chatKey);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const client = getLLMClient(aiConfig);
      const maxContext = getModelInfo(aiConfig.providerId, aiConfig.model).maxContext;
      const { prompt: systemPrompt } = buildSystemPrompt(docContent, maxContext, false, workspaceRoot, activeFilePath, usePermissionStore.getState().getSessionAiMode(chatKey));

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
      const cachedTokens = result.usage.cachedTokens;
      const { cost: costVal } = calculateCost(promptTokens, completionTokens, aiConfig.providerId, aiConfig.model);
      useChatStore.getState().recordUsage(chatKey, promptTokens, completionTokens, costVal, cachedTokens);

      const content = useChatStore.getState().streamingContentMap[chatKey] ?? "";
      const summaryMsg = addMessage(chatKey, { role: "assistant", content, isCompactSummary: true, promptTokens });
      await appendMessage(chatKey, summaryMsg);

      compactTracer.endSpan(compactSpanId, {
        messagesBefore,
        messagesAfter: tailMsgs.length + 1,
        promptTokens,
        completionTokens,
        ttfbMs: result.ttfbMs,
        chunkCount: result.chunkCount,
        status: "ok",
      });

      useChatStore.setState((state) => ({
        contextMap: { ...state.contextMap, [chatKey]: [...tailMsgs, summaryMsg] },
      }));
    } catch (e) {
      compactTracer.endSpan(compactSpanId, { status: "error", error: e instanceof Error ? e.message : String(e) });
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
      const totalTokens = useChatStore.getState().totalTokensMap[chatKey] ?? 0;
      const totalCost = useChatStore.getState().costMap[chatKey] ?? 0;
      compactTracer.endTrace("ok", { totalTokens, totalCost });
    }
  };

  const onPermission: OnPermissionCallback = useCallback((request: PermissionRequest) => {
    return new Promise<PermissionAction>((resolve) => {
      useChatStore.getState().setPermissionRequest(chatKey, request);
      useChatStore.getState().setResolvePermissionRef(chatKey, resolve);
    });
  }, [chatKey]);

  const handlePermissionAllow = useCallback(() => {
    useChatStore.getState().resolvePermissionRefMap[chatKey]?.("allow");
    useChatStore.getState().setResolvePermissionRef(chatKey, null);
    useChatStore.getState().setPermissionRequest(chatKey, null);
  }, [chatKey]);

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
    useChatStore.getState().resolvePermissionRefMap[chatKey]?.("allow");
    useChatStore.getState().setResolvePermissionRef(chatKey, null);
    useChatStore.getState().setPermissionRequest(chatKey, null);
  }, [chatKey, permissionRequest]);

  const handlePermissionDeny = useCallback(() => {
    useChatStore.getState().resolvePermissionRefMap[chatKey]?.("deny");
    useChatStore.getState().setResolvePermissionRef(chatKey, null);
    useChatStore.getState().setPermissionRequest(chatKey, null);
  }, [chatKey]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    isAtBottomRef.current = true;
    setShowScrollBottom(false);

    if (text.startsWith("/")) {
      const cmd = text.slice(1).trim();
      if (cmd === "new") {
        useChatStore.getState().appendInputHistory(chatKey, text);
        clearMessages(chatKey);
        usePermissionStore.getState().clearSessionRules(chatKey);
        setInput("");
        return;
      }
      if (cmd === "compact") {
        useChatStore.getState().appendInputHistory(chatKey, text);
        setInput("");
        isAtBottomRef.current = true;
        setShowScrollBottom(false);
        await doCompact();
        return;
      }
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

    try {
      const roundNum = (useChatStore.getState().messagesMap[chatKey]?.filter((m) => m.role === "user").length ?? 0) + 1;
      const result = await snapshotCommit(chatKey, `round-${roundNum}`);
      console.log("[snapshot] committed", result.hash, `round-${roundNum}`);
    } catch (e) {
      console.error("[snapshot] commit failed:", e);
    }

    const userMsg = addMessage(chatKey, { role: "user", content: text });
    await appendMessage(chatKey, userMsg);
    useChatStore.getState().appendInputHistory(chatKey, text);

    setStreaming(true);
    clearStreamingContent(chatKey);

    const controller = new AbortController();
    abortRef.current = controller;

    const docTokens = estimateTokens(docContent);
    const docRatio = 0.50;
    const reserved = Math.floor(maxContext * (1 - docRatio));
    const needsDocTools = docTokens > (maxContext - reserved);

    const currentMode = usePermissionStore.getState().getSessionAiMode(chatKey);
    const { prompt: systemPrompt } = buildSystemPrompt(docContent, maxContext, needsDocTools, workspaceRoot, activeFilePath, currentMode);
    const tools = getToolDefinitions(needsDocTools, workspaceRoot, activeFilePath, currentMode);
    const availableSkills = useSkillStore.getState().discoveredSkills.filter((s) => s.enabled);
    if (availableSkills.length > 0) {
      tools.push(makeSkillTool());
    }
    const hasRunScript = shouldAddRunSkillScriptTool();
    if (hasRunScript && currentMode !== "plan") {
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

    const tracer: TracerHandle = createTracer(chatKey, text, aiConfig.model);
    let traceStatus: "ok" | "error" | "cancelled" = "ok";

    try {
      const client = getLLMClient(aiConfig);
      let round = 0;
      let webfetchCount = 0;

      const maxToolRounds = useThemeStore.getState().maxToolRounds;

      while (round <= maxToolRounds) {
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

        const llmSpanId = tracer.startSpan("llm", `llm.round.${round}`, { roundIndex: round });

        const result = await client.chat(
          chatMessages,
          (chunk) => {
            appendStreamingContent(chatKey, chunk);
          },
          controller.signal,
          { tools }
        );

        tracer.endSpan(llmSpanId, {
          roundIndex: round,
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          finishReason: result.finishReason,
          ttfbMs: result.ttfbMs,
          chunkCount: result.chunkCount,
          toolCallCount: result.toolCalls?.length ?? 0,
          status: "ok",
        });

        const promptTokens = result.usage.promptTokens;
        const completionTokens = result.usage.completionTokens;
        const cachedTokens = result.usage.cachedTokens;
        const { cost: costVal } = calculateCost(promptTokens, completionTokens, aiConfig.providerId, aiConfig.model);
        useChatStore.getState().recordUsage(chatKey, promptTokens, completionTokens, costVal, cachedTokens);

        const content = useChatStore.getState().streamingContentMap[chatKey] ?? "";

        if (result.finishReason !== "tool_calls" || !result.toolCalls?.length) {
          const assistantMsg = addMessage(chatKey, {
            role: "assistant",
            content,
            reasoningContent: result.reasoningContent || undefined,
            promptTokens,
          });
          await appendMessage(chatKey, assistantMsg);
          clearStreamingContent(chatKey);
          break;
        }

        if (controller.signal.aborted) {
          traceStatus = "cancelled";
          if (content) {
const assistantMsg = addMessage(chatKey, { role: "assistant", content, promptTokens });
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
          promptTokens,
        });
        await appendMessage(chatKey, assistantMsg);
        clearStreamingContent(chatKey);

        for (const tc of result.toolCalls) {
          if (controller.signal.aborted) { traceStatus = "cancelled"; break; }

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

          if (tc.name === "question") {
            const rawQuestions = Array.isArray(args.questions) ? args.questions : [];
            const questions: QuestionItem[] = rawQuestions.map((q: Record<string, unknown>) => ({
              question: String(q.question ?? ""),
              options: Array.isArray(q.options) ? q.options.map((o: Record<string, unknown>) => ({
                label: String(o.label ?? ""),
                description: o.description ? String(o.description) : undefined,
              })) : [],
              multiple: q.multiple === true,
            }));
            const valid = questions.every((q) => q.question && q.options.length >= 2);
            if (!valid || questions.length === 0) {
              const toolMsg = addMessage(chatKey, {
                role: "tool",
                content: "Invalid question tool call: each question must have text and at least 2 options.",
                toolCallId: tc.id,
                toolName: tc.name,
              });
              await appendMessage(chatKey, toolMsg);
              continue;
            }
            setToolCallStatus(null);
            const answer = await new Promise<string>((resolve) => {
              useChatStore.getState().setPendingQuestion(chatKey, { questions, toolCallId: tc.id });
              useChatStore.getState().setResolveQuestionRef(chatKey, resolve);
            });
useChatStore.getState().setPendingQuestion(chatKey, null);
      useChatStore.getState().clearQuestionFormState(chatKey);
            const toolMsg = addMessage(chatKey, {
              role: "tool",
              content: answer,
              toolCallId: tc.id,
              toolName: tc.name,
            });
            await appendMessage(chatKey, toolMsg);
            continue;
          }

          if (tc.name === "task") {
            const description = String(args.description ?? "");
            const prompt = String(args.prompt ?? "");
            const subagentType = String(args.subagent_type ?? "explore") as "explore" | "general";

            if (!description || !prompt) {
              const toolMsg = addMessage(chatKey, {
                role: "tool",
                content: "Invalid task tool call: 'description' and 'prompt' are required.",
                toolCallId: tc.id,
                toolName: tc.name,
              });
              await appendMessage(chatKey, toolMsg);
              continue;
            }

            setToolCallStatus({ name: "task", args: { description, subagent_type: subagentType } });

            const taskId = crypto.randomUUID();
            const client = getLLMClient(aiConfig);
            const currentMode = usePermissionStore.getState().getSessionAiMode(chatKey);

            const subResult = await runSubAgent({
              prompt,
              description,
              subagentType,
              ctx: toolCtx,
              client,
              signal: controller.signal,
              tracer,
              maxContext,
              aiMode: currentMode,
              providerId: aiConfig.providerId,
              model: aiConfig.model,
              onPermission,
            });

            const execution: SubAgentExecution = {
              taskId,
              description,
              subagentType,
              messages: subResult.messages,
              totalRounds: subResult.totalRounds,
              promptTokens: subResult.promptTokens,
              completionTokens: subResult.completionTokens,
              totalTokens: subResult.totalTokens,
              cost: subResult.cost,
              cachedTokens: subResult.cachedTokens,
              status: controller.signal.aborted ? "cancelled" : "completed",
              parentChatKey: chatKey,
            };

            useChatStore.getState().addSubAgentResult(taskId, execution);
            useChatStore.getState().recordStandaloneUsage(chatKey, subResult.promptTokens, subResult.completionTokens, subResult.cost, subResult.cachedTokens);

            const summaryLines = subResult.content.split("\n").slice(0, 5).join("\n");
            const taskResultXml = `<task_result task_id="${taskId}" description="${description.replace(/"/g, "&quot;")}" type="${subagentType}" rounds="${subResult.totalRounds}">\n<summary>\n${summaryLines}\n</summary>\n<full_result>\n${subResult.content}\n</full_result>\n</task_result>`;

            const toolMsg = addMessage(chatKey, {
              role: "tool",
              content: taskResultXml,
              toolCallId: tc.id,
              toolName: tc.name,
            });
            await appendMessage(chatKey, toolMsg);
            continue;
          }

          setToolCallStatus({ name: tc.name, args });

          const toolSpanId = tracer.startSpan("tool", `tool.${tc.name}`, {
            roundIndex: round,
            toolName: tc.name,
          });

          let toolResult: string;
          try {
            toolResult = await executeTool(tc.name, args, controller.signal, toolCtx, onPermission);
          } catch (e) {
            toolResult = `|?${t("ai.error.toolExecution")}: ${e instanceof Error ? e.message : String(e)}`;
          }

          const resultSize = new TextEncoder().encode(toolResult).length;
          tracer.endSpan(toolSpanId, {
            roundIndex: round,
            toolName: tc.name,
            argsSummary: truncateArgsSummary(args),
            resultSize,
            wasTruncated: resultSize >= 30 * 1024,
            status: toolResult.startsWith("|?") ? "error" : "ok",
          });

          if (controller.signal.aborted) { traceStatus = "cancelled"; break; }

          const toolMsg = addMessage(chatKey, {
            role: "tool",
            content: toolResult,
            toolCallId: tc.id,
            toolName: tc.name,
          });
          await appendMessage(chatKey, toolMsg);
        }

        if (controller.signal.aborted) { traceStatus = "cancelled"; break; }

        setToolCallStatus(null);

        if (round >= maxToolRounds) {
          const limitMsg = addMessage(chatKey, {
            role: "assistant",
            content: t("ai.error.toolRoundsLimit"),
          });
          await appendMessage(chatKey, limitMsg);
          break;
        }
      }
    } catch (e) {
      traceStatus = "error";
      if (e instanceof TimeoutError) {
        console.error(`[AISidebar] Request timeout: ${e.message}`);
        appendStreamingContent(chatKey, `\n\n? ${t("ai.error.timeout")}`);
      } else if (e instanceof DOMException && e.name === "AbortError") {
        traceStatus = "cancelled";
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
      const permRef = useChatStore.getState().resolvePermissionRefMap[chatKey];
      if (permRef) {
        permRef("deny");
        useChatStore.getState().setResolvePermissionRef(chatKey, null);
      }
      useChatStore.getState().setPermissionRequest(chatKey, null);
      const qRef = useChatStore.getState().resolveQuestionRefMap[chatKey];
      if (qRef) {
        qRef("User cancelled");
        useChatStore.getState().setResolveQuestionRef(chatKey, null);
      }
      useChatStore.getState().setPendingQuestion(chatKey, null);
      const totalTokens = useChatStore.getState().totalTokensMap[chatKey] ?? 0;
      const totalCost = useChatStore.getState().costMap[chatKey] ?? 0;
      tracer.endTrace(traceStatus, { totalTokens, totalCost });
    }
  };

  const handleSlashCommand = async (id: string) => {
    useChatStore.getState().appendInputHistory(chatKey, `/${id}`);
    setInput("");

    if (id === "new") {
      clearMessages(chatKey);
      usePermissionStore.getState().clearSessionRules(chatKey);
      return;
    }

if (id === "compact") {
      isAtBottomRef.current = true;
      setShowScrollBottom(false);
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
    return useChatStore.getState().inputHistoryMap[chatKey] ?? [];
  }, [chatKey]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (slashMenuVisible && slashMenuRef.current && historyIndexRef.current === -1) {
      const handled = slashMenuRef.current.handleKeyDown(e);
      if (handled) return;
    }

    if (e.key === "Tab" && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      const next = currentAiMode === "plan" ? "build" : "plan";
      usePermissionStore.getState().setSessionAiMode(chatKey, next);
      return;
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
    <div className="moflow-ai-sidebar" style={{ width: sidebarWidth, minWidth: sidebarWidth }} onKeyDown={(e) => {
      if (e.key === "Tab" && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        const next = currentAiMode === "plan" ? "build" : "plan";
        usePermissionStore.getState().setSessionAiMode(chatKey, next);
      }
    }}>
      <div className="moflow-ai-resize-handle" onMouseDown={handleResizeStart} />
      <div className="moflow-ai-header">
        <span className="moflow-ai-header-title" style={{ flex: "none" }}>{showContext ? t("ai.header.context") : t("ai.header.title")}</span>
        <div className="relative" ref={modeDropdownRef}>
          <button
            className={`moflow-ai-mode-toggle${currentAiMode === "plan" ? " moflow-ai-mode-toggle-plan" : " moflow-ai-mode-toggle-build"}`}
            onClick={() => setModeDropdownOpen((v) => !v)}
          >
            <span>{currentAiMode === "plan" ? "Plan" : "Build"}</span>
          </button>
          {modeDropdownOpen && (
            <div className="moflow-ai-mode-dropdown">
              <button
                className={`moflow-ai-mode-option${currentAiMode === "build" ? " moflow-ai-mode-option-active" : ""}`}
                onClick={() => { usePermissionStore.getState().setSessionAiMode(chatKey, "build"); setModeDropdownOpen(false); }}
              >
                Build
                {currentAiMode === "build" && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
              </button>
              <button
                className={`moflow-ai-mode-option${currentAiMode === "plan" ? " moflow-ai-mode-option-active" : ""}`}
                onClick={() => { usePermissionStore.getState().setSessionAiMode(chatKey, "plan"); setModeDropdownOpen(false); }}
              >
                Plan
                {currentAiMode === "plan" && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
              </button>
            </div>
          )}
        </div>
        <span className="flex-1" />
        <span className="moflow-ai-header-model">{aiConfig.model}</span>
        <UsageBadge tabId={chatKey} providerId={aiConfig.providerId} model={aiConfig.model} onClick={() => setShowContext((v) => !v)} active={showContext} />
      </div>

      {showContext ? (
        <ContextView tabId={chatKey} providerId={aiConfig.providerId} model={aiConfig.model} docContent={docContent} />
      ) : activeSubAgentView && subAgentResults[activeSubAgentView] ? (
        <SubAgentView execution={subAgentResults[activeSubAgentView]} />
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
        {chatLoaded && (() => {
            const elements: React.ReactNode[] = [];
            let toolBuffer: Message[] = [];

            const flushToolBuffer = () => {
              if (toolBuffer.length > 0) {
                elements.push(<ToolResultGroups key={`tools-${elements.length}`} toolMessages={toolBuffer} messages={messages} />);
                toolBuffer = [];
              }
            };

            for (const msg of messages) {
              if (msg.content === "/compact" && msg.role === "user") {
                flushToolBuffer();
                elements.push(
                  <div key={msg.id} className="moflow-ai-compact-divider">
                    <span>{t("ai.compacted")}</span>
                  </div>
                );
                continue;
              }

              if (msg.role === "tool") {
                toolBuffer.push(msg);
                continue;
              }

              flushToolBuffer();

              if (msg.role === "assistant" && !msg.content && msg.toolCalls?.length) {
                continue;
              }

              elements.push(
                <div key={msg.id} className={`moflow-ai-message moflow-ai-message-${msg.role}`}>
{msg.role === "user" && msg.content !== "/compact" && (
                    <button
                      className="moflow-ai-undo-btn"
                      onClick={() => handleUndo(msg.id)}
                      disabled={isStreaming}
                      aria-label={t("ai.undo")}
                      title={t("ai.undo")}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                    </button>
                  )}
                  <div className="moflow-ai-message-content">
                    {msg.role === "assistant" ? (
                      <MessageContent content={msg.content} />
                    ) : (
                      msg.content
                    )}
                  </div>
                 </div>
               );
            }
            flushToolBuffer();
            return elements;
          })()}
        {streamingContent && (
          <div className="moflow-ai-message moflow-ai-message-assistant">
            <div className="moflow-ai-message-content">
              <MessageContent content={streamingContent} />
              {isStreaming && <span className="moflow-ai-cursor">▊</span>}
            </div>
          </div>
        )}
        {toolCallStatus && (() => {
          const completedReadTools = messages.filter((m) => m.role === "tool" && READ_TOOLS.has(m.toolName ?? ""));
          let reads = 0;
          let searches = 0;
          for (const m of completedReadTools) {
            if (READ_TYPE_TOOLS.has(m.toolName ?? "")) reads++;
            else if (SEARCH_TYPE_TOOLS.has(m.toolName ?? "")) searches++;
            else reads++;
          }
          const stats = (reads > 0 || searches > 0) ? { reads, searches } : undefined;
          return <ToolCallStatus name={toolCallStatus.name} args={toolCallStatus.args} completedReadStats={stats} />;
        })()}
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
        {pendingQuestion && (
          <QuestionBar
            questions={pendingQuestion.questions}
            chatKey={chatKey}
            onConfirm={(answer) => {
              useChatStore.getState().resolveQuestionRefMap[chatKey]?.(answer);
              useChatStore.getState().setResolveQuestionRef(chatKey, null);
            }}
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
            disabled={isStreaming || !!permissionRequest || !!pendingQuestion}
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
