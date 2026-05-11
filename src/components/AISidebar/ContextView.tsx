import { useMemo } from "react";
import { useChatStore, type Message } from "../../stores/chatStore";
import { buildSystemPrompt, estimateTokens } from "../../lib/contextBuilder";
import { getModelInfo, formatCost } from "../../lib/modelInfo";
import { getToolDefinitions } from "../../lib/tools";
import { useTabStore } from "../../stores/tabStore";
import { t } from "../../lib/i18n";

interface ContextViewProps {
  tabId: string;
  providerId: string;
  model: string;
  docContent: string;
}

const EMPTY_MESSAGES: Message[] = [];

const ROLE_COLORS: Record<string, string> = {
  system: "var(--moflow-ctx-system)",
  user: "var(--moflow-ctx-user)",
  assistant: "var(--moflow-ctx-assistant)",
  tool: "var(--moflow-ctx-tool)",
};

const ROLE_LABELS: Record<string, string> = {
  system: "system",
  user: "user",
  assistant: "assistant",
  tool: "tool",
};

interface BreakdownItem {
  role: string;
  tokens: number;
}

function computeBreakdown(
  systemPrompt: string,
  contextMsgs: Message[],
  contextTokens: number
): BreakdownItem[] {
  const systemTk = estimateTokens(systemPrompt);
  let userTk = 0;
  let assistantTk = 0;
  let toolTk = 0;

  for (const m of contextMsgs) {
    const contentTk = estimateTokens(m.content);
    if (m.role === "user") {
      userTk += contentTk;
    } else if (m.role === "assistant") {
      assistantTk += contentTk;
      if (m.toolCalls) {
        for (const tc of m.toolCalls) {
          assistantTk += estimateTokens(tc.arguments || "");
        }
      }
    } else if (m.role === "tool") {
      toolTk += contentTk;
    }
  }

  const estimatedTotal = systemTk + userTk + assistantTk + toolTk;

  if (estimatedTotal === 0) {
    return [
      { role: "system", tokens: 0 },
      { role: "user", tokens: 0 },
      { role: "assistant", tokens: 0 },
      { role: "tool", tokens: 0 },
    ];
  }

  const scale = contextTokens > 0 && estimatedTotal !== contextTokens
    ? contextTokens / estimatedTotal
    : 1;

  return [
    { role: "system", tokens: Math.round(systemTk * scale) },
    { role: "user", tokens: Math.round(userTk * scale) },
    { role: "assistant", tokens: Math.round(assistantTk * scale) },
    { role: "tool", tokens: Math.round(toolTk * scale) },
  ];
}

type ContextMessage = Message;

function ToolCallChip({ name, args }: { name: string; args: string }) {
  let label = name;
  try {
    const parsed = JSON.parse(args || "{}");
    const vals = Object.values(parsed).join(", ");
    if (vals) {
      label += `(${vals.length > 30 ? vals.slice(0, 30) + "…" : vals})`;
    } else {
      label += "()";
    }
  } catch {
    label += "()";
  }

  return <span className="moflow-ctx-msg-tc-chip">{label}</span>;
}

function MessageRow({ msg }: { msg: ContextMessage }) {
  const idShort = msg.id.slice(0, 8);
  const role = msg.role;
  const isCompactSummary = msg.role === "assistant" && msg.isCompactSummary;

  let extra = "";
  if (msg.role === "assistant" && msg.toolCalls?.length) {
    extra = msg.toolCalls.map((tc) => tc.name).join(", ");
  }
  if (msg.role === "tool" && msg.toolName) {
    extra = msg.toolName;
  }

  return (
    <details className={`moflow-ctx-msg moflow-ctx-msg-${role}${isCompactSummary ? " moflow-ctx-msg-summary" : ""}`}>
      <summary className="moflow-ctx-msg-header">
        <span className="moflow-ctx-msg-arrow">▸</span>
        <span
          className={`moflow-ctx-msg-badge${isCompactSummary ? " moflow-ctx-badge-summary" : ` moflow-ctx-badge-${role}`}`}
        >
          {isCompactSummary ? "summary" : ROLE_LABELS[role] || role}
        </span>
        <span className="moflow-ctx-msg-id">{idShort}</span>
        {extra && <span className="moflow-ctx-msg-extra">{extra}</span>}
      </summary>
      <div className="moflow-ctx-msg-body">
        {msg.reasoningContent && (
          <details className="moflow-ctx-msg-reasoning">
            <summary className="moflow-ctx-msg-reasoning-header">reasoning</summary>
            <pre className="moflow-ctx-msg-code">{msg.reasoningContent}</pre>
          </details>
        )}
        {msg.role === "tool" ? (
          <pre className="moflow-ctx-msg-code">{msg.content}</pre>
        ) : msg.role === "assistant" && msg.toolCalls?.length ? (
          <>
            {msg.content && <div className="moflow-ctx-msg-text">{msg.content}</div>}
            <div className="moflow-ctx-msg-tc-list">
              {msg.toolCalls.map((tc) => (
                <ToolCallChip key={tc.id} name={tc.name} args={tc.arguments} />
              ))}
            </div>
          </>
        ) : (
          <div className="moflow-ctx-msg-text">{msg.content}</div>
        )}
      </div>
    </details>
  );
}

