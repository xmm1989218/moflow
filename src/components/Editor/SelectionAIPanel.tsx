import { useEffect, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAISelectionStore, LANGUAGES, type LanguageCode } from "../../stores/aiSelectionStore";
import { useChatStore } from "../../stores/chatStore";
import { useTabStore } from "../../stores/tabStore";
import { useThemeStore } from "../../stores/themeStore";
import { getLLMClient, type ChatMessage, TimeoutError } from "../../lib/llmClient";
import { buildSystemPrompt } from "../../lib/contextBuilder";
import { getModelInfo, calculateCost } from "../../lib/modelInfo";
import { appendMessage } from "../../lib/chatPersistence";
import { t, isZh } from "../../lib/i18n";
import MessageContent from "../AISidebar/MessageContent";
import "./SelectionAIPanel.css";

function getLangLabel(code: LanguageCode): string {
  const lang = LANGUAGES.find((l) => l.code === code);
  return lang ? (isZh ? lang.label : lang.labelEn) : code;
}

const REWRITE_PRESETS = [
  { key: "polish", zh: "润色", en: "Polish" },
  { key: "expand", zh: "扩写", en: "Expand" },
  { key: "shorten", zh: "缩写", en: "Shorten" },
] as const;

const TONE_OPTIONS = [
  { key: "professional", zh: "更专业", en: "More professional" },
  { key: "academic", zh: "更学术", en: "More academic" },
  { key: "formal", zh: "更正式", en: "More formal" },
  { key: "casual", zh: "更轻松", en: "More casual" },
  { key: "literary", zh: "更有文采", en: "More literary" },
  { key: "internet", zh: "更有网感", en: "More internet-savvy" },
] as const;

function getRewritePrompt(key: string, selectedText: string): string {
  const prompts: Record<string, [string, string]> = {
    polish: [
      `请润色以下文字，使其更加流畅自然。这是一款 Markdown 编辑器，请根据内容性质合理使用 Markdown 格式（如列表、加粗、标题等），只输出润色后的结果：\n\n${selectedText}`,
      `Polish the following text to make it more fluent and natural. This is a Markdown editor, use Markdown formatting where appropriate, output only the result:\n\n${selectedText}`,
    ],
    expand: [
      `请扩写以下文字，增加更多细节和丰富内容。这是一款 Markdown 编辑器，请根据内容性质合理使用 Markdown 格式（如列表、加粗、标题等），只输出扩写后的结果：\n\n${selectedText}`,
      `Expand the following text with more details and richer content. This is a Markdown editor, use Markdown formatting where appropriate, output only the result:\n\n${selectedText}`,
    ],
    shorten: [
      `请缩写以下文字，使其更加简洁精炼，保留核心要点。只输出缩写后的结果：\n\n${selectedText}`,
      `Shorten the following text to be more concise while keeping the key points. Output only the result:\n\n${selectedText}`,
    ],
    professional: [
      `请将以下文字改写为更专业的表达，使用行业术语和规范用语。只输出改写后的结果：\n\n${selectedText}`,
      `Rewrite in a more professional tone using industry terminology. Output only the result:\n\n${selectedText}`,
    ],
    academic: [
      `请将以下文字改写为更学术化的表达，使用学术语言和严谨论述。只输出改写后的结果：\n\n${selectedText}`,
      `Rewrite in a more academic tone with scholarly language. Output only the result:\n\n${selectedText}`,
    ],
    formal: [
      `请将以下文字改写为更正式的表达，适合商务或公文场景。只输出改写后的结果：\n\n${selectedText}`,
      `Rewrite in a more formal tone suitable for business contexts. Output only the result:\n\n${selectedText}`,
    ],
    casual: [
      `请将以下文字改写为更轻松活泼的表达，口语化、亲切自然。只输出改写后的结果：\n\n${selectedText}`,
      `Rewrite in a more casual and friendly tone. Output only the result:\n\n${selectedText}`,
    ],
    literary: [
      `请将以下文字改写得更有文采，修辞优美、意境深远。只输出改写后的结果：\n\n${selectedText}`,
      `Rewrite with more literary flair and elegant rhetoric. Output only the result:\n\n${selectedText}`,
    ],
    internet: [
      `请将以下文字改写得更有网感，适合社交媒体传播，简洁有力、有梗有趣。只输出改写后的结果：\n\n${selectedText}`,
      `Rewrite with an internet-savvy style for social media, concise and engaging. Output only the result:\n\n${selectedText}`,
    ],
  };
  const pair = prompts[key];
  if (!pair) return selectedText;
  return t(pair[0], pair[1]);
}

