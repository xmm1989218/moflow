export function estimateTokens(text: string): number {
  let zhCount = 0;
  for (const ch of text) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch)) zhCount++;
  }
  const zhRatio = text.length > 0 ? zhCount / text.length : 0;
  return zhRatio > 0.3 ? Math.ceil(text.length / 2) : Math.ceil(text.length / 4);
}

function buildOutline(docContent: string): string {
  const lines = docContent.split("\n");
  const headings: { level: number; text: string; line: number }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+)/);
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
        line: i + 1,
      });
    }
  }

  if (headings.length === 0) return "";

  const result: string[] = [];
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    const nextLine =
      i + 1 < headings.length
        ? headings[i + 1].line - 1
        : lines.length;
    const indent = "  ".repeat(h.level - 1);
    result.push(`${indent}${h.text} (L${h.line}-${nextLine})`);
  }

  return result.join("\n");
}

export interface SystemPromptResult {
  prompt: string;
  needsTools: boolean;
}

const isZh = navigator.language.startsWith("zh");

export function buildSystemPrompt(
  docContent: string,
  maxContext: number,
  toolsAvailable: boolean = false
): SystemPromptResult {
  const docRatio = toolsAvailable ? 0.50 : 0.65;
  const reserved = Math.floor(maxContext * (1 - docRatio));
  const availableDocTokens = maxContext - reserved;

  if (!docContent || docContent.trim().length === 0) {
    return {
      prompt: isZh
        ? "你是 MoFlow 编辑器的 AI 助手。用户当前没有打开文档内容，请直接回答用户的问题。"
        : "You are the AI assistant for MoFlow editor. The user has no document open. Please answer their questions directly.",
      needsTools: false,
    };
  }

  const docTokens = estimateTokens(docContent);

  if (docTokens <= availableDocTokens) {
    return {
      prompt: isZh
        ? `你是 MoFlow 编辑器的 AI 助手。用户正在编辑以下 Markdown 文档：\n---\n${docContent}\n---\n请基于文档内容回答用户问题。`
        : `You are the AI assistant for MoFlow editor. The user is editing the following Markdown document:\n---\n${docContent}\n---\nPlease answer the user's questions based on the document content.`,
      needsTools: false,
    };
  }

  const zhCount = Array.from(docContent).filter((ch) =>
    /[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch)
  ).length;
  const zhRatio = docContent.length > 0 ? zhCount / docContent.length : 0;
  const charPerToken = zhRatio > 0.3 ? 2 : 4;
  const maxChars = availableDocTokens * charPerToken;

  const truncated = docContent.slice(0, maxChars);
  const outline = buildOutline(docContent);

  const prompt = isZh
    ? `你是 MoFlow 编辑器的 AI 助手。用户正在编辑以下 Markdown 文档（内容较长，仅展示开头部分）：

---文档内容（截断）---
${truncated}
---

---文档结构---
${outline}
---

你可以使用以下工具来探索文档的完整内容：
- outline() — 获取完整的标题大纲及行号范围
- grep(pattern) — 搜索文档，返回匹配行及行号
- read_lines(start, end) — 读取指定行号范围的内容
- read_section(heading) — 读取指定标题下的内容

当用户的问题涉及截断部分的内容时，请主动使用工具查找相关信息，而不是猜测。`
    : `You are the AI assistant for MoFlow editor. The user is editing the following Markdown document (long content, only the beginning is shown):

---Document content (truncated)---
${truncated}
---

---Document structure---
${outline}
---

You can use the following tools to explore the full document content:
- outline() — Get the complete heading outline with line ranges
- grep(pattern) — Search the document, returning matching lines with line numbers
- read_lines(start, end) — Read a range of lines by line number
- read_section(heading) — Read content under a specific heading

When the user's question involves content beyond the truncated section, please proactively use tools to find the relevant information instead of guessing.`;

  return { prompt, needsTools: true };
}
