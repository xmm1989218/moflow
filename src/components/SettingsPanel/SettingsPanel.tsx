import { useState } from "react";
import { useThemeStore, EDITOR_THEMES, type EditorTheme } from "../../stores/themeStore";
import { useAIConfigStore } from "../../stores/aiConfigStore";
import { useUpdateStore } from "../../stores/updateStore";
import { getLLMClient } from "../../lib/llmClient";
import { getProviders, getProviderInfo, getProviderModels } from "../../lib/modelInfo";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import type { AIConfig } from "../../lib/settings";
import "./SettingsPanel.css";

const isZh = navigator.language.startsWith("zh");
const t = (zh: string, en: string) => (isZh ? zh : en);

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
    <div className="moflow-settings-section">
      <h3 className="moflow-settings-section-title">{t("外观", "Appearance")}</h3>

      <div className="moflow-settings-field">
        <label className="moflow-settings-label">{t("应用主题", "App Theme")}</label>
        <div className="moflow-settings-mode-switch">
          <button
            className={`moflow-settings-mode-btn${appTheme === "system" ? " active" : ""}`}
            onClick={() => setAppTheme("system")}
          >
            {t("跟随系统", "System")}
          </button>
          <button
            className={`moflow-settings-mode-btn${appTheme === "light" ? " active" : ""}`}
            onClick={() => setAppTheme("light")}
          >
            {t("浅色", "Light")}
          </button>
          <button
            className={`moflow-settings-mode-btn${appTheme === "dark" ? " active" : ""}`}
            onClick={() => setAppTheme("dark")}
          >
            {t("深色", "Dark")}
          </button>
        </div>
      </div>

      <div className="moflow-settings-field">
        <label className="moflow-settings-label">{t("编辑器主题", "Editor Theme")}</label>
        <select
          className="moflow-settings-select"
          value={editorTheme}
          onChange={(e) => setEditorTheme(e.target.value as EditorTheme)}
        >
          {EDITOR_THEMES.map((th) => (
            <option key={th.id} value={th.id}>{th.label}</option>
          ))}
        </select>
      </div>

      <div className="moflow-settings-field moflow-settings-toggle-field">
        <label className="moflow-settings-label">{t("自动保存", "Auto Save")}</label>
        <button
          className={`moflow-settings-toggle${autoSave ? " active" : ""}`}
          onClick={toggleAutoSave}
        >
          <span className="moflow-settings-toggle-thumb" />
        </button>
      </div>

      <div className="moflow-settings-field moflow-settings-toggle-field">
        <label className="moflow-settings-label">{t("显示状态栏", "Show Status Bar")}</label>
        <button
          className={`moflow-settings-toggle${showStatusBar ? " active" : ""}`}
          onClick={toggleStatusBar}
        >
          <span className="moflow-settings-toggle-thumb" />
        </button>
      </div>
    </div>
  );
}

