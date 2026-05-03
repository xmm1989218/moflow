import type { EditorTheme } from "../stores/appStore";

const themeVars: Record<EditorTheme, Record<string, string>> = {
  "github": {
    "--moflow-bg": "#ffffff",
    "--moflow-bg-secondary": "#f6f8fa",
    "--moflow-text": "#1f2328",
    "--moflow-text-secondary": "#656d76",
    "--moflow-border": "#d1d9e0",
    "--moflow-accent": "#0969da",
    "--moflow-code-bg": "#f6f8fa",
    "--moflow-font-body": "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
    "--moflow-font-mono": "'JetBrains Mono', 'Fira Code', Consolas, monospace",
  },
  "github-dark": {
    "--moflow-bg": "#0d1117",
    "--moflow-bg-secondary": "#161b22",
    "--moflow-text": "#e6edf3",
    "--moflow-text-secondary": "#8b949e",
    "--moflow-border": "#30363d",
    "--moflow-accent": "#58a6ff",
    "--moflow-code-bg": "#161b22",
    "--moflow-font-body": "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
    "--moflow-font-mono": "'JetBrains Mono', 'Fira Code', Consolas, monospace",
  },
  "nord": {
    "--moflow-bg": "#eceff4",
    "--moflow-bg-secondary": "#e5e9f0",
    "--moflow-text": "#2e3440",
    "--moflow-text-secondary": "#4c566a",
    "--moflow-border": "#d8dee9",
    "--moflow-accent": "#5e81ac",
    "--moflow-code-bg": "#e5e9f0",
    "--moflow-font-body": "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
    "--moflow-font-mono": "'JetBrains Mono', 'Fira Code', Consolas, monospace",
  },
  "nord-dark": {
    "--moflow-bg": "#2e3440",
    "--moflow-bg-secondary": "#3b4252",
    "--moflow-text": "#eceff4",
    "--moflow-text-secondary": "#d8dee9",
    "--moflow-border": "#434c5e",
    "--moflow-accent": "#88c0d0",
    "--moflow-code-bg": "#3b4252",
    "--moflow-font-body": "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
    "--moflow-font-mono": "'JetBrains Mono', 'Fira Code', Consolas, monospace",
  },
  "catppuccin-latte": {
    "--moflow-bg": "#eff1f5",
    "--moflow-bg-secondary": "#e6e9ef",
    "--moflow-text": "#4c4f69",
    "--moflow-text-secondary": "#7c7f93",
    "--moflow-border": "#ccd0da",
    "--moflow-accent": "#1e66f5",
    "--moflow-code-bg": "#e6e9ef",
    "--moflow-font-body": "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
    "--moflow-font-mono": "'JetBrains Mono', 'Fira Code', Consolas, monospace",
  },
  "catppuccin-mocha": {
    "--moflow-bg": "#1e1e2e",
    "--moflow-bg-secondary": "#181825",
    "--moflow-text": "#cdd6f4",
    "--moflow-text-secondary": "#a6adc8",
    "--moflow-border": "#313244",
    "--moflow-accent": "#89b4fa",
    "--moflow-code-bg": "#313244",
    "--moflow-font-body": "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
    "--moflow-font-mono": "'JetBrains Mono', 'Fira Code', Consolas, monospace",
  },
};

export { themeVars };

export function getThemeCSS(themeName: EditorTheme): string {
  const vars = themeVars[themeName];
  return `:root {\n${Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join("\n")}\n}`;
}
