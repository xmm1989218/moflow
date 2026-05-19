import { useState, useEffect } from "react";
import { useThemeStore, EDITOR_THEMES, type EditorTheme, type SupportedLanguage } from "../../stores/themeStore";
import { useUpdateStore } from "../../stores/updateStore";
import { getLLMClient } from "../../lib/llmClient";
import { getProviders, getProviderInfo, getProviderModels } from "../../lib/modelInfo";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import type { AIConfig } from "../../lib/settings";
import { t } from "../../i18n/core";
import { useT } from "../../i18n/useT";
import SkillsSection from "./SkillsSection";
import EnvVarsSection from "./EnvVarsSection";
import ShortcutsSection from "./ShortcutsSection";

type Section = "appearance" | "ai" | "shortcuts" | "skills" | "envVars" | "proxy" | "about";

const sectionIcons: Record<Section, React.JSX.Element> = {
  appearance: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  ),
  ai: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z" /><path d="M16 14H8a4 4 0 0 0-4 4v2h16v-2a4 4 0 0 0-4-4z" />
    </svg>
  ),
  skills: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
  envVars: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
    </svg>
  ),
  shortcuts: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" /><line x1="6" y1="8" x2="6.01" y2="8" /><line x1="10" y1="8" x2="10.01" y2="8" /><line x1="14" y1="8" x2="18" y2="8" /><line x1="6" y1="12" x2="18" y2="12" /><line x1="8" y1="16" x2="8.01" y2="16" /><line x1="12" y1="16" x2="16" y2="16" />
    </svg>
  ),
  proxy: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" /><rect x="2" y="14" width="20" height="8" rx="2" ry="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  ),
  about: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
};

const LANGUAGES: { id: SupportedLanguage; label: string }[] = [
  { id: "system", label: "" },
  { id: "zh", label: "简体中文" },
  { id: "en", label: "English" },
  { id: "ja", label: "日本語" },
  { id: "ko", label: "한국어" },
];