function getCustomRewritePrompt(instruction: string, selectedText: string): string {
  return t(
    `请根据以下要求改写文字：${instruction}。这是一款 Markdown 编辑器，请根据内容性质合理使用 Markdown 格式（如列表、加粗、标题等），只输出改写后的结果：\n\n${selectedText}`,
    `Rewrite the following text according to this instruction: ${instruction}. This is a Markdown editor, use Markdown formatting where appropriate, output only the result:\n\n${selectedText}`
  );
}

function RewritePanel({ selectedText, onDismiss }: { selectedText: string; onDismiss: () => void }) {
  const aiConfig = useThemeStore((s) => s.aiConfig);
  const activeFileId = useTabStore((s) => s.activeFileId);
  const docContent = useTabStore((s) => {
    const tab = s.files.find((f) => f.id === s.activeFileId);
    return tab?.content ?? "";
  });
  const replaceSelection = useAISelectionStore((s) => s.replaceSelection);
  const recordStandaloneUsage = useChatStore((s) => s.recordStandaloneUsage);

  const [isStreaming, setIsStreaming] = useState(false);
  const [rewriteError, setRewriteError] = useState("");
  const [rewriteInput, setRewriteInput] = useState("");
  const [showToneMenu, setShowToneMenu] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const toneMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      invoke("cancel_requests");
    };
  }, []);

  useEffect(() => {
    if (!showToneMenu) return;
    function handleToneOutside(e: MouseEvent) {
      if (toneMenuRef.current && !toneMenuRef.current.contains(e.target as Node)) {
        setShowToneMenu(false);
      }
    }
    document.addEventListener("mousedown", handleToneOutside);
    return () => document.removeEventListener("mousedown", handleToneOutside);
  }, [showToneMenu]);

  const doLLMRequest = useCallback(
    async (prompt: string) => {
      setRewriteError("");
      setIsStreaming(true);
      const controller = new AbortController();
      abortRef.current = controller;
      let accumulated = "";

      try {
        const client = getLLMClient(aiConfig);
        const systemPrompt = buildSystemPrompt(docContent, getModelInfo(aiConfig.providerId, aiConfig.model).maxContext).prompt;

        const res = await client.chat(
          [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          (chunk) => {
            accumulated += chunk;
          },
          controller.signal
        );

        const { cost: costVal } = calculateCost(
          res.usage.promptTokens,
          res.usage.completionTokens,
          aiConfig.providerId,
          aiConfig.model
        );
        recordStandaloneUsage(activeFileId, res.usage.promptTokens, res.usage.completionTokens, costVal);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          return;
        }
        const msg = e instanceof TimeoutError
          ? t("请求超时", "Request timed out")
          : `${t("请求失败", "Request failed")}: ${e instanceof Error ? e.message : String(e)}`;
        setRewriteError(msg);
        setIsStreaming(false);
        abortRef.current = null;
        return;
      }

      setIsStreaming(false);
      abortRef.current = null;

      if (replaceSelection) {
        const trimmed = accumulated.trim();
        if (trimmed) {
          replaceSelection(trimmed);
          onDismiss();
        }
      }
    },
    [aiConfig, docContent, activeFileId, recordStandaloneUsage, replaceSelection, onDismiss]
  );

  const handleRewriteSend = () => {
    const instruction = rewriteInput.trim();
    if (!instruction) return;
    setRewriteInput("");
    setShowToneMenu(false);
    const prompt = getCustomRewritePrompt(instruction, selectedText);
    doLLMRequest(prompt);
  };

  const handleRewriteInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleRewriteSend();
    }
    if (e.key === "Escape") {
      onDismiss();
    }
  };

  const handleRewriteInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setRewriteInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  const handlePresetClick = (key: string) => {
    setShowToneMenu(false);
    const prompt = getRewritePrompt(key, selectedText);
    doLLMRequest(prompt);
  };

  const handleToneClick = (key: string) => {
    setShowToneMenu(false);
    const prompt = getRewritePrompt(key, selectedText);
    doLLMRequest(prompt);
  };

  return (
    <>
      {isStreaming ? (
        <div className="moflow-selection-ai-rewrite-loading">
          <span className="moflow-selection-ai-rewrite-loading-dot" />
          {t("AI 正在改写...", "AI rewriting...")}
        </div>
      ) : rewriteError ? (
        <div className="moflow-selection-ai-rewrite-error">
          ❌ {rewriteError}
        </div>
      ) : null}
      {!isStreaming && !rewriteError && (
        <>
          <div className="moflow-selection-ai-rewrite-input-row">
            <div className="moflow-selection-ai-rewrite-input-wrap">
              <textarea
                className="moflow-selection-ai-rewrite-input"
                value={rewriteInput}
                onChange={handleRewriteInputChange}
                onKeyDown={handleRewriteInputKeyDown}
                placeholder={t("输入改写要求…", "Enter rewrite instruction…")}
                autoFocus
                rows={1}
              />
              <button
                className="moflow-selection-ai-rewrite-send"
                onClick={handleRewriteSend}
                disabled={!rewriteInput.trim()}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </div>
          {!rewriteInput.trim() && (
          <div className="moflow-selection-ai-rewrite-presets">
            {REWRITE_PRESETS.map((p) => (
              <button
                key={p.key}
                className="moflow-selection-ai-rewrite-preset-btn"
                onClick={() => handlePresetClick(p.key)}
              >
                {isZh ? p.zh : p.en}
              </button>
            ))}
            <div className="moflow-selection-ai-tone-wrapper" ref={toneMenuRef}>
              <button
                className="moflow-selection-ai-rewrite-preset-btn moflow-selection-ai-tone-trigger"
                onClick={() => setShowToneMenu(!showToneMenu)}
              >
                {t("更改语气", "Change tone")}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {showToneMenu && (
                <div className="moflow-selection-ai-tone-menu">
                  {TONE_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      className="moflow-selection-ai-tone-item"
                      onClick={() => handleToneClick(opt.key)}
                    >
                      {isZh ? opt.zh : opt.en}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          )}
        </>
      )}
      {rewriteError && !isStreaming && (
        <div className="moflow-selection-ai-rewrite-presets">
          {REWRITE_PRESETS.map((p) => (
            <button
              key={p.key}
              className="moflow-selection-ai-rewrite-preset-btn"
              onClick={() => handlePresetClick(p.key)}
            >
              {isZh ? p.zh : p.en}
            </button>
          ))}
        </div>
      )}
    </>
  );
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
  const lastResult = useAISelectionStore((s) => s.lastResult);
  const setLastResult = useAISelectionStore((s) => s.setLastResult);
  const _dismiss = useAISelectionStore((s) => s.dismiss);
  const rewriteKey = useAISelectionStore((s) => s.rewriteKey);

  const aiConfig = useThemeStore((s) => s.aiConfig);
  const addMessage = useChatStore((s) => s.addMessage);
  const appendStreamingContent = useChatStore((s) => s.appendStreamingContent);
  const clearStreamingContent = useChatStore((s) => s.clearStreamingContent);
  const addUsage = useChatStore((s) => s.recordUsage);
  const setStreaming = useChatStore((s) => s.setStreaming);
  const setAbortController = useChatStore((s) => s.setAbortController);
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
  const [followUpValue, setFollowUpValue] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const recordStandaloneUsage = useChatStore((s) => s.recordStandaloneUsage);

  const dismissPanel = useCallback(() => {
    _dismiss();
  }, [_dismiss]);

  const doLLMRequest = useCallback(
    async (prompt: string) => {
      setResult("");
      setIsStreaming(true);
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const client = getLLMClient(aiConfig);
        const systemPrompt = buildSystemPrompt(docContent, getModelInfo(aiConfig.providerId, aiConfig.model).maxContext).prompt;

        const res = await client.chat(
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
          res.usage.promptTokens,
          res.usage.completionTokens,
          aiConfig.providerId,
          aiConfig.model
        );
        recordStandaloneUsage(activeFileId, res.usage.promptTokens, res.usage.completionTokens, costVal);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          return;
        }
        if (e instanceof TimeoutError) {
          console.error(`[SelectionAIPanel] Request timeout: ${e.message}`);
          setResult((prev) => prev + `\n\n❌ ${t("请求超时", "Request timed out")}`);
        } else {
          setResult((prev) => prev + `\n\n❌ ${t("请求失败", "Request failed")}: ${e instanceof Error ? e.message : String(e)}`);
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [aiConfig, docContent, activeFileId, recordStandaloneUsage]
  );

  useEffect(() => {
    if (activeAction === "polish") return;
    if (activeAction === "explain" && selectedText) {
      const prompt = t(`请用简洁的语言解释以下内容。这是一款 Markdown 编辑器的解释功能，请合理使用 Markdown 格式（如列表、加粗、标题等）使解释更清晰：\n\n${selectedText}`, `Briefly explain the following. This is a Markdown editor's explain feature, use Markdown formatting (lists, bold, headings, etc.) to make the explanation clearer:\n\n${selectedText}`);
      queueMicrotask(() => doLLMRequest(prompt));
    } else if (activeAction === "translate" && selectedText) {
      const targetLabel = getLangLabel(targetLang);
      const prompt = t(`请将以下内容翻译为${targetLabel}，只输出翻译结果，不要添加任何解释：\n\n${selectedText}`, `Translate the following to ${targetLabel}, output only the translation:\n\n${selectedText}`);
      queueMicrotask(() => doLLMRequest(prompt));
    }
  }, [activeAction, targetLang, selectedText, doLLMRequest]);

  useEffect(() => {
    if (!isStreaming && result && (activeAction === "explain" || activeAction === "translate")) {
      setLastResult(result);
    }
  }, [isStreaming, result, activeAction, setLastResult]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      invoke("cancel_requests");
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        const target = e.target as HTMLElement;
        if (target.closest(".milkdown-toolbar")) return;
        abortRef.current?.abort();
        invoke("cancel_requests");
        dismissPanel();
      }
    }

    if (activeAction) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [activeAction, dismissPanel]);

  const sendToSidebar = async (userContent: string) => {
    const userMsg = addMessage(activeFileId, { role: "user", content: userContent });

    await appendMessage(activeFileId, userMsg);

    if (!showAISidebar) {
      toggleAISidebar();
    }

    const contextMsgs = useChatStore.getState().getContext(activeFileId);
    const systemPrompt = buildSystemPrompt(docContent, getModelInfo(aiConfig.providerId, aiConfig.model).maxContext).prompt;
    const client = getLLMClient(aiConfig);

    const controller = new AbortController();
    setAbortController(controller);
    setStreaming(true);
    clearStreamingContent(activeFileId);

    try {
      const chatResult = await client.chat(
        [
          { role: "system", content: systemPrompt },
          ...contextMsgs.map((m) => {
            const msg: ChatMessage = { role: m.role as ChatMessage["role"], content: m.content };
            if (m.role === "assistant" && m.toolCalls?.length) {
              msg.tool_calls = m.toolCalls;
            }
            if (m.role === "assistant" && m.reasoningContent) {
              msg.reasoningContent = m.reasoningContent;
            }
            if (m.role === "tool") {
              msg.tool_call_id = m.toolCallId;
              msg.name = m.toolName;
            }
            return msg;
          }),
        ],
        (chunk) => {
          appendStreamingContent(activeFileId, chunk);
        },
        controller.signal
      );
      const { cost: costVal } = calculateCost(
        chatResult.usage.promptTokens,
        chatResult.usage.completionTokens,
        aiConfig.providerId,
        aiConfig.model
      );
      addUsage(activeFileId, chatResult.usage.promptTokens, chatResult.usage.completionTokens, costVal);

      const content = useChatStore.getState().streamingContentMap[activeFileId] ?? "";
      if (content) {
        const assistantMsg = addMessage(activeFileId, { role: "assistant", content });
        await appendMessage(activeFileId, assistantMsg);
      }
    } catch (e) {
      if (e instanceof TimeoutError) {
        console.error(`[SelectionAIPanel] Request timeout: ${e.message}`);
        appendStreamingContent(activeFileId, `\n\n❌ ${t("请求超时", "Request timed out")}`);
      } else if (e instanceof DOMException && e.name === "AbortError") {
        const content = useChatStore.getState().streamingContentMap[activeFileId];
        if (content) {
          const assistantMsg = addMessage(activeFileId, { role: "assistant", content });
          await appendMessage(activeFileId, assistantMsg);
        }
      } else {
        appendStreamingContent(
          activeFileId,
          `\n\n❌ ${t("请求失败", "Request failed")}: ${e instanceof Error ? e.message : String(e)}`
        );
        const content = useChatStore.getState().streamingContentMap[activeFileId] ?? "";
        if (content) {
          const assistantMsg = addMessage(activeFileId, { role: "assistant", content });
          await appendMessage(activeFileId, assistantMsg);
        }
      }
    } finally {
      setStreaming(false);
      setAbortController(null);
      clearStreamingContent(activeFileId);
    }
  };

  const handleAsk = () => {
    if (!inputValue.trim()) return;

    const question = inputValue.trim();
    setInputValue("");

    const userContent = t(
      `关于以下文本：\n${selectedText}\n\n用户问题：${question}`,
      `Regarding the following text:\n${selectedText}\n\nQuestion: ${question}`
    );

    sendToSidebar(userContent);
    dismissPanel();
  };

  const handleFollowUp = () => {
    if (!followUpValue.trim()) return;

    const question = followUpValue.trim();
    setFollowUpValue("");

    const actionLabel = activeAction === "translate"
      ? t("翻译", "Translation")
      : t("解释", "Explanation");

    const userContent = t(
      `选中文本：\n${selectedText}\n\n${actionLabel}结果：\n${lastResult}\n\n追问：${question}`,
      `Selected text:\n${selectedText}\n\n${actionLabel}:\n${lastResult}\n\nFollow-up: ${question}`
    );

    sendToSidebar(userContent);
    dismissPanel();
  };

  const handleAskKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
    if (e.key === "Escape") {
      dismissPanel();
    }
  };

  const handleFollowUpKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleFollowUp();
    }
    if (e.key === "Escape") {
      dismissPanel();
    }
  };

  if (!activeAction || !selectionCoords) return null;

  const panelStyle: React.CSSProperties = {
    position: "fixed",
    left: Math.min(selectionCoords.x, window.innerWidth - 380),
    top: Math.min(selectionCoords.y + 8, window.innerHeight - (activeAction === "polish" ? 200 : 400)),
    zIndex: 50,
  };

  return (
    <div ref={panelRef} className="moflow-selection-ai-panel" style={panelStyle} onMouseDown={(e) => e.stopPropagation()}>
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

      {activeAction === "polish" && (
        <RewritePanel key={rewriteKey} selectedText={selectedText} onDismiss={dismissPanel} />
      )}

      {(activeAction === "explain" || activeAction === "translate") && (
        <div className="moflow-selection-ai-result">
          {result ? (
            <MessageContent content={result} />
          ) : (
            <span className="moflow-selection-ai-placeholder">
              {isStreaming ? t("思考中...", "Thinking...") : ""}
            </span>
          )}
          {isStreaming && <span className="moflow-selection-ai-cursor">▌</span>}
        </div>
      )}

      {(activeAction === "explain" || activeAction === "translate") && !isStreaming && lastResult && (
        <div className="moflow-selection-ai-followup-row">
          <input
            className="moflow-selection-ai-followup-input"
            type="text"
            value={followUpValue}
            onChange={(e) => setFollowUpValue(e.target.value)}
            onKeyDown={handleFollowUpKeyDown}
            placeholder={t("继续追问...", "Follow up...")}
          />
          <button
            className="moflow-selection-ai-followup-send"
            onClick={handleFollowUp}
            disabled={!followUpValue.trim()}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
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
