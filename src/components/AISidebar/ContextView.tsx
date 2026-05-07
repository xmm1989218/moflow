import { useChatStore, type Message } from "../../stores/chatStore";
import { buildSystemPrompt, estimateTokens } from "../../lib/contextBuilder";
import { getModelInfo, formatCost } from "../../lib/modelInfo";
import { docToolDefinitions, networkToolDefinitions } from "../../lib/tools";

const isZh = navigator.language.startsWith("zh");
const t = (zh: string, en: string) => (isZh ? zh : en);

interface ContextViewProps {
  tabId: string;
  providerId: string;
  model: string;
  docContent: string;
}

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

function MessageRow({ msg }: { msg: ContextMessage }) {
  const idShort = msg.id.slice(0, 8);
  const color = ROLE_COLORS[msg.role] || "#9ca3af";
  let label = `${ROLE_LABELS[msg.role] || msg.role}  ${idShort}`;

  if (msg.role === "assistant" && msg.toolCalls?.length) {
    const toolNames = msg.toolCalls.map((tc) => tc.name).join(", ");
    label += `  [${toolNames}]`;
  }
  if (msg.role === "tool" && msg.toolName) {
    label += `  ${msg.toolName}`;
  }

  const defaultOpen = false;

  let expandedContent = msg.content;
  if (msg.role === "assistant" && msg.toolCalls?.length) {
    expandedContent += `\n\n--- toolCalls ---\n${JSON.stringify(msg.toolCalls, null, 2)}`;
  }

  return (
    <details className="moflow-ctx-msg" open={defaultOpen}>
      <summary className="moflow-ctx-msg-summary" style={{ color }}>
        <span className="moflow-ctx-msg-arrow">▶</span>
        <span className="moflow-ctx-msg-label">{label}</span>
      </summary>
      <pre className="moflow-ctx-msg-content">{expandedContent}</pre>
    </details>
  );
}

export default function ContextView({ tabId, providerId, model, docContent }: ContextViewProps) {
  const contextTokens = useChatStore((s) => s.contextTokensMap[tabId] ?? 0);
  const cost = useChatStore((s) => s.costMap[tabId] ?? 0);
  const contextMsgs = useChatStore((s) => s.contextMap[tabId] ?? []);

  const modelInfo = getModelInfo(providerId, model);
  const maxContext = modelInfo.maxContext || 0;
  const currency = modelInfo.currency || "USD";

  const needsDocTools = (() => {
    const docRatio = 0.50;
    const reserved = Math.floor(maxContext * (1 - docRatio));
    return estimateTokens(docContent) > (maxContext - reserved);
  })();

  const { prompt: systemPrompt, needsDocTools: promptNeedsDocTools } = buildSystemPrompt(
    docContent,
    maxContext,
    needsDocTools
  );

  const tools = promptNeedsDocTools
    ? [...docToolDefinitions, ...networkToolDefinitions]
    : [...networkToolDefinitions];

  const breakdown = computeBreakdown(systemPrompt, contextMsgs, contextTokens);
  const totalBreakdown = breakdown.reduce((sum, b) => sum + b.tokens, 0);

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
            contextMsgs.map((msg) => (
              <MessageRow key={msg.id} msg={msg} />
            ))
        )}
      </div>
    </div>
  );
}
