import { Search, Zap, ChevronLeft, Wrench } from "lucide-react";
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
  const typeIcon = execution.subagentType === "explore" ? <Search size={14} /> : <Zap size={14} />;

  return (
    <div className="moflow-ai-subagent-view">
      <div className="moflow-ai-subagent-view-header">
        <button className="moflow-ai-subagent-view-back" onClick={handleBack} type="button">
          <ChevronLeft size={14} />
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
  return <Wrench size={16} />;
}
