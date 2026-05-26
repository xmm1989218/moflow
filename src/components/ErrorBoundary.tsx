import { Component, useState, type ErrorInfo, type ReactNode } from "react";
import { t } from "../i18n/core";
import { useT } from "../i18n/useT";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
  resetKeys?: unknown[];
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  prevResetKeys: unknown[];
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      prevResetKeys: props.resetKeys ?? [],
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    const nextKeys = props.resetKeys ?? [];
    const prevKeys = state.prevResetKeys;
    if (nextKeys.length !== prevKeys.length || nextKeys.some((k, i) => k !== prevKeys[i])) {
      return { hasError: false, error: null, errorInfo: null, prevResetKeys: nextKeys };
    }
    return null;
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary]", error);
    console.error("[ErrorBoundary] Component stack:", errorInfo.componentStack);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.props.onReset?.();
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleReload = () => {
    location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "32px",
          textAlign: "center",
          color: "var(--ui-text)",
        }}>
          <div style={{ fontSize: "40px", marginBottom: "16px" }}><AlertTriangle size={20} className="text-[#e53e3e]" /></div>
          <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>
            {t("common.error.somethingWentWrong")}
          </h2>
          <p style={{ fontSize: "13px", color: "var(--ui-text-secondary)", marginBottom: "16px" }}>
            {this.state.error?.message ?? t("common.error.unknown")}
          </p>
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
            <button
              onClick={this.handleReset}
              style={{
                padding: "6px 16px",
                borderRadius: "6px",
                border: "1px solid var(--ui-border)",
                background: "var(--ui-accent)",
                color: "#fff",
                cursor: "pointer",
                fontSize: "13px",
              }}
            >
              {t("common.retry")}
            </button>
            <button
              onClick={this.handleReload}
              style={{
                padding: "6px 16px",
                borderRadius: "6px",
                border: "1px solid var(--ui-border)",
                background: "transparent",
                color: "var(--ui-text)",
                cursor: "pointer",
                fontSize: "13px",
              }}
            >
              {t("common.reload")}
            </button>
          </div>
          {this.state.errorInfo && <ErrorDetails errorInfo={this.state.errorInfo} />}
        </div>
      );
    }

    return this.props.children;
  }
}

function ErrorDetails({ errorInfo }: { errorInfo: ErrorInfo }) {
  useT();
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ width: "100%", maxWidth: "500px" }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          fontSize: "12px",
          color: "var(--ui-text-secondary)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "4px 0",
        }}
      >
        {expanded ? t("common.hideDetails") : t("common.showDetails")}
      </button>
      {expanded && (
        <pre style={{
          fontSize: "11px",
          color: "var(--ui-text-secondary)",
          background: "var(--ui-bg-secondary)",
          padding: "12px",
          borderRadius: "6px",
          overflow: "auto",
          maxHeight: "200px",
          textAlign: "left",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}>
          {errorInfo.componentStack}
        </pre>
      )}
    </div>
  );
}
