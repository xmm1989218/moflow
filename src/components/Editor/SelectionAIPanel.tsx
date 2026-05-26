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
import { t } from "../../i18n/core";
import { useT } from "../../i18n/useT";
import { SendHorizonal, ChevronDown, ArrowLeftRight } from "lucide-react";
import MessageContent from "../AISidebar/MessageContent";

function getLangLabel(code: LanguageCode): string {
  const lang = LANGUAGES.find((l) => l.code === code);
  return lang ? t(lang.labelKey) : code;
}

const REWRITE_PRESETS = [
  { key: "polish", i18nKey: "ai.rewrite.preset.polish" },
  { key: "expand", i18nKey: "ai.rewrite.preset.expand" },
  { key: "shorten", i18nKey: "ai.rewrite.preset.shorten" },
] as const;

const TONE_OPTIONS = [
  { key: "professional", i18nKey: "ai.rewrite.tone.professional" },
  { key: "academic", i18nKey: "ai.rewrite.tone.academic" },
  { key: "formal", i18nKey: "ai.rewrite.tone.formal" },
  { key: "casual", i18nKey: "ai.rewrite.tone.casual" },
  { key: "literary", i18nKey: "ai.rewrite.tone.literary" },
  { key: "internet", i18nKey: "ai.rewrite.tone.internet" },
] as const;

const MD_NOTE = "\n\nNote: math must use LaTeX ($...$, $$...$$); code must be in code blocks.";

function getRewritePrompt(key: string, selectedText: string): string {
  return t(`ai.rewrite.prompt.${key}`, { mdHint: MD_NOTE, selectedText });
}

function getCustomRewritePrompt(instruction: string, selectedText: string): string {
  return t("ai.rewrite.prompt.custom", { instruction, mdHint: MD_NOTE, selectedText });
}

