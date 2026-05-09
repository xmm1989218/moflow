const isZh = typeof navigator !== "undefined" && navigator.language?.startsWith("zh");

export const toolbarTooltipMap: Record<string, string> = {
  bold: isZh ? "加粗" : "Bold",
  italic: isZh ? "斜体" : "Italic",
  strikethrough: isZh ? "删除线" : "Strikethrough",
  code: isZh ? "行内代码" : "Inline Code",
  latex: isZh ? "数学公式" : "Math",
  link: isZh ? "链接" : "Link",
  highlight: isZh ? "高亮" : "Highlight",
  explain: isZh ? "AI 解释" : "AI Explain",
  translate: isZh ? "AI 翻译" : "AI Translate",
  polish: isZh ? "AI 润色" : "AI Polish",
  ask: isZh ? "AI 提问" : "AI Ask",
};

export const BUILT_IN_TOOLTIP_KEYS = ["bold", "italic", "strikethrough", "code", "latex", "link"];