export default function ContextView({ tabId, providerId, model, docContent }: ContextViewProps) {
  const contextTokens = useChatStore((s) => s.contextTokensMap[tabId] ?? 0);
  const cost = useChatStore((s) => s.costMap[tabId] ?? 0);
  const contextMsgs = useChatStore((s) => s.contextMap[tabId] ?? EMPTY_MESSAGES);

  const modelInfo = useMemo(() => getModelInfo(providerId, model), [providerId, model]);
  const maxContext = modelInfo.maxContext || 0;
  const currency = modelInfo.currency || "USD";

  const { tools, breakdown, totalBreakdown } = useMemo(() => {
    const docRatio = 0.50;
    const reserved = Math.floor(maxContext * (1 - docRatio));
    const needsDocTools = estimateTokens(docContent) > (maxContext - reserved);
    const workspaceRoot = useTabStore.getState().workspaceRoot;

    const { prompt, needsDocTools: promptNeedsDocTools } = buildSystemPrompt(docContent, maxContext, needsDocTools, workspaceRoot);
    const toolList = getToolDefinitions(promptNeedsDocTools, workspaceRoot);
    const bd = computeBreakdown(prompt, contextMsgs, contextTokens);
    const total = bd.reduce((sum, b) => sum + b.tokens, 0);
    return { tools: toolList, breakdown: bd, totalBreakdown: total };
  }, [docContent, contextMsgs, contextTokens, maxContext]);

  return (
    <div className="moflow-ctx-view">
      <div className="moflow-ctx-section">
        <div className="moflow-ctx-section-header">{t("统计信息", "Statistics")}</div>
        <div className="moflow-ctx-stat-row">
          <span>{t("上下文", "Context")}</span>
          <span>{contextTokens.toLocaleString()} / {maxContext.toLocaleString()} tokens</span>
        </div>
        {tools.length > 0 && (
          <div className="moflow-ctx-stat-row">
            <span>{t("工具", "Tools")}</span>
            <span>{tools.map((t) => t.function.name).join(", ")}</span>
          </div>
        )}
        <div className="moflow-ctx-stat-row">
          <span>{t("费用", "Cost")}</span>
          <span>{formatCost(cost, currency)}</span>
        </div>
      </div>

      <div className="moflow-ctx-section">
        <div className="moflow-ctx-section-header">{t("上下文占比", "Context Breakdown")}</div>
        {totalBreakdown > 0 ? (
          <>
            <div className="moflow-ctx-bar">
              {breakdown.map((b) =>
                b.tokens > 0 ? (
                  <div
                    key={b.role}
                    className="moflow-ctx-bar-segment"
                    style={{
                      width: `${(b.tokens / totalBreakdown) * 100}%`,
                      backgroundColor: ROLE_COLORS[b.role],
                    }}
                  />
                ) : null
              )}
            </div>
            <div className="moflow-ctx-legend">
              {breakdown.map((b) => (
                <div key={b.role} className="moflow-ctx-legend-item">
                  <span
                    className="moflow-ctx-legend-dot"
                    style={{ backgroundColor: ROLE_COLORS[b.role] }}
                  />
                  <span>{ROLE_LABELS[b.role]}</span>
                  <span className="moflow-ctx-legend-pct">
                    {totalBreakdown > 0 ? Math.round((b.tokens / totalBreakdown) * 100) : 0}%
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="moflow-ctx-empty">{t("暂无上下文", "No context yet")}</div>
        )}
      </div>

      <div className="moflow-ctx-section">
        <div className="moflow-ctx-section-header">{t("原始消息", "Raw Messages")}</div>
        {contextMsgs.length === 0 ? (
          <div className="moflow-ctx-empty">{t("暂无消息", "No messages")}</div>
        ) : (
          <div className="moflow-ctx-msg-list">
            {contextMsgs.map((msg) => (
              <MessageRow key={msg.id} msg={msg} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