function AppearanceSection() {
  useT();
  const appTheme = useThemeStore((s) => s.appTheme);
  const editorTheme = useThemeStore((s) => s.editorTheme);
  const autoSave = useThemeStore((s) => s.autoSave);
  const showStatusBar = useThemeStore((s) => s.showStatusBar);
  const language = useThemeStore((s) => s.language);
  const setAppTheme = useThemeStore((s) => s.setAppTheme);
  const setEditorTheme = useThemeStore((s) => s.setEditorTheme);
  const toggleAutoSave = useThemeStore((s) => s.toggleAutoSave);
  const toggleStatusBar = useThemeStore((s) => s.toggleStatusBar);
  const setLanguage = useThemeStore((s) => s.setLanguage);

  return (
    <div className="max-w-[720px] w-full">
      <h3 className="text-sm font-semibold text-ui-text m-0 pb-2 border-b border-ui-border mb-5">{t("settings.section.appearance")}</h3>

      <div className="flex flex-col mb-5">
        <label className="block text-[13px] font-medium text-ui-text-secondary mb-1.5">{t("settings.appearance.appTheme")}</label>
        <div className="flex border border-ui-border rounded overflow-hidden max-w-[460px]">
          <button
            className={`flex-1 py-1.5 px-3 text-[13px] font-inherit border-none bg-ui-bg text-ui-text-secondary cursor-pointer transition-all duration-150 not-last:border-r not-last:border-ui-border${appTheme === "system" ? " bg-ui-bg-secondary text-ui-text font-semibold" : " hover:bg-ui-bg-secondary"}`}
            onClick={() => setAppTheme("system")}
          >
            {t("settings.appearance.system")}
          </button>
          <button
            className={`flex-1 py-1.5 px-3 text-[13px] font-inherit border-none bg-ui-bg text-ui-text-secondary cursor-pointer transition-all duration-150 not-last:border-r not-last:border-ui-border${appTheme === "light" ? " bg-ui-bg-secondary text-ui-text font-semibold" : " hover:bg-ui-bg-secondary"}`}
            onClick={() => setAppTheme("light")}
          >
            {t("settings.appearance.light")}
          </button>
          <button
            className={`flex-1 py-1.5 px-3 text-[13px] font-inherit border-none bg-ui-bg text-ui-text-secondary cursor-pointer transition-all duration-150${appTheme === "dark" ? " bg-ui-bg-secondary text-ui-text font-semibold" : " hover:bg-ui-bg-secondary"}`}
            onClick={() => setAppTheme("dark")}
          >
            {t("settings.appearance.dark")}
          </button>
        </div>
      </div>

      <div className="flex flex-col mb-5">
        <label htmlFor="settings-language" className="block text-[13px] font-medium text-ui-text-secondary mb-1.5">{t("settings.appearance.language")}</label>
        <select
          id="settings-language"
          className="max-w-[460px] py-1.5 px-2.5 border border-ui-border rounded text-[13px] font-inherit bg-ui-input-bg text-ui-text outline-none cursor-pointer focus:border-ui-accent"
          value={language}
          onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
        >
          {LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>{l.id === "system" ? t("settings.appearance.languageSystem") : l.label}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col mb-5">
        <label htmlFor="settings-editor-theme" className="block text-[13px] font-medium text-ui-text-secondary mb-1.5">{t("settings.appearance.editorTheme")}</label>
        <select
          id="settings-editor-theme"
          className="max-w-[460px] py-1.5 px-2.5 border border-ui-border rounded text-[13px] font-inherit bg-ui-input-bg text-ui-text outline-none cursor-pointer focus:border-ui-accent"
          value={editorTheme}
          onChange={(e) => setEditorTheme(e.target.value as EditorTheme)}
        >
          {EDITOR_THEMES.map((th) => (
            <option key={th.id} value={th.id}>{th.label}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-row items-center justify-between mb-5">
        <label htmlFor="settings-auto-save" className="block text-[13px] font-medium text-ui-text-secondary mb-0">{t("settings.appearance.autoSave")}</label>
        <button
          id="settings-auto-save"
          aria-pressed={autoSave}
          className={`w-9 h-5 rounded-full cursor-pointer relative transition-[background-color,border-color] duration-200 shrink-0 ${autoSave ? "bg-ui-accent border-ui-accent" : "bg-ui-input-bg border-ui-border"}`}
          onClick={toggleAutoSave}
        >
          <span className={`absolute top-[3px] left-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform duration-200${autoSave ? " translate-x-4" : ""}`} />
        </button>
      </div>

      <div className="flex flex-row items-center justify-between mb-5">
        <label htmlFor="settings-show-status-bar" className="block text-[13px] font-medium text-ui-text-secondary mb-0">{t("settings.appearance.showStatusBar")}</label>
        <button
          id="settings-show-status-bar"
          aria-pressed={showStatusBar}
          className={`w-9 h-5 rounded-full cursor-pointer relative transition-[background-color,border-color] duration-200 shrink-0 ${showStatusBar ? "bg-ui-accent border-ui-accent" : "bg-ui-input-bg border-ui-border"}`}
          onClick={toggleStatusBar}
        >
          <span className={`absolute top-[3px] left-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform duration-200${showStatusBar ? " translate-x-4" : ""}`} />
        </button>
      </div>
    </div>
  );
}

function AISection() {
  useT();
  const aiConfig = useThemeStore((s) => s.aiConfig);
  const setAIConfig = useThemeStore((s) => s.setAIConfig);
  const maxToolRounds = useThemeStore((s) => s.maxToolRounds);
  const setMaxToolRounds = useThemeStore((s) => s.setMaxToolRounds);
  const enableTrace = useThemeStore((s) => s.enableTrace);
  const toggleEnableTrace = useThemeStore((s) => s.toggleEnableTrace);
  const [draft, setDraft] = useState<AIConfig>({ ...aiConfig });
  const [draftMaxToolRounds, setDraftMaxToolRounds] = useState(maxToolRounds);
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const currentProvider = getProviderInfo(draft.providerId);
  const currentModels = getProviderModels(draft.providerId);
  const isKnownModel = currentModels.some((m) => m.id === aiConfig.model);
  const [modelInputMode, setModelInputMode] = useState<"select" | "input">(
    isKnownModel || !aiConfig.model ? "select" : "input"
  );
  const providerList = getProviders();

  const handleModeChange = (mode: "mock" | "real") => {
    setDraft((d) => ({ ...d, mode }));
  };

  const handleProviderChange = (providerId: string) => {
    const info = getProviderInfo(providerId);
    const models = getProviderModels(providerId);
    const compatibility = info?.compatibility ?? "openai";
    const provider: "openai-compatible" | "claude-compatible" =
      compatibility === "claude" ? "claude-compatible" : "openai-compatible";
    setDraft((d) => ({
      ...d,
      providerId,
      provider,
      apiEndpoint: info?.defaultEndpoint ?? d.apiEndpoint,
      model: models.length > 0 ? models[0].id : "",
    }));
    setModelInputMode(models.length > 0 ? "select" : "input");
  };

  const handleModelSelect = (modelId: string) => {
    if (modelId === "__custom__") {
      setModelInputMode("input");
      setDraft((d) => ({ ...d, model: "" }));
      return;
    }
    setDraft((d) => ({ ...d, model: modelId }));
  };

  const handleFieldChange = (field: keyof AIConfig, value: string) => {
    setDraft((d) => ({ ...d, [field]: value }));
  };

  const handleTest = async () => {
    if (draft.mode === "mock") return;
    if (!draft.apiEndpoint || !draft.apiToken || !draft.model) return;
    setTesting(true);
    setTestResult(null);
    try {
      const client = getLLMClient(draft);
      let gotContent = false;
      await client.chat(
        [{ role: "user", content: "Hi" }],
        (chunk) => { if (chunk) gotContent = true; },
        new AbortController().signal,
        { timeout: 10000 }
      );
      if (!gotContent) console.error("[SettingsPanel] Connection test: no content received");
      setTestResult(gotContent ? "success" : "error");
    } catch (e) {
      console.error("[SettingsPanel] Connection test failed:", e);
      setTestResult("error");
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    const clamped = Math.max(1, Math.min(50, draftMaxToolRounds));
    setDraftMaxToolRounds(clamped);
    setSaving(true);
    try {
      setAIConfig(draft);
      setMaxToolRounds(clamped);
      setToast(t("settings.ai.saved"));
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  const canSave = draft.mode === "mock" || (draft.apiEndpoint && draft.apiToken && draft.model);

  return (
    <div className="max-w-[720px] w-full">
      <h3 className="text-sm font-semibold text-ui-text m-0 pb-2 border-b border-ui-border mb-5">{t("settings.section.ai")}</h3>

      <div className="flex flex-col mb-5">
        <label className="block text-[13px] font-medium text-ui-text-secondary mb-1.5">{t("settings.ai.mode")}</label>
        <div className="flex border border-ui-border rounded overflow-hidden max-w-[460px]">
          <button
            className={`flex-1 py-1.5 px-3 text-[13px] font-inherit border-none bg-ui-bg text-ui-text-secondary cursor-pointer transition-all duration-150 not-last:border-r not-last:border-ui-border${draft.mode === "mock" ? " bg-ui-bg-secondary text-ui-text font-semibold" : " hover:bg-ui-bg-secondary"}`}
            onClick={() => handleModeChange("mock")}
          >
            {t("settings.ai.mock")}
          </button>
          <button
            className={`flex-1 py-1.5 px-3 text-[13px] font-inherit border-none bg-ui-bg text-ui-text-secondary cursor-pointer transition-all duration-150${draft.mode === "real" ? " bg-ui-bg-secondary text-ui-text font-semibold" : " hover:bg-ui-bg-secondary"}`}
            onClick={() => handleModeChange("real")}
          >
            {t("settings.ai.realApi")}
          </button>
        </div>
      </div>

      {draft.mode === "real" && (
        <>
          <div className="flex flex-col mb-5">
            <label htmlFor="settings-ai-provider" className="block text-[13px] font-medium text-ui-text-secondary mb-1.5">{t("settings.ai.provider")}</label>
            <select
              id="settings-ai-provider"
              className="max-w-[460px] py-1.5 px-2.5 border border-ui-border rounded text-[13px] font-inherit bg-ui-input-bg text-ui-text outline-none cursor-pointer focus:border-ui-accent"
              value={draft.providerId}
              onChange={(e) => handleProviderChange(e.target.value)}
            >
              {providerList.map((p) => (
                <option key={p.id} value={p.id}>
                  {t("provider." + p.id)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col mb-5">
            <label htmlFor="settings-ai-endpoint" className="block text-[13px] font-medium text-ui-text-secondary mb-1.5">{t("settings.ai.apiEndpoint")}</label>
            <input
              id="settings-ai-endpoint"
              className="max-w-[460px] py-1.5 px-2.5 border border-ui-border rounded text-[13px] font-inherit bg-ui-input-bg text-ui-text outline-none focus:border-ui-accent placeholder:text-ui-text-secondary"
              type="text"
              value={draft.apiEndpoint}
              onChange={(e) => handleFieldChange("apiEndpoint", e.target.value)}
              placeholder={currentProvider?.defaultEndpoint ?? "https://api.openai.com/v1"}
            />
          </div>

          <div className="flex flex-col mb-5">
            <label htmlFor="settings-ai-token" className="block text-[13px] font-medium text-ui-text-secondary mb-1.5">{t("settings.ai.apiToken")}</label>
            <div className="flex gap-1.5 max-w-[460px]">
              <input
                id="settings-ai-token"
                className="max-w-[460px] py-1.5 px-2.5 border border-ui-border rounded text-[13px] font-inherit bg-ui-input-bg text-ui-text outline-none focus:border-ui-accent placeholder:text-ui-text-secondary flex-1"
                type={showToken ? "text" : "password"}
                value={draft.apiToken}
                onChange={(e) => handleFieldChange("apiToken", e.target.value)}
                placeholder="sk-..."
              />
              <button
                className="flex items-center justify-center w-[30px] h-[30px] rounded border border-ui-border bg-ui-bg text-ui-text-secondary cursor-pointer shrink-0 hover:bg-ui-bg-secondary hover:text-ui-text"
                onClick={() => setShowToken(!showToken)}
                type="button"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {showToken ? (
                    <>
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </>
                  ) : (
                    <>
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </>
                  )}
                </svg>
              </button>
            </div>
          </div>

          <div className="flex flex-col mb-5">
            <label htmlFor="settings-ai-model" className="block text-[13px] font-medium text-ui-text-secondary mb-1.5">{t("settings.ai.model")}</label>
            {modelInputMode === "select" && currentModels.length > 0 ? (
              <div className="flex gap-1.5 max-w-[460px]">
                <select
                  id="settings-ai-model"
                  className="max-w-[460px] py-1.5 px-2.5 border border-ui-border rounded text-[13px] font-inherit bg-ui-input-bg text-ui-text outline-none cursor-pointer focus:border-ui-accent flex-1"
                  value={currentModels.some((m) => m.id === draft.model) ? draft.model : ""}
                  onChange={(e) => handleModelSelect(e.target.value)}
                >
                  <option value="" disabled>{t("settings.ai.selectModel")}</option>
                  {currentModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.id}</option>
                  ))}
                  <option value="__custom__">{t("settings.ai.customInput")}</option>
                </select>
              </div>
            ) : (
              <div className="flex gap-1.5 max-w-[460px]">
                <input
                  id="settings-ai-model"
                  className="max-w-[460px] py-1.5 px-2.5 border border-ui-border rounded text-[13px] font-inherit bg-ui-input-bg text-ui-text outline-none focus:border-ui-accent placeholder:text-ui-text-secondary flex-1"
                  type="text"
                  value={draft.model}
                  onChange={(e) => handleFieldChange("model", e.target.value)}
                  placeholder="model-name"
                />
                {currentModels.length > 0 && (
                  <button
                    className="flex items-center justify-center w-[30px] h-[30px] rounded border border-ui-border bg-ui-bg text-ui-text-secondary cursor-pointer shrink-0 hover:bg-ui-bg-secondary hover:text-ui-text"
                    onClick={() => setModelInputMode("select")}
                    type="button"
                    title={t("settings.ai.backToSelect")}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 12H5" />
                      <path d="M12 19l-7-7 7-7" />
                    </svg>
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2.5 mt-1">
            <button
              className="py-1.5 px-3.5 rounded border border-ui-border bg-ui-bg text-ui-text text-[13px] font-inherit cursor-pointer transition-all duration-150 hover:not-disabled:bg-ui-bg-secondary hover:not-disabled:border-ui-accent disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={handleTest}
              disabled={testing || !draft.apiEndpoint || !draft.apiToken || !draft.model}
            >
              {testing ? t("settings.ai.testing") : t("settings.ai.testConnection")}
            </button>
            {testResult === "success" && (
              <span className="text-[13px] text-[#22c55e]">{t("settings.ai.connected")}</span>
            )}
            {testResult === "error" && (
              <span className="text-[13px] text-[#ef4444]">{t("settings.ai.connectionFailed")}</span>
            )}
          </div>
        </>
      )}

      <div className="mt-5">
        <label htmlFor="settings-ai-max-tool-rounds" className="block text-[13px] font-medium text-ui-text-secondary mb-1.5">{t("settings.ai.maxToolRounds")}</label>
        <input
          id="settings-ai-max-tool-rounds"
          type="text"
          inputMode="numeric"
          className="max-w-[120px] px-2.5 py-1.5 rounded border border-ui-border bg-ui-input-bg text-ui-text text-[13px] font-inherit outline-none transition-colors duration-150 focus:border-ui-accent"
          value={draftMaxToolRounds}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v) && v >= 1 && v <= 50) setDraftMaxToolRounds(v);
            else if (e.target.value === "") setDraftMaxToolRounds(1);
          }}
        />
      </div>

      <div className="flex flex-row items-center justify-between mt-5 mb-5">
        <label htmlFor="settings-ai-enable-trace" className="block text-[13px] font-medium text-ui-text-secondary mb-0">{t("settings.ai.enableTrace")}</label>
        <button
          id="settings-ai-enable-trace"
          aria-pressed={enableTrace}
          className={`w-9 h-5 rounded-full cursor-pointer relative transition-[background-color,border-color] duration-200 shrink-0 ${enableTrace ? "bg-ui-accent border-ui-accent" : "bg-ui-input-bg border-ui-border"}`}
          onClick={toggleEnableTrace}
        >
          <span className={`absolute top-[3px] left-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform duration-200${enableTrace ? " translate-x-4" : ""}`} />
        </button>
      </div>

      <div className="flex items-center gap-3 mt-6">
        <button
          className="py-1.5 px-5 rounded border-none bg-ui-accent text-white text-[13px] font-inherit cursor-pointer transition-[background-color] duration-150 hover:bg-ui-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={handleSave}
          disabled={saving || !canSave}
        >
          {saving ? t("settings.ai.saving") : t("settings.ai.save")}
        </button>
      </div>

      {toast && <div className="mt-3 py-2 px-3 rounded bg-ui-bg-secondary border border-ui-border text-ui-text text-[13px] animate-menu-fadein">{toast}</div>}
    </div>
  );
}

type ProxyType = "none" | "http" | "https" | "socks5";

function parseProxyType(url: string): ProxyType {
  if (!url) return "none";
  if (url.startsWith("socks5://")) return "socks5";
  if (url.startsWith("https://")) return "https";
  if (url.startsWith("http://")) return "http";
  return "http";
}

function stripProxyPrefix(url: string): string {
  return url.replace(/^(https?|socks5):\/\//, "");
}

function ProxySection() {
  useT();
  const currentProxyUrl = useThemeStore((s) => s.proxyUrl);
  const [draftType, setDraftType] = useState<ProxyType>(parseProxyType(currentProxyUrl));
  const [draftHost, setDraftHost] = useState(stripProxyPrefix(currentProxyUrl));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);

    if (draftType === "none") {
      setSaving(true);
      try {
        useThemeStore.getState().setProxyUrl("");
        await invoke("set_proxy", { proxyUrl: null });
        if (currentProxyUrl) {
          setToast(t("settings.proxy.disabledRestart"));
          setTimeout(() => setToast(null), 5000);
        }
      } catch (e) {
        setError(String(e));
      } finally {
        setSaving(false);
      }
      return;
    }

    const host = draftHost.trim();
    if (!host) {
      setError(t("settings.proxy.enterAddress"));
      return;
    }

    const fullUrl = `${draftType}://${host}`;

    setSaving(true);
    try {
      useThemeStore.getState().setProxyUrl(fullUrl);
      await invoke("set_proxy", { proxyUrl: fullUrl });

      const wasUrl = currentProxyUrl;

      if (!wasUrl || wasUrl !== fullUrl) {
        setToast(t("settings.proxy.savedRestart"));
      }
      setTimeout(() => setToast(null), 5000);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-[720px] w-full">
      <h3 className="text-sm font-semibold text-ui-text m-0 pb-2 border-b border-ui-border mb-5">{t("settings.section.proxy")}</h3>

      <div className="flex flex-col mb-5">
        <label htmlFor="settings-proxy-host" className="block text-[13px] font-medium text-ui-text-secondary mb-1.5">{t("settings.proxy.address")}</label>
        <div className="flex gap-1.5 items-center max-w-[460px]">
          <select
            className="py-1.5 px-2 border border-ui-border rounded text-[13px] font-inherit bg-ui-input-bg text-ui-text outline-none cursor-pointer shrink-0 min-w-[80px] focus:border-ui-accent"
            value={draftType}
            onChange={(e) => setDraftType(e.target.value as ProxyType)}
          >
            <option value="none">{t("settings.proxy.type.none")}</option>
            <option value="http">{t("settings.proxy.type.http")}</option>
            <option value="https">{t("settings.proxy.type.https")}</option>
            <option value="socks5">{t("settings.proxy.type.socks5")}</option>
          </select>
          <input
            id="settings-proxy-host"
            className="max-w-[460px] py-1.5 px-2.5 border border-ui-border rounded text-[13px] font-inherit bg-ui-input-bg text-ui-text outline-none focus:border-ui-accent placeholder:text-ui-text-secondary flex-1 max-w-none disabled:opacity-40 disabled:cursor-not-allowed"
            type="text"
            value={draftHost}
            onChange={(e) => setDraftHost(e.target.value)}
            placeholder="127.0.0.1:7890"
            disabled={draftType === "none"}
          />
          <button
            className="py-1.5 px-5 rounded border-none bg-ui-accent text-white text-[13px] font-inherit cursor-pointer transition-[background-color] duration-150 shrink-0 mt-0 hover:bg-ui-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? t("settings.proxy.saving") : t("settings.proxy.save")}
          </button>
        </div>
      </div>

      {error && <div className="text-[13px] text-[#ef4444] mb-3">{error}</div>}
      {toast && <div className="mt-3 py-2 px-3 rounded bg-ui-bg-secondary border border-ui-border text-ui-text text-[13px] animate-menu-fadein">{toast}</div>}
    </div>
  );
}

function AboutSection() {
  useT();
  const [version, setVersion] = useState("");
  const checkUpdate = useUpdateStore((s) => s.checkUpdate);

  useEffect(() => {
    getVersion().then(setVersion);
  }, []);

  return (
    <div className="max-w-[720px] w-full">
      <h3 className="text-sm font-semibold text-ui-text m-0 pb-2 border-b border-ui-border mb-5">{t("settings.section.about")}</h3>

      <div className="flex flex-col items-center gap-1 pt-8">
        <img className="w-20 h-20 rounded-2xl mb-3" src="/icon.png" alt="MoFlow" />
        <div className="text-lg font-semibold text-ui-text">MoFlow</div>
        <div className="text-[13px] text-ui-text-secondary">v{version}</div>
        <div className="text-xs text-ui-text-secondary mb-4">&copy; 2026 MoFlow</div>
        <button
          className="py-1.5 px-5 rounded border border-ui-border bg-ui-bg text-ui-text text-[13px] font-inherit cursor-pointer transition-all duration-150 hover:bg-ui-bg-secondary hover:border-ui-accent"
          onClick={() => checkUpdate(true)}
        >
          {t("settings.about.checkUpdates")}
        </button>
      </div>
    </div>
  );
}

export default function SettingsPanel() {
  useT();
  const [activeSection, setActiveSection] = useState<Section>("appearance");
  const sections: { id: Section; label: string }[] = [
    { id: "appearance", label: t("settings.section.appearance") },
    { id: "ai", label: t("settings.section.ai") },
    { id: "shortcuts", label: t("settings.section.shortcuts") },
    { id: "skills", label: t("settings.section.skills") },
    { id: "envVars", label: t("settings.section.envVars") },
    { id: "proxy", label: t("settings.section.proxy") },
    { id: "about", label: t("settings.section.about") },
  ];

  return (
    <div className="flex h-full bg-ui-bg flex-1 min-w-0">
      <nav aria-label={t("common.settings")} className="w-40 shrink-0 p-3 px-1.5 border-r border-ui-border flex flex-col gap-px">
        {sections.map((s) => (
          <button
            key={s.id}
            className={`flex items-center gap-2 w-full py-2 px-3 border-none bg-none text-ui-text-secondary text-sm font-inherit cursor-pointer rounded text-left transition-[background-color,color] duration-100 hover:bg-ui-bg-secondary hover:text-ui-text${activeSection === s.id ? " bg-ui-bg-secondary text-ui-text font-semibold" : ""}`}
            onClick={() => setActiveSection(s.id)}
          >
            <span className="w-4 h-4 shrink-0 flex items-center justify-center [&>svg]:w-4 [&>svg]:h-4">{sectionIcons[s.id]}</span>
            <span className="flex-1">{s.label}</span>
          </button>
        ))}
      </nav>
      <div className="flex-1 overflow-y-auto p-6 px-12 flex justify-center">
        {activeSection === "appearance" && <AppearanceSection />}
        {activeSection === "ai" && <AISection />}
        {activeSection === "shortcuts" && <ShortcutsSection />}
        {activeSection === "skills" && <SkillsSection />}
        {activeSection === "envVars" && <EnvVarsSection />}
        {activeSection === "proxy" && <ProxySection />}
        {activeSection === "about" && <AboutSection />}
      </div>
    </div>
  );
}
