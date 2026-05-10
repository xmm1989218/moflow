import { useState, useEffect } from "react";
import { useThemeStore, EDITOR_THEMES, type EditorTheme } from "../../stores/themeStore";
import { useUpdateStore } from "../../stores/updateStore";
import { getLLMClient } from "../../lib/llmClient";
import { getProviders, getProviderInfo, getProviderModels } from "../../lib/modelInfo";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import type { AIConfig } from "../../lib/settings";
import { t, isZh } from "../../lib/i18n";

type Section = "appearance" | "ai" | "proxy" | "about";

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

const sections: { id: Section; label: string }[] = [
  { id: "appearance", label: t("外观", "Appearance") },
  { id: "ai", label: "AI" },
  { id: "proxy", label: t("代理", "Proxy") },
  { id: "about", label: t("关于", "About") },
];

function AppearanceSection() {
  const appTheme = useThemeStore((s) => s.appTheme);
  const editorTheme = useThemeStore((s) => s.editorTheme);
  const autoSave = useThemeStore((s) => s.autoSave);
  const showStatusBar = useThemeStore((s) => s.showStatusBar);
  const setAppTheme = useThemeStore((s) => s.setAppTheme);
  const setEditorTheme = useThemeStore((s) => s.setEditorTheme);
  const toggleAutoSave = useThemeStore((s) => s.toggleAutoSave);
  const toggleStatusBar = useThemeStore((s) => s.toggleStatusBar);

  return (
    <div className="max-w-[720px] w-full">
      <h3 className="text-sm font-semibold text-ui-text m-0 pb-2 border-b border-ui-border mb-5">{t("外观", "Appearance")}</h3>

      <div className="flex flex-col mb-5">
        <label className="block text-[13px] font-medium text-ui-text-secondary mb-1.5">{t("应用主题", "App Theme")}</label>
        <div className="flex border border-ui-border rounded overflow-hidden max-w-[460px]">
          <button
            className={`flex-1 py-1.5 px-3 text-[13px] font-inherit border-none bg-ui-bg text-ui-text-secondary cursor-pointer transition-all duration-150 not-last:border-r not-last:border-ui-border${appTheme === "system" ? " bg-ui-bg-secondary text-ui-text font-semibold" : " hover:bg-ui-bg-secondary"}`}
            onClick={() => setAppTheme("system")}
          >
            {t("跟随系统", "System")}
          </button>
          <button
            className={`flex-1 py-1.5 px-3 text-[13px] font-inherit border-none bg-ui-bg text-ui-text-secondary cursor-pointer transition-all duration-150 not-last:border-r not-last:border-ui-border${appTheme === "light" ? " bg-ui-bg-secondary text-ui-text font-semibold" : " hover:bg-ui-bg-secondary"}`}
            onClick={() => setAppTheme("light")}
          >
            {t("浅色", "Light")}
          </button>
          <button
            className={`flex-1 py-1.5 px-3 text-[13px] font-inherit border-none bg-ui-bg text-ui-text-secondary cursor-pointer transition-all duration-150${appTheme === "dark" ? " bg-ui-bg-secondary text-ui-text font-semibold" : " hover:bg-ui-bg-secondary"}`}
            onClick={() => setAppTheme("dark")}
          >
            {t("深色", "Dark")}
          </button>
        </div>
      </div>

      <div className="flex flex-col mb-5">
        <label className="block text-[13px] font-medium text-ui-text-secondary mb-1.5">{t("编辑器主题", "Editor Theme")}</label>
        <select
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
        <label className="block text-[13px] font-medium text-ui-text-secondary mb-0">{t("自动保存", "Auto Save")}</label>
        <button
          className={`w-9 h-5 rounded-full border border-ui-border bg-ui-input-bg cursor-pointer relative transition-[background-color,border-color] duration-200 shrink-0${autoSave ? " bg-ui-accent border-ui-accent" : ""}`}
          onClick={toggleAutoSave}
        >
          <span className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform duration-200${autoSave ? " translate-x-4" : ""}`} />
        </button>
      </div>

      <div className="flex flex-row items-center justify-between mb-5">
        <label className="block text-[13px] font-medium text-ui-text-secondary mb-0">{t("显示状态栏", "Show Status Bar")}</label>
        <button
          className={`w-9 h-5 rounded-full border border-ui-border bg-ui-input-bg cursor-pointer relative transition-[background-color,border-color] duration-200 shrink-0${showStatusBar ? " bg-ui-accent border-ui-accent" : ""}`}
          onClick={toggleStatusBar}
        >
          <span className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform duration-200${showStatusBar ? " translate-x-4" : ""}`} />
        </button>
      </div>
    </div>
  );
}

