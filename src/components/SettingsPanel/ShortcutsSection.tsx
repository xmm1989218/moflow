import { useState, useEffect, useRef, useCallback } from "react";
import { useThemeStore } from "../../stores/themeStore";
import { getAllShortcuts, defaultShortcuts, formatShortcutDisplay, findConflict, parseKeyEvent, applyShortcutOverrides } from "../../lib/shortcuts";
import { t } from "../../i18n/core";
import { useT } from "../../i18n/useT";

export default function ShortcutsSection() {
  useT();
  const shortcutOverrides = useThemeStore((s) => s.shortcutOverrides);
  const setShortcutOverrides = useThemeStore((s) => s.setShortcutOverrides);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const recordRef = useRef<HTMLButtonElement>(null);

  const allShortcuts = getAllShortcuts();

  const handleRecord = useCallback((id: string) => {
    setRecordingId(id);
    setConflict(null);
  }, []);

  const handleReset = useCallback((id: string) => {
    const next = { ...shortcutOverrides };
    delete next[id];
    setShortcutOverrides(next);
    applyShortcutOverrides(next);
    setConflict(null);
  }, [shortcutOverrides, setShortcutOverrides]);

  const handleResetAll = useCallback(() => {
    setShortcutOverrides({});
    applyShortcutOverrides({});
    setConflict(null);
  }, [setShortcutOverrides]);

  useEffect(() => {
    if (!recordingId) return;

    function onKeyDown(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        setRecordingId(null);
        setConflict(null);
        return;
      }

      const parsed = parseKeyEvent(e);
      if (!parsed) return;

      const conflictId = findConflict(recordingId!, parsed.key, parsed.modifiers);
      if (conflictId) {
        const conflictDef = defaultShortcuts.find((s) => s.id === conflictId);
        setConflict(conflictDef ? t(conflictDef.labelKey) : conflictId);
        return;
      }

      const next = { ...shortcutOverrides, [recordingId!]: parsed };
      setShortcutOverrides(next);
      applyShortcutOverrides(next);
      setRecordingId(null);
      setConflict(null);
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [recordingId, shortcutOverrides, setShortcutOverrides]);

  useEffect(() => {
    if (recordingId && recordRef.current) {
      recordRef.current.focus();
    }
  }, [recordingId]);

  return (
    <div className="max-w-[720px] w-full">
      <h3 className="text-sm font-semibold text-ui-text m-0 pb-2 border-b border-ui-border mb-5">{t("settings.section.shortcuts")}</h3>

      <div className="flex flex-col gap-0.5">
        {allShortcuts.map((s) => {
          const isRecording = recordingId === s.id;
          const hasOverride = !!shortcutOverrides[s.id];

          return (
            <div key={s.id} className={`flex items-center gap-3 py-2 px-3 rounded transition-colors duration-100${isRecording ? " bg-ui-bg-secondary" : ""}`}>
              <span className="flex-1 text-[13px] text-ui-text">{t(s.labelKey)}</span>
              {isRecording ? (
                <span className="text-[12px] text-ui-accent animate-pulse">{conflict ? t("settings.shortcuts.conflict", { name: conflict }) : t("settings.shortcuts.pressKeys")}</span>
              ) : (
                <span className="text-[12px] text-ui-text-secondary font-mono">{formatShortcutDisplay(s)}</span>
              )}
              <button
                ref={isRecording ? recordRef : undefined}
                className="px-2 py-0.5 text-[11px] rounded border border-ui-border bg-ui-bg text-ui-text-secondary cursor-pointer font-inherit hover:bg-ui-bg-secondary hover:text-ui-text transition-colors duration-100 shrink-0"
                onClick={() => isRecording ? setRecordingId(null) : handleRecord(s.id)}
              >
                {isRecording ? t("settings.shortcuts.cancel") : t("settings.shortcuts.change")}
              </button>
              {hasOverride && !isRecording && (
                <button
                  className="px-2 py-0.5 text-[11px] rounded border border-ui-border bg-ui-bg text-ui-text-secondary cursor-pointer font-inherit hover:bg-ui-bg-secondary hover:text-ui-text transition-colors duration-100 shrink-0"
                  onClick={() => handleReset(s.id)}
                >
                  {t("settings.shortcuts.reset")}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {Object.keys(shortcutOverrides).length > 0 && (
        <div className="mt-5">
          <button
            className="py-1.5 px-3.5 rounded border border-ui-border bg-ui-bg text-ui-text-secondary text-[13px] font-inherit cursor-pointer transition-all duration-150 hover:bg-ui-bg-secondary hover:border-ui-accent"
            onClick={handleResetAll}
          >
            {t("settings.shortcuts.resetAll")}
          </button>
        </div>
      )}
    </div>
  );
}
