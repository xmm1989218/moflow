import { useState } from "react";
import { useThemeStore } from "../../stores/themeStore";
import { t } from "../../i18n/core";
import { useT } from "../../i18n/useT";

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;

export default function EnvVarsSection() {
  useT();
  const envVars = useThemeStore((s) => s.envVars);
  const setEnvVars = useThemeStore((s) => s.setEnvVars);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleAdd = () => {
    const key = newKey.trim().toUpperCase();
    if (!key) return;
    if (!KEY_RE.test(key)) {
      setError(t("settings.envVars.keyPattern"));
      return;
    }
    if (key in envVars) {
      setError(t("settings.envVars.keyExists"));
      return;
    }
    setEnvVars({ ...envVars, [key]: newValue });
    setNewKey("");
    setNewValue("");
    setError(null);
  };

  const handleRemove = (key: string) => {
    const next = { ...envVars };
    delete next[key];
    setEnvVars(next);
  };

  const handleValueChange = (key: string, value: string) => {
    setEnvVars({ ...envVars, [key]: value });
  };

  const entries = Object.entries(envVars).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="max-w-[720px] w-full">
      <h3 className="text-sm font-semibold text-ui-text m-0 pb-2 border-b border-ui-border mb-5">{t("settings.section.envVars")}</h3>

      {entries.length > 0 && (
        <div className="flex flex-col gap-2 mb-4">
          {entries.map(([key, value]) => (
            <div key={key} className="flex items-center gap-2 max-w-[460px]">
              <span className="text-[13px] font-mono text-ui-text py-1.5 px-2.5 bg-ui-bg-secondary rounded min-w-[170px] shrink-0 truncate" title={key}>{key}</span>
              <input
                className="flex-1 py-1.5 px-2.5 border border-ui-border rounded text-[13px] font-inherit bg-ui-input-bg text-ui-text outline-none focus:border-ui-accent placeholder:text-ui-text-secondary"
                type="text"
                value={value}
                onChange={(e) => handleValueChange(key, e.target.value)}
              />
              <button
                className="flex items-center justify-center w-7 h-7 rounded border border-ui-border bg-ui-bg text-ui-text-secondary cursor-pointer shrink-0 hover:bg-ui-bg-secondary hover:text-[#ef4444]"
                onClick={() => handleRemove(key)}
                type="button"
                aria-label={t("common.delete")}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 max-w-[460px]">
        <input
          className="w-[170px] py-1.5 px-2.5 border border-ui-border rounded text-[13px] font-inherit bg-ui-input-bg text-ui-text outline-none focus:border-ui-accent placeholder:text-ui-text-secondary shrink-0"
          type="text"
          value={newKey}
          onChange={(e) => { setNewKey(e.target.value); setError(null); }}
          placeholder={t("settings.envVars.key")}
        />
        <input
          className="flex-1 py-1.5 px-2.5 border border-ui-border rounded text-[13px] font-inherit bg-ui-input-bg text-ui-text outline-none focus:border-ui-accent placeholder:text-ui-text-secondary"
          type="text"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          placeholder={t("settings.envVars.value")}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
        />
        <button
          className="py-1.5 px-3 rounded border border-ui-border bg-ui-bg text-ui-text text-[13px] font-inherit cursor-pointer transition-all duration-150 hover:bg-ui-bg-secondary hover:border-ui-accent shrink-0"
          onClick={handleAdd}
          type="button"
        >
          {t("settings.envVars.add")}
        </button>
      </div>

      {error && <div className="text-[13px] text-[#ef4444] mt-2">{error}</div>}
    </div>
  );
}
