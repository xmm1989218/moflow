import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";

declare global {
  interface Window {
    __startupMark: (label: string, startMark?: string) => void;
  }
}

function startupMark(label: string, startMark?: string) {
  performance.mark(label);
  if (startMark) {
    performance.measure(label, startMark, label);
  }
  console.log(`[startup] ${label}: ${Math.round(performance.now())}ms`);
}

window.__startupMark = startupMark;

performance.mark("js-exec");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
