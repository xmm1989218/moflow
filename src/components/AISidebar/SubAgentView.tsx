import { useChatStore, type Message } from "../../stores/chatStore";
import { t } from "../../i18n/core";
import { useT } from "../../i18n/useT";
import MessageContent from "./MessageContent";
import type { SubAgentExecution } from "../../lib/types";

export default function SubAgentView({ execution }: { execution: SubAgentExecution }) {
  useT();

  const handleBack = () => {
    useChatStore.getState().setActiveSubAgentView(null);
  };

  const typeLabel = execution.subagentType === "explore" ? t("ai.task.explore") : t("ai.task.general");
  const typeIcon = execution.subagentType === "explore" ? "🔍" : "⚡";

  return (
    <div className="moflow-ai-subagent-view">
      <div className="moflow-ai-subagent-view-header">
        <button className="moflow-ai-subagent-view-back" onClick={handleBack} type="button">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          {t("ai.task.backToMain")}
        </button>
        <span className="moflow-ai-subagent-view-badge">{typeIcon} {typeLabel}</span>
        <span className="moflow-ai-subagent-view-rounds">{execution.totalRounds} {t("ai.task.rounds")}</span>
      </div>
      <div className="moflow-ai-subagent-view-desc">{execution.description}</div>
      <div className="moflow-ai-messages">
        {execution.messages.map((msg) => (
          <SubAgentMessage key={msg.id} msg={msg} />
        ))}
        {execution.messages.length === 0 && (
          <div className="moflow-ai-empty">
            <p>{t("ai.task.noMessages")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SubAgentMessage({ msg }: { msg: Message }) {
  if (msg.role === "tool") {
    return (
      <div className="moflow-ai-tool-group">
        <details>
          <summary className="moflow-ai-tool-group-summary">
            <span className="moflow-ai-tool-group-icon"><ToolIcon /></span>
            <span>{msg.toolName}</span>
          </summary>
          <pre className="moflow-ai-tool-result-content">{msg.content}</pre>
        </details>
      </div>
    );
  }

  if (msg.role === "assistant") {
    return (
      <div className="moflow-ai-message moflow-ai-message-assistant">
        <div className="moflow-ai-message-content">
          <MessageContent content={msg.content} />
        </div>
      </div>
    );
  }

  return (
    <div className="moflow-ai-message moflow-ai-message-user">
      <div className="moflow-ai-message-content">
        {msg.content}
      </div>
    </div>
  );
}

function ToolIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}
