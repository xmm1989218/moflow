export function estimateTokens(text: string): number {
  let zhCount = 0;
  for (const ch of text) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch)) zhCount++;
  }
  const zhRatio = text.length > 0 ? zhCount / text.length : 0;
  return zhRatio > 0.3 ? Math.ceil(text.length / 2) : Math.ceil(text.length / 4);
}

function extractStructure(docContent: string): string {
  const headings = docContent
    .split("\n")
    .filter((l) => /^#{1,6}\s/.test(l.trim()));
  if (headings.length === 0) return "";
  return "文档结构：\n" + headings.join("\n");
}

export function buildSystemPrompt(docContent: string, maxContext: number): string {
  const reserved = Math.floor(maxContext * 0.35);
  const availableDocTokens = maxContext - reserved;

  if (!docContent || docContent.trim().length === 0) {
    return "你是 MoFlow 编辑器的 AI 助手。用户当前没有打开文档内容，请直接回答用户的问题。";
  }

  const docTokens = estimateTokens(docContent);

  if (docTokens <= availableDocTokens) {
    return `你是 MoFlow 编辑器的 AI 助手。用户正在编辑以下 Markdown 文档：\n---\n${docContent}\n---\n请基于文档内容回答用户问题。`;
  }

  const zhCount = Array.from(docContent).filter((ch) =>
    /[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch)
  ).length;
  const zhRatio = docContent.length > 0 ? zhCount / docContent.length : 0;
  const charPerToken = zhRatio > 0.3 ? 2 : 4;
  const maxChars = availableDocTokens * charPerToken;

  const truncated = docContent.slice(0, maxChars);
  const structure = extractStructure(docContent);

  return `你是 MoFlow 编辑器的 AI 助手。用户正在编辑以下 Markdown 文档（内容已截断）：\n---\n${truncated}\n---\n${structure}\n---\n请基于文档内容回答用户问题。注意：文档内容较长，上方仅展示了部分内容。`;
}
