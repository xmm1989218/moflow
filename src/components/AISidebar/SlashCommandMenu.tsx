import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import { useThemeStore } from "../../stores/themeStore";
import { getProviderModels } from "../../lib/modelInfo";
import { t, isZh } from "../../lib/i18n";

const COMMANDS = [
  { id: "new", label: "/new", descZh: "清空对话", descEn: "Clear chat" },
  { id: "compact", label: "/compact", descZh: "压缩对话历史", descEn: "Compress chat history" },
  { id: "models", label: "/models", descZh: "切换模型", descEn: "Switch model" },
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
    const [highlightIndex, setHighlightIndex] = useState(0);
    const [phase, setPhase] = useState<"commands" | "models">("commands");
    const menuRef = useRef<HTMLDivElement>(null);
    const config = useThemeStore((s) => s.aiConfig);
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
      if (phase === "models") {
        setHighlightIndex(0);
      }
    }, [phase]);

    const items = phase === "commands"
      ? filteredCommands.map((c) => ({
          id: c.id,
          label: c.label,
          desc: isZh ? c.descZh : c.descEn,
          disabled: c.id === "models" && !hasModels,
        }))
      : models.map((m) => ({
          id: m.id,
          label: m.id,
          desc: m.id === config.model ? (isZh ? "当前" : "current") : "",
          disabled: false,
        }));

    useImperativeHandle(ref, () => ({
      handleKeyDown(e: React.KeyboardEvent) {
        if (items.length === 0) {
          if (e.key === "Escape") {
            if (phase === "models") {
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
            onSelectCommand(item.id);
          } else {
            onSelectModel(item.id);
          }
          return true;
        }

        if (e.key === "Escape") {
          if (phase === "models") {
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
        bottom: window.innerHeight - rect.top + 4,
        zIndex: 100,
      };
    }

    return (
      <div ref={menuRef} className="w-[280px] max-h-60 bg-moflow-bg border border-moflow-border rounded-lg overflow-y-auto animate-search-appear" style={{ ...menuStyle, boxShadow: "0 4px 16px rgba(0, 0, 0, 0.12)" }}>
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
                } else {
                  onSelectCommand(c.id);
                }
              }}
            >
              <span className="text-[13px] font-medium text-moflow-text whitespace-nowrap">{c.label}</span>
              <span className="text-[11px] text-moflow-text-secondary whitespace-nowrap">{isZh ? c.descZh : c.descEn}</span>
            </div>
          );
        })}
        {phase === "models" && (
          <>
            <div className="flex items-center justify-between py-1.5 px-2.5 text-[11px] font-semibold text-moflow-text-secondary border-b border-moflow-border sticky top-0 bg-moflow-bg z-1">
              <span>{t("选择模型", "Select Model")}</span>
              <button
                className="flex items-center justify-center w-5 h-5 rounded border-none bg-transparent text-moflow-text-secondary cursor-pointer hover:bg-moflow-bg-secondary hover:text-moflow-text"
                onClick={() => setPhase("commands")}
                type="button"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5" />
                  <path d="M12 19l-7-7 7-7" />
                </svg>
              </button>
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
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    );
  }
);

export default SlashCommandMenu;
