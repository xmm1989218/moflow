import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import { useThemeStore } from "../../stores/themeStore";
import { useSkillStore } from "../../stores/skillStore";
import { getProviderModels } from "../../lib/modelInfo";
import { t } from "../../i18n/core";
import { useT } from "../../i18n/useT";
import { ArrowLeft, Check } from "lucide-react";

const COMMANDS = [
  { id: "new", label: "/new", desc: "ai.slash.new" },
  { id: "compact", label: "/compact", desc: "ai.slash.compact" },
  { id: "skills", label: "/skills", desc: "ai.slash.skills" },
  { id: "models", label: "/models", desc: "ai.slash.models" },
];

export interface SlashCommandMenuHandle {
  handleKeyDown: (e: React.KeyboardEvent) => boolean;
}

interface SlashCommandMenuProps {
  input: string;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  onSelectCommand: (id: string) => void;
  onSelectModel: (modelId: string) => void;
  onClose: () => void;
}

const SlashCommandMenu = forwardRef<SlashCommandMenuHandle, SlashCommandMenuProps>(
  function SlashCommandMenu({ input, inputRef, onSelectCommand, onSelectModel, onClose }, ref) {
    useT();
    const [highlightIndex, setHighlightIndex] = useState(0);
    const [phase, setPhase] = useState<"commands" | "models" | "skills">("commands");
    const menuRef = useRef<HTMLDivElement>(null);
    const config = useThemeStore((s) => s.aiConfig);
    const discoveredSkills = useSkillStore((s) => s.discoveredSkills);
    const enabledSkills = discoveredSkills.filter((s) => s.enabled);
    const models = getProviderModels(config.providerId);

    const query = input.slice(1).toLowerCase();

    const filteredCommands = COMMANDS.filter((c) =>
      c.id.startsWith(query)
    );

    const hasModels = models.length > 0;

    useEffect(() => {
      setHighlightIndex(0);
      setPhase("commands");
    }, [query]);

    useEffect(() => {
      if (phase !== "commands") {
        setHighlightIndex(0);
      }
    }, [phase]);

    const items = phase === "commands"
      ? filteredCommands.map((c) => ({
          id: c.id,
          label: c.label,
          desc: t(c.desc),
          disabled: c.id === "models" && !hasModels,
        }))
      : phase === "models"
      ? models.map((m) => ({
          id: m.id,
          label: m.id,
          desc: m.id === config.model ? t("ai.slash.currentModel") : "",
          disabled: false,
        }))
      : enabledSkills.map((s) => ({
          id: s.name,
          label: s.name,
          desc: s.description,
          disabled: false,
        }));

    useImperativeHandle(ref, () => ({
      handleKeyDown(e: React.KeyboardEvent) {
        if (items.length === 0) {
          if (e.key === "Escape") {
            if (phase !== "commands") {
              setPhase("commands");
              return true;
            }
            onClose();
            return true;
          }
          return false;
        }

        if (e.key === "ArrowDown") {
          e.preventDefault();
          const enabledItems = items.filter((i) => !i.disabled);
          if (enabledItems.length === 0) return true;
          setHighlightIndex((prev) => {
            const enabledIndices = items.map((i, idx) => (!i.disabled ? idx : -1)).filter((i) => i >= 0);
            const currentPos = enabledIndices.indexOf(prev);
            const nextPos = currentPos >= 0 ? (currentPos + 1) % enabledIndices.length : 0;
            return enabledIndices[nextPos];
          });
          return true;
        }

        if (e.key === "ArrowUp") {
          e.preventDefault();
          const enabledItems = items.filter((i) => !i.disabled);
          if (enabledItems.length === 0) return true;
          setHighlightIndex((prev) => {
            const enabledIndices = items.map((i, idx) => (!i.disabled ? idx : -1)).filter((i) => i >= 0);
            const currentPos = enabledIndices.indexOf(prev);
            const nextPos = currentPos > 0 ? currentPos - 1 : enabledIndices.length - 1;
            return enabledIndices[nextPos];
          });
          return true;
        }

        if (e.key === "Enter") {
          e.preventDefault();
          const item = items[highlightIndex];
          if (!item || item.disabled) return true;
          if (phase === "commands") {
            if (item.id === "models") {
              setPhase("models");
              return true;
            }
            if (item.id === "skills") {
              setPhase("skills");
              return true;
            }
            onSelectCommand(item.id);
          } else if (phase === "models") {
            onSelectModel(item.id);
          } else {
            onClose();
          }
          return true;
        }

        if (e.key === "Escape") {
          if (phase !== "commands") {
            setPhase("commands");
            return true;
          }
          onClose();
          return true;
        }

        if (e.key === "Backspace" && input === "/") {
          onClose();
          return false;
        }

        return false;
      },
    }));

    useEffect(() => {
      function handleClickOutside(e: MouseEvent) {
        if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
          if (inputRef.current && inputRef.current.contains(e.target as Node)) return;
          onClose();
        }
      }
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [onClose, inputRef]);

    if (!input.startsWith("/") || input.includes(" ")) return null;
    if (phase === "commands" && filteredCommands.length === 0) return null;
    if (phase === "models" && !hasModels) return null;

    const textareaEl = inputRef.current;
    let menuStyle: React.CSSProperties = {};
    if (textareaEl) {
      const rect = textareaEl.getBoundingClientRect();
      menuStyle = {
        position: "fixed",
        left: rect.left,
        width: rect.width,
        bottom: window.innerHeight - rect.top + 4,
        zIndex: 100,
      };
    }

    const BackButton = (
      <button
        className="flex items-center justify-center w-5 h-5 rounded border-none bg-transparent text-moflow-text-secondary cursor-pointer hover:bg-moflow-bg-secondary hover:text-moflow-text"
        onClick={() => setPhase("commands")}
        type="button"
      >
        <ArrowLeft size={12} />
      </button>
    );

    return (
      <div ref={menuRef} className="max-h-60 bg-moflow-bg border border-moflow-border rounded-lg overflow-y-auto animate-search-appear" style={{ ...menuStyle, boxShadow: "0 4px 16px rgba(0, 0, 0, 0.12)" }}>
        {phase === "commands" && filteredCommands.map((c) => {
          const idx = items.findIndex((i) => i.id === c.id);
          const disabled = c.id === "models" && !hasModels;
          return (
            <div
              key={c.id}
              className={`flex items-center justify-between py-[7px] px-2.5 cursor-pointer transition-[background-color] duration-100 gap-2 ${idx === highlightIndex && !disabled ? "bg-moflow-bg-secondary" : ""} ${disabled ? "opacity-40 cursor-default" : ""}`}
              onMouseEnter={() => { if (!disabled) setHighlightIndex(idx); }}
              onClick={() => {
                if (disabled) return;
                if (c.id === "models") {
                  setPhase("models");
                } else if (c.id === "skills") {
                  setPhase("skills");
                } else {
                  onSelectCommand(c.id);
                }
              }}
            >
              <span className="text-[13px] font-medium text-moflow-text whitespace-nowrap">{c.label}</span>
              <span className="text-[11px] text-moflow-text-secondary whitespace-nowrap">{t(c.desc)}</span>
            </div>
          );
        })}
        {phase === "models" && (
          <>
            <div className="flex items-center justify-between py-1.5 px-2.5 text-[11px] font-semibold text-moflow-text-secondary border-b border-moflow-border sticky top-0 bg-moflow-bg z-1">
              <span>{t("ai.slash.selectModel")}</span>
              {BackButton}
            </div>
            {models.map((m, idx) => (
              <div
                key={m.id}
                className={`flex items-center justify-between py-[7px] px-2.5 cursor-pointer transition-[background-color] duration-100 gap-2 ${idx === highlightIndex ? "bg-moflow-bg-secondary" : ""} ${m.id === config.model ? "pl-[7px] border-l-[3px] border-moflow-accent" : ""}`}
                onMouseEnter={() => setHighlightIndex(idx)}
                onClick={() => onSelectModel(m.id)}
              >
                <span className="text-[13px] font-medium text-moflow-text whitespace-nowrap">{m.id}</span>
                {m.id === config.model && (
                  <span className="flex items-center text-moflow-accent shrink-0">
                    <Check size={12} strokeWidth={3} />
                  </span>
                )}
              </div>
            ))}
          </>
        )}
        {phase === "skills" && (
          <>
            <div className="flex items-center justify-between py-1.5 px-2.5 text-[11px] font-semibold text-moflow-text-secondary border-b border-moflow-border sticky top-0 bg-moflow-bg z-1">
              <span>{t("ai.slash.selectSkill")}</span>
              {BackButton}
            </div>
            {enabledSkills.length === 0 ? (
              <div className="py-[10px] px-2.5 text-[12px] text-moflow-text-secondary">{t("ai.slash.skillsEmpty")}</div>
            ) : (
              enabledSkills.map((s, idx) => (
                <div
                  key={s.name}
                  className={`py-[7px] px-2.5 cursor-default transition-[background-color] duration-100 ${idx === highlightIndex ? "bg-moflow-bg-secondary" : ""}`}
                  onMouseEnter={() => setHighlightIndex(idx)}
                >
                  <span className="text-[13px] font-medium text-moflow-text">{s.name}</span>
                  <p className="text-[11px] text-moflow-text-secondary m-0 leading-[1.3]">{s.description}</p>
                </div>
              ))
            )}
          </>
        )}
      </div>
    );
  }
);

export default SlashCommandMenu;