function RewritePanel({ selectedText, onDismiss }: { selectedText: string; onDismiss: () => void }) {
  useT();
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
          aiConfig.model,
          res.usage.cachedTokens,
          res.usage.cacheCreationTokens
        );
        recordStandaloneUsage(activeFileId, res.usage.promptTokens, res.usage.completionTokens, costVal);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          return;
        }
        const msg = e instanceof TimeoutError
          ? t("ai.error.timeout")
          : `${t("ai.error.requestFailed")}: ${e instanceof Error ? e.message : String(e)}`;
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
        <div className="flex items-center gap-2 px-3 py-4 text-moflow-text-secondary text-[13px] justify-center">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-moflow-accent animate-rewrite-pulse" />
          {t("ai.rewrite.rewriting")}
        </div>
      ) : rewriteError ? (
        <div className="px-3 py-2.5 text-red-500 text-xs leading-normal">
          ? {rewriteError}
        </div>
      ) : null}
      {!isStreaming && !rewriteError && (
        <>
          <div className="px-2.5 py-2">
            <div className="relative flex items-end">
              <textarea
                className="flex-1 py-1.5 pr-9 pl-2.5 border border-moflow-border rounded-md text-[13px] font-[inherit] bg-moflow-bg text-moflow-text outline-none resize-none leading-normal min-h-12 max-h-[120px] overflow-y-hidden focus:border-moflow-accent placeholder:text-moflow-text-secondary"
                value={rewriteInput}
                onChange={handleRewriteInputChange}
                onKeyDown={handleRewriteInputKeyDown}
                placeholder={t("ai.rewrite.placeholder")}
                autoFocus
                rows={1}
              />
              <button
                className="absolute right-1 bottom-1 flex items-center justify-center w-6 h-6 rounded border-none bg-moflow-accent text-white cursor-pointer transition-colors duration-150 hover:not-disabled:opacity-85 disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={handleRewriteSend}
                disabled={!rewriteInput.trim()}
              >
                <SendHorizonal size={14} />
              </button>
            </div>
          </div>
          {!rewriteInput.trim() && (
          <div className="flex flex-wrap gap-1 px-2.5 pb-2 pt-1">
            {REWRITE_PRESETS.map((p) => (
              <button
                key={p.key}
                className="px-2.5 py-1 rounded-xl border border-moflow-border bg-moflow-bg-secondary text-moflow-text-secondary text-xs font-[inherit] cursor-pointer transition-all duration-150 whitespace-nowrap hover:border-moflow-accent hover:text-moflow-accent hover:bg-moflow-bg"
                onClick={() => handlePresetClick(p.key)}
              >
                {t(p.i18nKey)}
              </button>
            ))}
            <div className="relative" ref={toneMenuRef}>
              <button
                className="inline-flex items-center gap-0.5 px-2.5 py-1 rounded-xl border border-moflow-border bg-moflow-bg-secondary text-moflow-text-secondary text-xs font-[inherit] cursor-pointer transition-all duration-150 whitespace-nowrap hover:border-moflow-accent hover:text-moflow-accent hover:bg-moflow-bg"
                onClick={() => setShowToneMenu(!showToneMenu)}
              >
                {t("ai.rewrite.changeTone")}
                <ChevronDown size={10} />
              </button>
              {showToneMenu && (
                <div className="absolute top-full left-0 mt-1 min-w-[120px] bg-moflow-bg border border-moflow-border rounded-lg p-1 z-60 animate-selection-ai-appear" style={{ boxShadow: "0 4px 16px rgba(0,0,0,0.12)" }}>
                  {TONE_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      className="block w-full py-1.5 px-3 border-none rounded-[5px] bg-transparent text-moflow-text text-xs font-[inherit] text-left cursor-pointer transition-colors duration-100 hover:bg-moflow-bg-secondary hover:text-moflow-accent"
                      onClick={() => handleToneClick(opt.key)}
                    >
                      {t(opt.i18nKey)}
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
        <div className="flex flex-wrap gap-1 px-2.5 pb-2 pt-1">
          {REWRITE_PRESETS.map((p) => (
            <button
              key={p.key}
              className="px-2.5 py-1 rounded-xl border border-moflow-border bg-moflow-bg-secondary text-moflow-text-secondary text-xs font-[inherit] cursor-pointer transition-all duration-150 whitespace-nowrap hover:border-moflow-accent hover:text-moflow-accent hover:bg-moflow-bg"
              onClick={() => handlePresetClick(p.key)}
            >
              {t(p.i18nKey)}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export default function SelectionAIPanel() {
  useT();
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
        const systemPrompt = activeAction === "translate"
          ? ""
          : buildSystemPrompt(docContent, getModelInfo(aiConfig.providerId, aiConfig.model).maxContext).prompt;

        const messages: ChatMessage[] = [];
        if (systemPrompt) {
          messages.push({ role: "system", content: systemPrompt });
        }
        messages.push({ role: "user", content: prompt });

        const res = await client.chat(
          messages,
          (chunk) => {
            setResult((prev) => prev + chunk);
          },
          controller.signal
        );

        const { cost: costVal } = calculateCost(
          res.usage.promptTokens,
          res.usage.completionTokens,
          aiConfig.providerId,
          aiConfig.model,
          res.usage.cachedTokens,
          res.usage.cacheCreationTokens
        );
        recordStandaloneUsage(activeFileId, res.usage.promptTokens, res.usage.completionTokens, costVal);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          return;
        }
        if (e instanceof TimeoutError) {
          console.error(`[SelectionAIPanel] Request timeout: ${e.message}`);
          setResult((prev) => prev + `\n\n|?${t("ai.error.timeout")}`);
        } else {
          setResult((prev) => prev + `\n\n|?${t("ai.error.requestFailed")}: ${e instanceof Error ? e.message : String(e)}`);
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [aiConfig, docContent, activeFileId, activeAction, recordStandaloneUsage]
  );

  useEffect(() => {
    if (activeAction === "polish") return;
    if (activeAction === "explain" && selectedText) {
      const prompt = t("ai.selection.prompt.explain", { mdSyntax: MD_NOTE.trim(), selectedText });
      queueMicrotask(() => doLLMRequest(prompt));
    } else if (activeAction === "translate" && selectedText) {
      const targetLabel = getLangLabel(targetLang);
      const prompt = t("ai.selection.prompt.translate", { targetLabel, selectedText });
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
        aiConfig.model,
        chatResult.usage.cachedTokens,
        chatResult.usage.cacheCreationTokens
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
        appendStreamingContent(activeFileId, `\n\n|?${t("ai.error.timeout")}`);
      } else if (e instanceof DOMException && e.name === "AbortError") {
        const content = useChatStore.getState().streamingContentMap[activeFileId];
        if (content) {
          const assistantMsg = addMessage(activeFileId, { role: "assistant", content });
          await appendMessage(activeFileId, assistantMsg);
        }
      } else {
        appendStreamingContent(
          activeFileId,
          `\n\n|?${t("ai.error.requestFailed")}: ${e instanceof Error ? e.message : String(e)}`
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

    const userContent = t("ai.selection.prompt.ask", { selectedText, question });

    sendToSidebar(userContent);
    dismissPanel();
  };

  const handleFollowUp = () => {
    if (!followUpValue.trim()) return;

    const question = followUpValue.trim();
    setFollowUpValue("");

    const actionLabel = activeAction === "translate"
      ? t("ai.selection.translation")
      : t("ai.selection.explanation");

    const userContent = t("ai.selection.prompt.followUp", { selectedText, actionLabel, lastResult, question });

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
    boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
  };

  return (
    <div ref={panelRef} className="w-[360px] bg-moflow-bg border border-moflow-border rounded-[10px] flex flex-col overflow-visible animate-selection-ai-appear" style={panelStyle} onMouseDown={(e) => e.stopPropagation()}>
      {activeAction === "translate" && (
        <>
          <div className="flex items-center gap-1 px-2.5 py-2 border-b border-moflow-border bg-moflow-bg-secondary">
            <select
              className="flex-1 py-1 px-2 border border-moflow-border rounded-md text-xs font-[inherit] bg-moflow-bg text-moflow-text outline-none cursor-pointer min-w-0 focus:border-moflow-accent"
              value={sourceLang}
              onChange={(e) => setSourceLang(e.target.value as LanguageCode)}
            >
              {LANGUAGES.filter((l) => l.code === "auto" || l.code !== targetLang).map((l) => (
                <option key={l.code} value={l.code}>
                  {t(l.labelKey)}
                </option>
              ))}
            </select>
            <button className="flex items-center justify-center w-6 h-6 rounded border-none bg-transparent text-moflow-text-secondary cursor-pointer shrink-0 hover:bg-moflow-bg hover:text-moflow-text" onClick={swapLanguages}>
              <ArrowLeftRight size={14} />
            </button>
            <select
              className="flex-1 py-1 px-2 border border-moflow-accent rounded-md text-xs font-[inherit] bg-moflow-bg text-moflow-text outline-none cursor-pointer min-w-0 focus:border-moflow-accent"
              value={targetLang}
              onChange={(e) => {
                setTargetLang(e.target.value as LanguageCode);
                abortRef.current?.abort();
              }}
            >
              {LANGUAGES.filter((l) => l.code !== "auto" && l.code !== sourceLang).map((l) => (
                <option key={l.code} value={l.code}>
                  {t(l.labelKey)}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {activeAction === "polish" && (
        <RewritePanel key={rewriteKey} selectedText={selectedText} onDismiss={dismissPanel} />
      )}

      {(activeAction === "explain" || activeAction === "translate") && (
        <div className="px-3 py-2.5 text-[13px] text-moflow-text leading-relaxed break-words max-h-[300px] overflow-y-auto min-h-10">
          {result ? (
            <MessageContent content={result} />
          ) : (
            <span className="text-moflow-text-secondary font-normal text-xs">
              {isStreaming ? t("ai.selection.thinking") : ""}
            </span>
          )}
          {isStreaming && <span className="text-moflow-accent font-normal" style={{ animation: "moflow-selection-ai-blink 0.8s infinite" }}>▊</span>}
        </div>
      )}

      {(activeAction === "explain" || activeAction === "translate") && !isStreaming && lastResult && (
        <div className="flex items-center gap-1.5 px-2.5 py-2 border-t border-moflow-border">
          <input
            className="flex-1 py-1.5 px-2.5 border border-moflow-border rounded-md text-[13px] font-[inherit] bg-moflow-bg text-moflow-text outline-none focus:border-moflow-accent placeholder:text-moflow-text-secondary"
            type="text"
            value={followUpValue}
            onChange={(e) => setFollowUpValue(e.target.value)}
            onKeyDown={handleFollowUpKeyDown}
            placeholder={t("ai.selection.followUp")}
          />
          <button
            className="flex items-center justify-center w-7 h-7 rounded-md border-none bg-moflow-accent text-white cursor-pointer shrink-0 transition-colors duration-150 hover:not-disabled:opacity-85 disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={handleFollowUp}
            disabled={!followUpValue.trim()}
          >
            <SendHorizonal size={14} />
          </button>
        </div>
      )}

      {activeAction === "ask" && (
        <div className="flex items-center gap-1.5 px-2.5 py-2">
          <input
            className="flex-1 py-1.5 px-2.5 border border-moflow-border rounded-md text-[13px] font-[inherit] bg-moflow-bg text-moflow-text outline-none focus:border-moflow-accent placeholder:text-moflow-text-secondary"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleAskKeyDown}
            placeholder={t("ai.selection.askPlaceholder")}
            autoFocus
          />
          <button
            className="flex items-center justify-center w-7 h-7 rounded-md border-none bg-moflow-accent text-white cursor-pointer shrink-0 transition-colors duration-150 hover:not-disabled:opacity-85 disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={handleAsk}
            disabled={!inputValue.trim()}
          >
            <SendHorizonal size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
