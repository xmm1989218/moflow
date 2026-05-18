import { useState } from "react";
import type { QuestionItem } from "../../lib/tools";
import { t } from "../../i18n/core";
import { useT } from "../../i18n/useT";

interface QuestionBarProps {
  questions: QuestionItem[];
  onConfirm: (answer: string) => void;
}

export default function QuestionBar({ questions, onConfirm }: QuestionBarProps) {
  useT();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [showCustom, setShowCustom] = useState<Record<number, boolean>>({});
  const [customInputs, setCustomInputs] = useState<Record<number, string>>({});

  const q = questions[step];
  const isLast = step === questions.length - 1;
  const isFirst = step === 0;

  const handleToggle = (label: string) => {
    if (q.multiple) {
      const current = answers[step] ?? "";
      const selected = current ? current.split(", ") : [];
      if (selected.includes(label)) {
        const next = selected.filter((s) => s !== label).join(", ");
        setAnswers((prev) => ({ ...prev, [step]: next }));
      } else {
        const next = [...selected, label].join(", ");
        setAnswers((prev) => ({ ...prev, [step]: next }));
      }
    } else {
      setAnswers((prev) => ({ ...prev, [step]: label }));
      setShowCustom((prev) => ({ ...prev, [step]: false }));
    }
  };

  const handleCustomToggle = () => {
    setShowCustom((prev) => {
      const next = !prev[step];
      if (next) {
        setAnswers((ap) => ({ ...ap, [step]: "" }));
      }
      return { ...prev, [step]: next };
    });
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
      setAnswers((prev) => ({ ...prev, [step]: customInputs[step].trim() }));
      setShowCustom((prev) => ({ ...prev, [step]: false }));
    }
    setStep((s) => s + 1);
  };

  const handlePrev = () => {
    setStep((s) => s - 1);
  };

  const handleConfirm = () => {
    const finalAnswers = { ...answers };
    if (showCustom[step] && customInputs[step]?.trim()) {
      finalAnswers[step] = customInputs[step].trim();
    }
    const lines = questions.map((item, i) => `Q: ${item.question} → ${finalAnswers[i] ?? ""}`);
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
              onChange={(e) => setCustomInputs((prev) => ({ ...prev, [step]: e.target.value }))}
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
