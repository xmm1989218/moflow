import { useTabStore } from "../../stores/tabStore";
import { useThemeStore } from "../../stores/themeStore";
import { t } from "../../i18n/core";
import { useT } from "../../i18n/useT";

const CodeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);

const EyeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export default function StatusBar() {
  const showStatusBar = useThemeStore((s) => s.showStatusBar);
  const autoSave = useThemeStore((s) => s.autoSave);
  const activeFileId = useTabStore((s) => s.activeFileId);
  const mode = useTabStore((s) => {
    const tab = s.files.find((f) => f.id === s.activeFileId);
    return tab?.mode ?? "wysiwyg";
  });
  useT();

  const setMode = (m: "wysiwyg" | "source") => {
    if (activeFileId) useTabStore.getState().updateTabMeta(activeFileId, { mode: m });
  };

  if (!showStatusBar) return null;

  return (
    <div className="h-6 shrink-0 border-t border-ui-border flex items-center text-xs justify-between bg-ui-bg-secondary text-ui-text-secondary px-4">
      <div className="flex items-center gap-3">
        {activeFileId && (
          <button
            onClick={() => setMode(mode === "wysiwyg" ? "source" : "wysiwyg")}
            className="bg-none border border-ui-border rounded text-ui-text-secondary px-[5px] cursor-pointer flex items-center justify-center h-[18px] leading-none"
            aria-label={mode === "source" ? t("statusBar.switchToWysiwyg") : t("statusBar.switchToSource")}
            aria-pressed={mode === "source"}
            title={mode === "wysiwyg" ? t("statusBar.switchToSource") : t("statusBar.switchToWysiwyg")}
          >
            {mode === "wysiwyg" ? <CodeIcon /> : <EyeIcon />}
          </button>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span>UTF-8</span>
        <span>Markdown</span>
        {autoSave && <span>{t("statusBar.autoSave")}</span>}
      </div>
    </div>
  );
}
