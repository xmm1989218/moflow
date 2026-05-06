import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";

declare global {
  interface Window {
    __startupMark: (label: string) => void;
  }
}

function startupMark(label: string) {
  console.log(`[startup] ${label}: ${Math.round(performance.now())}ms`);
}

window.__startupMark = startupMark;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