function AISection() {
  const aiConfig = useThemeStore((s) => s.aiConfig);
  const setAIConfig = useThemeStore((s) => s.setAIConfig);
  const [draft, setDraft] = useState<AIConfig>({ ...aiConfig });
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const currentProvider = getProviderInfo(draft.providerId);
  const currentModels = getProviderModels(draft.providerId);
  const isKnownModel = currentModels.some((m) => m.id === aiConfig.model);
  const [modelInputMode, setModelInputMode] = useState<"select" | "input">(
    isKnownModel || !aiConfig.model ? "select" : "input"
  );
  const providerList = getProviders();

  const handleModeChange = (mode: "mock" | "real") => {
    const newDraft = { ...draft, mode };
    setDraft(newDraft);
    setAIConfig(newDraft);
  };

  const handleProviderChange = (providerId: string) => {
    const info = getProviderInfo(providerId);
    const models = getProviderModels(providerId);
    const compatibility = info?.compatibility ?? "openai";
    const provider: "openai-compatible" | "claude-compatible" =
      compatibility === "claude" ? "claude-compatible" : "openai-compatible";
    const newDraft = {
      ...draft,
      providerId,
      provider,
      apiEndpoint: info?.defaultEndpoint ?? draft.apiEndpoint,
      model: models.length > 0 ? models[0].id : "",
    };
    setDraft(newDraft);
    setModelInputMode(models.length > 0 ? "select" : "input");
    setAIConfig(newDraft);
  };

  const handleModelSelect = (modelId: string) => {
    if (modelId === "__custom__") {
      setModelInputMode("input");
      setDraft((d) => ({ ...d, model: "" }));
      return;
    }
    const newDraft = { ...draft, model: modelId };
    setDraft(newDraft);
    setAIConfig(newDraft);
  };

  const handleFieldChange = (field: keyof AIConfig, value: string) => {
    const newDraft = { ...draft, [field]: value };
    setDraft(newDraft);
    setAIConfig(newDraft);
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

  return (
    <div className="max-w-[720px] w-full">
      <h3 className="text-sm font-semibold text-ui-text m-0 pb-2 border-b border-ui-border mb-5">AI</h3>

      <div className="flex flex-col mb-5">
        <label className="block text-[13px] font-medium text-ui-text-secondary mb-1.5">{t("模式", "Mode")}</label>
        <div className="flex border border-ui-border rounded overflow-hidden max-w-[460px]">
          <button
            className={`flex-1 py-1.5 px-3 text-[13px] font-inherit border-none bg-ui-bg text-ui-text-secondary cursor-pointer transition-all duration-150 not-last:border-r not-last:border-ui-border${draft.mode === "mock" ? " bg-ui-bg-secondary text-ui-text font-semibold" : " hover:bg-ui-bg-secondary"}`}
            onClick={() => handleModeChange("mock")}
          >
            Mock
          </button>
          <button
            className={`flex-1 py-1.5 px-3 text-[13px] font-inherit border-none bg-ui-bg text-ui-text-secondary cursor-pointer transition-all duration-150${draft.mode === "real" ? " bg-ui-bg-secondary text-ui-text font-semibold" : " hover:bg-ui-bg-secondary"}`}
            onClick={() => handleModeChange("real")}
          >
            {t("真实 API", "Real API")}
          </button>
        </div>
      </div>

      {draft.mode === "real" && (
        <>
          <div className="flex flex-col mb-5">
            <label className="block text-[13px] font-medium text-ui-text-secondary mb-1.5">{t("服务商", "Provider")}</label>
            <select
              className="max-w-[460px] py-1.5 px-2.5 border border-ui-border rounded text-[13px] font-inherit bg-ui-input-bg text-ui-text outline-none cursor-pointer focus:border-ui-accent"
              value={draft.providerId}
              onChange={(e) => handleProviderChange(e.target.value)}
            >
              {providerList.map((p) => (
                <option key={p.id} value={p.id}>
                  {isZh ? p.labelZh : p.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col mb-5">
            <label className="block text-[13px] font-medium text-ui-text-secondary mb-1.5">API Endpoint</label>
            <input
              className="max-w-[460px] py-1.5 px-2.5 border border-ui-border rounded text-[13px] font-inherit bg-ui-input-bg text-ui-text outline-none focus:border-ui-accent placeholder:text-ui-text-secondary"
              type="text"
              value={draft.apiEndpoint}
              onChange={(e) => handleFieldChange("apiEndpoint", e.target.value)}
              placeholder={currentProvider?.defaultEndpoint ?? "https://api.openai.com/v1"}
            />
          </div>

          <div className="flex flex-col mb-5">
            <label className="block text-[13px] font-medium text-ui-text-secondary mb-1.5">API Token</label>
            <div className="flex gap-1.5 max-w-[460px]">
              <input
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
            <label className="block text-[13px] font-medium text-ui-text-secondary mb-1.5">Model</label>
            {modelInputMode === "select" && currentModels.length > 0 ? (
              <div className="flex gap-1.5 max-w-[460px]">
                <select
                  className="max-w-[460px] py-1.5 px-2.5 border border-ui-border rounded text-[13px] font-inherit bg-ui-input-bg text-ui-text outline-none cursor-pointer focus:border-ui-accent flex-1"
                  value={currentModels.some((m) => m.id === draft.model) ? draft.model : ""}
                  onChange={(e) => handleModelSelect(e.target.value)}
                >
                  <option value="" disabled>{t("选择模型", "Select model")}</option>
                  {currentModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.id}</option>
                  ))}
                  <option value="__custom__">{t("手动输入...", "Custom input...")}</option>
                </select>
              </div>
            ) : (
              <div className="flex gap-1.5 max-w-[460px]">
                <input
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
                    title={t("返回选择", "Back to select")}
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
              {testing ? t("测试中...", "Testing...") : t("测试连接", "Test Connection")}
            </button>
            {testResult === "success" && (
              <span className="text-[13px] text-[#22c55e]">{t("连接成功", "Connected")}</span>
            )}
            {testResult === "error" && (
              <span className="text-[13px] text-[#ef4444]">{t("连接失败", "Connection Failed")}</span>
            )}
          </div>
        </>
      )}
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
          setToast(t("代理已关闭，重启后完全生效", "Proxy disabled. Restart the app for full effect."));
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
      setError(t("请输入代理地址", "Please enter a proxy address"));
      return;
    }

    const fullUrl = `${draftType}://${host}`;

    setSaving(true);
    try {
      useThemeStore.getState().setProxyUrl(fullUrl);
      await invoke("set_proxy", { proxyUrl: fullUrl });

      const wasUrl = currentProxyUrl;

      if (!wasUrl || wasUrl !== fullUrl) {
        setToast(t("代理设置已保存，LLM 请求需重启应用后生效", "Proxy saved. Restart the app for LLM requests to use the new proxy."));
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
      <h3 className="text-sm font-semibold text-ui-text m-0 pb-2 border-b border-ui-border mb-5">{t("代理", "Proxy")}</h3>

      <div className="flex flex-col mb-5">
        <label className="block text-[13px] font-medium text-ui-text-secondary mb-1.5">{t("代理地址", "Proxy Address")}</label>
        <div className="flex gap-1.5 items-center max-w-[460px]">
          <select
            className="py-1.5 px-2 border border-ui-border rounded text-[13px] font-inherit bg-ui-input-bg text-ui-text outline-none cursor-pointer shrink-0 min-w-[80px] focus:border-ui-accent"
            value={draftType}
            onChange={(e) => setDraftType(e.target.value as ProxyType)}
          >
            <option value="none">None</option>
            <option value="http">HTTP</option>
            <option value="https">HTTPS</option>
            <option value="socks5">SOCKS5</option>
          </select>
          <input
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
            {saving ? t("保存中...", "Saving...") : t("保存", "Save")}
          </button>
        </div>
      </div>

      {error && <div className="text-[13px] text-[#ef4444] mb-3">{error}</div>}
      {toast && <div className="mt-3 py-2 px-3 rounded bg-ui-bg-secondary border border-ui-border text-ui-text text-[13px] animate-menu-fadein">{toast}</div>}
    </div>
  );
}

function AboutSection() {
  const [version, setVersion] = useState("");
  const checkUpdate = useUpdateStore((s) => s.checkUpdate);

  useEffect(() => {
    getVersion().then(setVersion);
  }, []);

  return (
    <div className="max-w-[720px] w-full">
      <h3 className="text-sm font-semibold text-ui-text m-0 pb-2 border-b border-ui-border mb-5">{t("关于", "About")}</h3>

      <div className="flex flex-col items-center gap-1 pt-8">
        <img className="w-20 h-20 rounded-2xl mb-3" src="/icon.png" alt="MoFlow" />
        <div className="text-lg font-semibold text-ui-text">MoFlow</div>
        <div className="text-[13px] text-ui-text-secondary">v{version}</div>
        <div className="text-xs text-ui-text-secondary mb-4">&copy; 2026 MoFlow</div>
        <button
          className="py-1.5 px-5 rounded border border-ui-border bg-ui-bg text-ui-text text-[13px] font-inherit cursor-pointer transition-all duration-150 hover:bg-ui-bg-secondary hover:border-ui-accent"
          onClick={() => checkUpdate(true)}
        >
          {t("检查更新", "Check for Updates")}
        </button>
      </div>
    </div>
  );
}

export default function SettingsPanel() {
  const [activeSection, setActiveSection] = useState<Section>("appearance");

  return (
    <div className="flex h-full bg-ui-bg flex-1 min-w-0">
      <nav className="w-40 shrink-0 p-3 px-1.5 border-r border-ui-border flex flex-col gap-px">
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
        {activeSection === "proxy" && <ProxySection />}
        {activeSection === "about" && <AboutSection />}
      </div>
    </div>
  );
}