function AISection() {
  const config = useAIConfigStore((s) => s.config);
  const saveConfig = useAIConfigStore((s) => s.saveConfig);
  const [draft, setDraft] = useState<AIConfig>({ ...config });
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const currentProvider = getProviderInfo(draft.providerId);
  const currentModels = getProviderModels(draft.providerId);
  const isKnownModel = currentModels.some((m) => m.id === config.model);
  const [modelInputMode, setModelInputMode] = useState<"select" | "input">(
    isKnownModel || !config.model ? "select" : "input"
  );
  const providerList = getProviders();

  const handleModeChange = (mode: "mock" | "real") => {
    const newDraft = { ...draft, mode };
    setDraft(newDraft);
    saveConfig(newDraft);
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
    saveConfig(newDraft);
  };

  const handleModelSelect = (modelId: string) => {
    if (modelId === "__custom__") {
      setModelInputMode("input");
      setDraft((d) => ({ ...d, model: "" }));
      return;
    }
    const newDraft = { ...draft, model: modelId };
    setDraft(newDraft);
    saveConfig(newDraft);
  };

  const handleFieldChange = (field: keyof AIConfig, value: string) => {
    const newDraft = { ...draft, [field]: value };
    setDraft(newDraft);
    saveConfig(newDraft);
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
    <div className="moflow-settings-section">
      <h3 className="moflow-settings-section-title">AI</h3>

      <div className="moflow-settings-field">
        <label className="moflow-settings-label">{t("模式", "Mode")}</label>
        <div className="moflow-settings-mode-switch">
          <button
            className={`moflow-settings-mode-btn${draft.mode === "mock" ? " active" : ""}`}
            onClick={() => handleModeChange("mock")}
          >
            Mock
          </button>
          <button
            className={`moflow-settings-mode-btn${draft.mode === "real" ? " active" : ""}`}
            onClick={() => handleModeChange("real")}
          >
            {t("真实 API", "Real API")}
          </button>
        </div>
      </div>

      {draft.mode === "real" && (
        <>
          <div className="moflow-settings-field">
            <label className="moflow-settings-label">{t("服务商", "Provider")}</label>
            <select
              className="moflow-settings-select"
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

          <div className="moflow-settings-field">
            <label className="moflow-settings-label">API Endpoint</label>
            <input
              className="moflow-settings-input"
              type="text"
              value={draft.apiEndpoint}
              onChange={(e) => handleFieldChange("apiEndpoint", e.target.value)}
              placeholder={currentProvider?.defaultEndpoint ?? "https://api.openai.com/v1"}
            />
          </div>

          <div className="moflow-settings-field">
            <label className="moflow-settings-label">API Token</label>
            <div className="moflow-settings-token-row">
              <input
                className="moflow-settings-input moflow-settings-token-input"
                type={showToken ? "text" : "password"}
                value={draft.apiToken}
                onChange={(e) => handleFieldChange("apiToken", e.target.value)}
                placeholder="sk-..."
              />
              <button
                className="moflow-settings-token-toggle"
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

          <div className="moflow-settings-field">
            <label className="moflow-settings-label">Model</label>
            {modelInputMode === "select" && currentModels.length > 0 ? (
              <div className="moflow-settings-model-row">
                <select
                  className="moflow-settings-select moflow-settings-model-select"
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
              <div className="moflow-settings-model-row">
                <input
                  className="moflow-settings-input moflow-settings-model-input"
                  type="text"
                  value={draft.model}
                  onChange={(e) => handleFieldChange("model", e.target.value)}
                  placeholder="model-name"
                />
                {currentModels.length > 0 && (
                  <button
                    className="moflow-settings-model-back"
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

          <div className="moflow-settings-test-row">
            <button
              className="moflow-settings-test-btn"
              onClick={handleTest}
              disabled={testing || !draft.apiEndpoint || !draft.apiToken || !draft.model}
            >
              {testing ? t("测试中...", "Testing...") : t("测试连接", "Test Connection")}
            </button>
            {testResult === "success" && (
              <span className="moflow-settings-test-success">{t("连接成功", "Connected")}</span>
            )}
            {testResult === "error" && (
              <span className="moflow-settings-test-error">{t("连接失败", "Connection Failed")}</span>
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
    <div className="moflow-settings-section">
      <h3 className="moflow-settings-section-title">{t("代理", "Proxy")}</h3>

      <div className="moflow-settings-field">
        <label className="moflow-settings-label">{t("代理地址", "Proxy Address")}</label>
        <div className="moflow-settings-proxy-row">
          <select
            className="moflow-settings-proxy-type-select"
            value={draftType}
            onChange={(e) => setDraftType(e.target.value as ProxyType)}
          >
            <option value="none">None</option>
            <option value="http">HTTP</option>
            <option value="https">HTTPS</option>
            <option value="socks5">SOCKS5</option>
          </select>
          <input
            className="moflow-settings-input moflow-settings-proxy-host-input"
            type="text"
            value={draftHost}
            onChange={(e) => setDraftHost(e.target.value)}
            placeholder="127.0.0.1:7890"
            disabled={draftType === "none"}
          />
          <button
            className="moflow-settings-save-btn moflow-settings-proxy-save-btn"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? t("保存中...", "Saving...") : t("保存", "Save")}
          </button>
        </div>
      </div>

      {error && <div className="moflow-settings-error">{error}</div>}
      {toast && <div className="moflow-settings-toast">{toast}</div>}
    </div>
  );
}

function AboutSection() {
  const [version, setVersion] = useState("");
  const checkUpdate = useUpdateStore((s) => s.checkUpdate);

  useState(() => {
    getVersion().then(setVersion);
  });

  return (
    <div className="moflow-settings-section">
      <h3 className="moflow-settings-section-title">{t("关于", "About")}</h3>

      <div className="moflow-settings-about">
        <img className="moflow-settings-about-icon" src="/icon.png" alt="MoFlow" />
        <div className="moflow-settings-about-name">MoFlow</div>
        <div className="moflow-settings-about-version">v{version}</div>
        <div className="moflow-settings-about-copyright">&copy; 2026 MoFlow</div>
        <button
          className="moflow-settings-about-update-btn"
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
    <div className="moflow-settings-panel">
      <nav className="moflow-settings-nav">
        {sections.map((s) => (
          <button
            key={s.id}
            className={`moflow-settings-nav-item${activeSection === s.id ? " active" : ""}`}
            onClick={() => setActiveSection(s.id)}
          >
            <span className="moflow-settings-nav-icon">{sectionIcons[s.id]}</span>
            <span className="moflow-settings-nav-label">{s.label}</span>
          </button>
        ))}
      </nav>
      <div className="moflow-settings-content">
        {activeSection === "appearance" && <AppearanceSection />}
        {activeSection === "ai" && <AISection />}
        {activeSection === "proxy" && <ProxySection />}
        {activeSection === "about" && <AboutSection />}
      </div>
    </div>
  );
}
