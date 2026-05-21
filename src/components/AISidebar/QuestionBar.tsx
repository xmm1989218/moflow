import { useChatStore } from "../../stores/chatStore";
import { useShallow } from "zustand/react/shallow";
import type { QuestionItem } from "../../lib/tools";
import { t } from "../../i18n/core";
import { useT } from "../../i18n/useT";

const EMPTY_NUM_STR: Record<number, string> = {};
const EMPTY_NUM_BOOL: Record<number, boolean> = {};

interface QuestionBarProps {
  questions: QuestionItem[];
  chatKey: string;
  onConfirm: (answer: string) => void;
}

export default function QuestionBar({ questions, chatKey, onConfirm }: QuestionBarProps) {
  useT();

  const step = useChatStore((s) => s.questionStepMap[chatKey] ?? 0);
  const { answers, showCustom, customInputs } = useChatStore(useShallow((s) => ({
    answers: s.questionAnswersMap[chatKey] ?? EMPTY_NUM_STR,
    showCustom: s.questionShowCustomMap[chatKey] ?? EMPTY_NUM_BOOL,
    customInputs: s.questionCustomInputsMap[chatKey] ?? EMPTY_NUM_STR,
  })));

  const q = questions[step];
  const isLast = step === questions.length - 1;
  const isFirst = step === 0;

  const setStep = (v: number) => useChatStore.getState().setQuestionStep(chatKey, v);
  const setAnswers = (v: Record<number, string>) => useChatStore.getState().setQuestionAnswers(chatKey, v);
  const setShowCustom = (v: Record<number, boolean>) => useChatStore.getState().setQuestionShowCustom(chatKey, v);
  const setCustomInputs = (v: Record<number, string>) => useChatStore.getState().setQuestionCustomInputs(chatKey, v);

  const handleToggle = (label: string) => {
    if (q.multiple) {
      const current = answers[step] ?? "";
      const selected = current ? current.split(", ") : [];
      if (selected.includes(label)) {
        const next = selected.filter((s) => s !== label).join(", ");
        setAnswers({ ...answers, [step]: next });
      } else {
        const next = [...selected, label].join(", ");
        setAnswers({ ...answers, [step]: next });
      }
    } else {
      setAnswers({ ...answers, [step]: label });
      setShowCustom({ ...showCustom, [step]: false });
    }
  };

  const handleCustomToggle = () => {
    const next = !showCustom[step];
    if (next) {
      setAnswers({ ...answers, [step]: "" });
    }
    setShowCustom({ ...showCustom, [step]: next });
  };

  const getSelectedSet = () => {
    const current = answers[step] ?? "";
    return new Set(current ? current.split(", ") : []);
  };

  const isCurrentAnswered = () => {
    if (showCustom[step]) return (customInputs[step]?.trim() ?? "").length > 0;
    return (answers[step]?.length ?? 0) > 0;
  };

  const handleNext = () => {
    if (showCustom[step] && customInputs[step]?.trim()) {
      setAnswers({ ...answers, [step]: customInputs[step].trim() });
      setShowCustom({ ...showCustom, [step]: false });
    }
    setStep(step + 1);
  };

  const handlePrev = () => {
    setStep(step - 1);
  };

  const handleConfirm = () => {
    const finalAnswers = { ...answers };
    if (showCustom[step] && customInputs[step]?.trim()) {
      finalAnswers[step] = customInputs[step].trim();
    }
    const lines = questions.map((item, i) => `Q: ${item.question} → ${finalAnswers[i] ?? ""}`);
    useChatStore.getState().clearQuestionFormState(chatKey);
    onConfirm(lines.join("\n"));
  };

  const selected = getSelectedSet();

  return (
    <div className="moflow-ai-question-bar">
      {questions.length > 1 && (
        <div className="moflow-ai-question-progress">{step + 1} / {questions.length}</div>
      )}
      <div className="moflow-ai-question-step">
        <div className="moflow-ai-question-text">{q.question}</div>
        <div className="moflow-ai-question-list">
          {q.options.map((opt) => (
            <label
              key={opt.label}
              className={`moflow-ai-question-item${selected.has(opt.label) ? " moflow-ai-question-item-selected" : ""}`}
              title={opt.description}
            >
              <span className={`moflow-ai-question-check ${q.multiple ? "moflow-ai-question-checkbox" : "moflow-ai-question-radio"}`}>
                {selected.has(opt.label) && <span className="moflow-ai-question-check-inner" />}
              </span>
              <span className="moflow-ai-question-item-content">
                <span className="moflow-ai-question-item-label">{opt.label}</span>
                {opt.description && <span className="moflow-ai-question-item-desc">{opt.description}</span>}
              </span>
              <input
                type={q.multiple ? "checkbox" : "radio"}
                className="moflow-ai-question-sr-input"
                checked={selected.has(opt.label)}
                onChange={() => handleToggle(opt.label)}
              />
            </label>
          ))}
          <label
            className={`moflow-ai-question-item moflow-ai-question-item-custom${showCustom[step] ? " moflow-ai-question-item-selected" : ""}`}
            onClick={handleCustomToggle}
          >
            <span className={`moflow-ai-question-check ${q.multiple ? "moflow-ai-question-checkbox" : "moflow-ai-question-radio"}`}>
              {showCustom[step] && <span className="moflow-ai-question-check-inner" />}
            </span>
            <span className="moflow-ai-question-item-label">{t("question.customAnswer")}</span>
          </label>
        </div>
        {showCustom[step] && (
          <div className="moflow-ai-question-custom">
            <input
              type="text"
              className="moflow-ai-question-custom-input"
              value={customInputs[step] ?? ""}
              onChange={(e) => setCustomInputs({ ...customInputs, [step]: e.target.value })}
              placeholder={t("question.customPlaceholder")}
              autoFocus
            />
          </div>
        )}
      </div>
      <div className="moflow-ai-question-actions">
        {!isFirst && (
          <button className="moflow-ai-question-back" onClick={handlePrev}>
            {t("question.back")}
          </button>
        )}
        {isLast ? (
          <button
            className="moflow-ai-question-confirm"
            onClick={handleConfirm}
            disabled={!isCurrentAnswered()}
          >
            {t("question.confirm")}
          </button>
        ) : (
          <button
            className="moflow-ai-question-next"
            onClick={handleNext}
            disabled={!isCurrentAnswered()}
          >
            {t("question.next")}
          </button>
        )}
      </div>
    </div>
  );
}
