import { Search, Zap, ChevronRight } from "lucide-react";
import { t } from "../../i18n/core";
import { useT } from "../../i18n/useT";

interface SubAgentCardProps {
  description: string;
  subagentType: "explore" | "general";
  totalRounds: number;
  content: string;
  onClick: () => void;
}

export default function SubAgentCard({ description, subagentType, totalRounds, onClick }: SubAgentCardProps) {
  useT();

  const typeLabel = subagentType === "explore" ? t("ai.task.explore") : t("ai.task.general");
  const typeIcon = subagentType === "explore" ? <Search size={12} /> : <Zap size={12} />;

  return (
    <button
      className="moflow-ai-subagent-card"
      onClick={onClick}
      type="button"
    >
      <div className="moflow-ai-subagent-card-header">
        <span className="moflow-ai-subagent-card-type">{typeIcon} {typeLabel}</span>
        <span className="moflow-ai-subagent-card-rounds">{totalRounds} {t("ai.task.rounds")}</span>
      </div>
      <div className="moflow-ai-subagent-card-desc">{description}</div>
      <ChevronRight size={14} className="moflow-ai-subagent-card-arrow" />
    </button>
  );
}
