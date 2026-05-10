import type { EditorTheme } from "../stores/appStore";
import { getThemeCSS } from "./themeCSS";

export function exportAsHtml(bodyHtml: string, themeName: EditorTheme): string {
  const css = getThemeCSS(themeName);

  return `<!DOCTYPE html>
<html lang="en" data-editor-theme="${themeName}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MoFlow Export</title>
  <style>
    ${css}
    body {
      max-width: 980px;
      margin: 0 auto;
      padding: 45px 48px;
      background-color: var(--moflow-bg);
      color: var(--moflow-text);
      font-family: var(--moflow-font-body);
      font-size: 16px;
      line-height: 1.7;
    }
    h1 { font-size: 2em; font-weight: 700; border-bottom: 1px solid var(--moflow-border); padding-bottom: 0.3em; margin-top: 24px; margin-bottom: 16px; }
    h2 { font-size: 1.5em; font-weight: 600; border-bottom: 1px solid var(--moflow-border); padding-bottom: 0.3em; margin-top: 20px; margin-bottom: 12px; }
    h3 { font-size: 1.25em; font-weight: 600; margin-top: 16px; margin-bottom: 8px; }
    h4, h5, h6 { font-weight: 600; margin-top: 12px; margin-bottom: 6px; }
    p { margin: 8px 0; }
    code { font-family: var(--moflow-font-mono); font-size: 0.875em; background-color: var(--moflow-code-bg); padding: 0.2em 0.4em; border-radius: 4px; }
    pre { background-color: var(--moflow-code-bg); border-radius: 8px; padding: 16px; overflow-x: auto; margin: 12px 0; }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 4px solid var(--moflow-accent); padding: 0.5em 1em; margin: 8px 0; background-color: var(--moflow-bg-secondary); border-radius: 0 8px 8px 0; }
    ul, ol { padding-left: 1.5em; margin: 8px 0; }
    li { margin: 4px 0; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; }
    th, td { border: 1px solid var(--moflow-border); padding: 6px 13px; text-align: left; }
    th { background-color: var(--moflow-bg-secondary); font-weight: 600; }
    hr { border: none; background-color: var(--moflow-border); height: 1px; margin: 24px 0; }
    a { color: var(--moflow-accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    img { max-width: 100%; border-radius: 8px; }
    .moflow-mermaid-preview { display: flex; justify-content: center; padding: 16px; }
    .moflow-mermaid-preview svg { max-width: 100%; height: auto; }
    .moflow-mermaid-error { color: #d32f2f; font-size: 13px; padding: 8px 12px; }
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}
