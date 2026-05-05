import { useState } from "react";
import { useAIConfigStore } from "../../stores/aiConfigStore";
import { getLLMClient } from "../../lib/llmClient";
import { getProviders, getProviderInfo, getProviderModels } from "../../lib/modelInfo";
import type { AIConfig } from "../../lib/settings";
import "./AISidebar.css";

const isZh = navigator.language.startsWith("zh");
const t = (zh: string, en: string) => (isZh ? zh : en);

const providerList = getProviders();

interface AIConfigModalProps {
  open: boolean;
  onClose: () => void;
}

export default function AIConfigModal({ open, onClose }: AIConfigModalProps) {
  const config = useAIConfigStore((s) => s.config);
  const saveConfig = useAIConfigStore((s) => s.saveConfig);

  const [draft, setDraft] = useState<AIConfig>({ ...config });
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const providerModels = getProviderModels(config.providerId);
  const isKnownModel = providerModels.some((m) => m.id === config.model);
  const [modelInputMode, setModelInputMode] = useState<"select" | "input">(
    isKnownModel || !config.model ? "select" : "input"
  );

  if (!open) return null;

  const currentProvider = getProviderInfo(draft.providerId);
  const currentModels = getProviderModels(draft.providerId);

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

  const handleSave = async () => {
    await saveConfig(draft);
    onClose();
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
        (chunk) => {
          if (chunk) gotContent = true;
        },
        new AbortController().signal,
        10000
      );
      setTestResult(gotContent ? "success" : "error");
    } catch {
      setTestResult("error");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="moflow-ai-config-overlay" onClick={onClose}>
      <div className="moflow-ai-config-modal" onClick={(e) => e.stopPropagation()}>
        <div className="moflow-ai-config-header">
          <span className="moflow-ai-config-title">{t("AI 配置", "AI Configuration")}</span>
          <button className="moflow-ai-config-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="moflow-ai-config-body">
          <div className="moflow-ai-config-mode">
            <label className="moflow-ai-config-label">{t("模式", "Mode")}</label>
            <div className="moflow-ai-config-mode-switch">
              <button
                className={`moflow-ai-config-mode-btn ${draft.mode === "mock" ? "active" : ""}`}
                onClick={() => handleModeChange("mock")}
              >
                Mock
              </button>
              <button
                className={`moflow-ai-config-mode-btn ${draft.mode === "real" ? "active" : ""}`}
                onClick={() => handleModeChange("real")}
              >
                {t("真实 API", "Real API")}
              </button>
            </div>
          </div>

          {draft.mode === "real" && (
            <>
              <div className="moflow-ai-config-field">
                <label className="moflow-ai-config-label">{t("服务商", "Provider")}</label>
                <select
                  className="moflow-ai-config-select"
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

              <div className="moflow-ai-config-field">
                <label className="moflow-ai-config-label">API Endpoint</label>
                <input
                  className="moflow-ai-config-input"
                  type="text"
                  value={draft.apiEndpoint}
                  onChange={(e) => setDraft((d) => ({ ...d, apiEndpoint: e.target.value }))}
                  placeholder={currentProvider?.defaultEndpoint ?? "https://api.openai.com/v1"}
                />
              </div>

              <div className="moflow-ai-config-field">
                <label className="moflow-ai-config-label">API Token</label>
                <div className="moflow-ai-config-token-row">
                  <input
                    className="moflow-ai-config-input moflow-ai-config-token-input"
                    type={showToken ? "text" : "password"}
                    value={draft.apiToken}
                    onChange={(e) => setDraft((d) => ({ ...d, apiToken: e.target.value }))}
                    placeholder="sk-..."
                  />
                  <button
                    className="moflow-ai-config-token-toggle"
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

              <div className="moflow-ai-config-field">
                <label className="moflow-ai-config-label">Model</label>
                {modelInputMode === "select" && currentModels.length > 0 ? (
                  <div className="moflow-ai-config-model-row">
                    <select
                      className="moflow-ai-config-select moflow-ai-config-model-select"
                      value={currentModels.some((m) => m.id === draft.model) ? draft.model : ""}
                      onChange={(e) => handleModelSelect(e.target.value)}
                    >
                      <option value="" disabled>
                        {t("选择模型", "Select model")}
                      </option>
                      {currentModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.id}
                        </option>
                      ))}
                      <option value="__custom__">{t("手动输入...", "Custom input...")}</option>
                    </select>
                  </div>
                ) : (
                  <div className="moflow-ai-config-model-row">
                    <input
                      className="moflow-ai-config-input moflow-ai-config-model-input"
                      type="text"
                      value={draft.model}
                      onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))}
                      placeholder="model-name"
                    />
                    {currentModels.length > 0 && (
                      <button
                        className="moflow-ai-config-model-back"
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

              <div className="moflow-ai-config-test-row">
                <button
                  className="moflow-ai-config-test-btn"
                  onClick={handleTest}
                  disabled={testing || !draft.apiEndpoint || !draft.apiToken || !draft.model}
                >
                  {testing ? t("测试中...", "Testing...") : t("测试连接", "Test Connection")}
                </button>
                {testResult === "success" && (
                  <span className="moflow-ai-config-test-success">{t("连接成功", "Connected")}</span>
                )}
                {testResult === "error" && (
                  <span className="moflow-ai-config-test-error">{t("连接失败", "Connection Failed")}</span>
                )}
              </div>
            </>
          )}
        </div>

        <div className="moflow-ai-config-footer">
          <button className="moflow-ai-config-cancel-btn" onClick={onClose}>
            {t("取消", "Cancel")}
          </button>
          <button className="moflow-ai-config-save-btn" onClick={handleSave}>
            {t("保存", "Save")}
          </button>
        </div>
      </div>
    </div>
  );
}
