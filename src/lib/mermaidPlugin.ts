import type { MilkdownPlugin } from "@milkdown/ctx";
import { codeBlockConfig } from "@milkdown/kit/component/code-block";

let mermaidInitialized = false;
let renderCounter = 0;

async function ensureMermaidInit() {
  if (mermaidInitialized) return;
  const m = await import("mermaid");
  const isDark = document.querySelector("[data-editor-theme]")?.getAttribute("data-editor-theme")?.includes("dark") ?? false;
  m.default.initialize({
    startOnLoad: false,
    theme: isDark ? "dark" : "default",
    securityLevel: "loose",
  });
  mermaidInitialized = true;
}

async function renderMermaidDiagram(
  content: string,
  applyPreview: (value: null | string | HTMLElement) => void
) {
  try {
    await ensureMermaidInit();
    const m = await import("mermaid");
    const id = `mermaid-${++renderCounter}`;
    const { svg } = await m.default.render(id, content);
    const container = document.createElement("div");
    container.className = "moflow-mermaid-preview";
    container.innerHTML = svg;
    applyPreview(container);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    applyPreview(`<div class="moflow-mermaid-error"><pre>${message}</pre></div>`);
  }
}

export const mermaidPlugin: MilkdownPlugin = (ctx) => async () => {
  ctx.update(codeBlockConfig.key, (prev) => ({
    ...prev,
    renderPreview: (language, content, applyPreview) => {
      if (language.toLowerCase() === "mermaid" && content.length > 0) {
        renderMermaidDiagram(content, applyPreview);
        return undefined;
      }
      const prevRender = prev.renderPreview;
      return prevRender(language, content, applyPreview);
    },
  }));
};

export async function resetMermaidTheme() {
  mermaidInitialized = false;
  await ensureMermaidInit();
}
