import { useAppStore } from "../../stores/appStore";

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
  const showStatusBar = useAppStore((s) => s.showStatusBar);
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);

  if (!showStatusBar) return null;

  return (
    <div
      className="h-6 shrink-0 border-t flex items-center text-xs justify-between"
      style={{
        backgroundColor: "var(--ui-bg-secondary)",
        borderColor: "var(--ui-border)",
        color: "var(--ui-text-secondary)",
        paddingLeft: 16,
        paddingRight: 16,
      }}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={() => setMode(mode === "wysiwyg" ? "source" : "wysiwyg")}
          style={{
            background: "none",
            border: "1px solid var(--ui-border)",
            borderRadius: 4,
            color: "var(--ui-text-secondary)",
            padding: "0 5px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: 18,
            lineHeight: 1,
          }}
          title={mode === "wysiwyg" ? "Switch to Source Mode" : "Switch to WYSIWYG Mode"}
        >
          {mode === "wysiwyg" ? <CodeIcon /> : <EyeIcon />}
        </button>
      </div>
      <div className="flex items-center gap-3">
        <span>UTF-8</span>
        <span>Markdown</span>
      </div>
    </div>
  );
}
