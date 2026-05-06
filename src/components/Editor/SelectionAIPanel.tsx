import { useEffect, useRef, useState, useCallback } from "react";
import { useAISelectionStore, LANGUAGES, type LanguageCode } from "../../stores/aiSelectionStore";
import { useAIConfigStore } from "../../stores/aiConfigStore";
import { useChatStore } from "../../stores/chatStore";
import { useTabStore } from "../../stores/tabStore";
import { useThemeStore } from "../../stores/themeStore";
import { getLLMClient } from "../../lib/llmClient";
import { buildSystemPrompt } from "../../lib/contextBuilder";
import { getModelInfo, calculateCost } from "../../lib/modelInfo";
import "./SelectionAIPanel.css";

const isZh = navigator.language.startsWith("zh");
const t = (zh: string, en: string) => (isZh ? zh : en);

function getLangLabel(code: LanguageCode): string {
  const lang = LANGUAGES.find((l) => l.code === code);
  return lang ? (isZh ? lang.label : lang.labelEn) : code;
}

export default function SelectionAIPanel() {
  const activeAction = useAISelectionStore((s) => s.activeAction);
  const selectedText = useAISelectionStore((s) => s.selectedText);
  const selectionCoords = useAISelectionStore((s) => s.selectionCoords);
  const sourceLang = useAISelectionStore((s) => s.sourceLang);
  const targetLang = useAISelectionStore((s) => s.targetLang);
  const setTargetLang = useAISelectionStore((s) => s.setTargetLang);
  const setSourceLang = useAISelectionStore((s) => s.setSourceLang);
  const swapLanguages = useAISelectionStore((s) => s.swapLanguages);
  const dismiss = useAISelectionStore((s) => s.dismiss);

  const aiConfig = useAIConfigStore((s) => s.config);
  const addMessage = useChatStore((s) => s.addMessage);
  const appendToLastMessage = useChatStore((s) => s.appendToLastMessage);
  const addUsage = useChatStore((s) => s.recordUsage);
  const setStreaming = useChatStore((s) => s.setStreaming);
  const toggleAISidebar = useThemeStore((s) => s.toggleAISidebar);
  const showAISidebar = useThemeStore((s) => s.showAISidebar);
  const activeFileId = useTabStore((s) => s.activeFileId);
  const docContent = useTabStore((s) => {
    const tab = s.files.find((f) => f.id === s.activeFileId);
    return tab?.content ?? "";
  });

  const [result, setResult] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const recordStandaloneUsage = useChatStore((s) => s.recordStandaloneUsage);

  const doLLMRequest = useCallback(
    async (prompt: string) => {
      setResult("");
      setIsStreaming(true);
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const client = getLLMClient(aiConfig);
        const systemPrompt = buildSystemPrompt(docContent, getModelInfo(aiConfig.providerId, aiConfig.model).maxContext);

        const result = await client.chat(
          [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          (chunk) => {
            setResult((prev) => prev + chunk);
          },
          controller.signal
        );

        const { cost: costVal } = calculateCost(
          result.usage.promptTokens,
          result.usage.completionTokens,
          aiConfig.providerId,
          aiConfig.model
        );
        recordStandaloneUsage(activeFileId, result.usage.promptTokens, result.usage.completionTokens, costVal);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setResult((prev) => prev + `\n\n❌ ${t("请求失败", "Request failed")}: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [aiConfig, docContent, activeFileId, recordStandaloneUsage]
  );

  useEffect(() => {
    if (activeAction === "explain" && selectedText) {
      const prompt = t(`请用简洁的语言解释以下内容：\n\n${selectedText}`, `Briefly explain the following:\n\n${selectedText}`);
      doLLMRequest(prompt);
    } else if (activeAction === "translate" && selectedText) {
      const targetLabel = getLangLabel(targetLang);
      const prompt = t(`请将以下内容翻译为${targetLabel}，只输出翻译结果，不要添加任何解释：\n\n${selectedText}`, `Translate the following to ${targetLabel}, output only the translation:\n\n${selectedText}`);
      doLLMRequest(prompt);
    }
  }, [activeAction, targetLang, selectedText, doLLMRequest]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        const target = e.target as HTMLElement;
        if (target.closest(".milkdown-toolbar")) return;
        abortRef.current?.abort();
        dismiss();
      }
    }

    if (activeAction) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [activeAction, dismiss]);

  const handleAsk = () => {
    if (!inputValue.trim()) return;

    const question = inputValue.trim();
    setInputValue("");

    addMessage(activeFileId, {
      role: "user",
      content: t(`关于以下文本：\n${selectedText}\n\n用户问题：${question}`, `Regarding the following text:\n${selectedText}\n\nQuestion: ${question}`),
    });

    if (!showAISidebar) {
      toggleAISidebar();
    }

    const contextMsgs = useChatStore.getState().getContext(activeFileId);
    const systemPrompt = buildSystemPrompt(docContent, getModelInfo(aiConfig.providerId, aiConfig.model).maxContext);
    const client = getLLMClient(aiConfig);

    setStreaming(true);
    addMessage(activeFileId, { role: "assistant", content: "" });

    const controller = new AbortController();

    client
      .chat(
        [
          { role: "system", content: systemPrompt },
          ...contextMsgs.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        ],
        (chunk) => {
          appendToLastMessage(activeFileId, chunk);
        },
        controller.signal
      )
      .then((result) => {
        const { cost: costVal } = calculateCost(
          result.usage.promptTokens,
          result.usage.completionTokens,
          aiConfig.providerId,
          aiConfig.model
        );
        addUsage(activeFileId, result.usage.promptTokens, result.usage.completionTokens, costVal);
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        appendToLastMessage(
          activeFileId,
          `\n\n❌ ${t("请求失败", "Request failed")}: ${e instanceof Error ? e.message : String(e)}`
        );
      })
      .finally(() => {
        setStreaming(false);
      });

    dismiss();
  };

  const handleAskKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
    if (e.key === "Escape") {
      dismiss();
    }
  };

  if (!activeAction || !selectionCoords) return null;

  const panelStyle: React.CSSProperties = {
    position: "fixed",
    left: Math.min(selectionCoords.x, window.innerWidth - 380),
    top: Math.min(selectionCoords.y + 8, window.innerHeight - 300),
    zIndex: 50,
  };

  return (
    <div ref={panelRef} className="moflow-selection-ai-panel" style={panelStyle}>
      {activeAction === "translate" && (
        <>
          <div className="moflow-selection-ai-lang-row">
            <select
              className="moflow-selection-ai-lang-select moflow-selection-ai-lang-source"
              value={sourceLang}
              onChange={(e) => setSourceLang(e.target.value as LanguageCode)}
            >
              {LANGUAGES.filter((l) => l.code === "auto" || l.code !== targetLang).map((l) => (
                <option key={l.code} value={l.code}>
                  {isZh ? l.label : l.labelEn}
                </option>
              ))}
            </select>
            <button className="moflow-selection-ai-lang-swap" onClick={swapLanguages}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 16l-4-4 4-4" />
                <path d="M17 8l4 4-4 4" />
                <line x1="3" y1="12" x2="21" y2="12" />
              </svg>
            </button>
            <select
              className="moflow-selection-ai-lang-select moflow-selection-ai-lang-target"
              value={targetLang}
              onChange={(e) => {
                setTargetLang(e.target.value as LanguageCode);
                abortRef.current?.abort();
              }}
            >
              {LANGUAGES.filter((l) => l.code !== "auto" && l.code !== sourceLang).map((l) => (
                <option key={l.code} value={l.code}>
                  {isZh ? l.label : l.labelEn}
                </option>
              ))}
            </select>
          </div>
          <div className="moflow-selection-ai-source-text">
            <span className="moflow-selection-ai-source-bar" />
            <span className="moflow-selection-ai-source-content">
              {selectedText.length > 200 ? selectedText.slice(0, 200) + "..." : selectedText}
            </span>
          </div>
        </>
      )}

      {(activeAction === "explain" || activeAction === "translate") && (
        <div className="moflow-selection-ai-result">
          {result || (
            <span className="moflow-selection-ai-placeholder">
              {isStreaming ? t("思考中...", "Thinking...") : ""}
            </span>
          )}
          {isStreaming && <span className="moflow-selection-ai-cursor">▌</span>}
        </div>
      )}

      {activeAction === "ask" && (
        <div className="moflow-selection-ai-ask-row">
          <input
            className="moflow-selection-ai-ask-input"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleAskKeyDown}
            placeholder={t("对选中内容提问...", "Ask about selected text...")}
            autoFocus
          />
          <button
            className="moflow-selection-ai-ask-send"
            onClick={handleAsk}
            disabled={!inputValue.trim()}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
