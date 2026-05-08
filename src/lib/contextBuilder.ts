export function estimateTokens(text: string): number {
  let zhCount = 0;
  for (const ch of text) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch)) zhCount++;
  }
  const zhRatio = text.length > 0 ? zhCount / text.length : 0;
  return zhRatio > 0.3 ? Math.ceil(text.length / 2) : Math.ceil(text.length / 4);
}

export function buildOutline(docContent: string): string {
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
  needsDocTools: boolean;
}

import { isZh } from "./i18n";

const webfetchInstructionZh = `你可以使用 webfetch(url, format?) 访问网页内容来获取外部信息或参考资料。format 参数可选：markdown（默认，HTML转Markdown结构化输出）、text（纯文本提取）、html（保留HTML结构）。图片 URL 自动返回 base64 数据。如果文档内容已足够回答，不需要使用此工具。`;
const webfetchInstructionEn = `You can use webfetch(url, format?) to access web page content for external information or references. Optional format parameter: markdown (default, HTML to structured Markdown), text (plain text extraction), html (preserve HTML structure). Image URLs automatically return base64 data. If the document content is sufficient to answer, there is no need to use this tool.`;

export function buildSystemPrompt(
  docContent: string,
  maxContext: number,
  needsDocTools: boolean = false
): SystemPromptResult {
  const docRatio = needsDocTools ? 0.50 : 0.65;
  const reserved = Math.floor(maxContext * (1 - docRatio));
  const availableDocTokens = maxContext - reserved;

  if (!docContent || docContent.trim().length === 0) {
    return {
      prompt: isZh
        ? `你是 MoFlow 编辑器的 AI 助手。用户当前没有打开文档内容，请直接回答用户的问题。\n\n${webfetchInstructionZh}`
        : `You are the AI assistant for MoFlow editor. The user has no document open. Please answer their questions directly.\n\n${webfetchInstructionEn}`,
      needsDocTools: false,
    };
  }

  const docTokens = estimateTokens(docContent);

  if (docTokens <= availableDocTokens) {
    return {
      prompt: isZh
        ? `你是 MoFlow 编辑器的 AI 助手。用户正在编辑以下 Markdown 文档：\n---\n${docContent}\n---\n请基于文档内容回答用户问题。\n\n${webfetchInstructionZh}`
        : `You are the AI assistant for MoFlow editor. The user is editing the following Markdown document:\n---\n${docContent}\n---\nPlease answer the user's questions based on the document content.\n\n${webfetchInstructionEn}`,
      needsDocTools: false,
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
- webfetch(url, format?) — 访问网页内容获取外部信息（format: markdown/text/html）

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
- webfetch(url, format?) — Access web page content for external information (format: markdown/text/html)

When the user's question involves content beyond the truncated section, please proactively use tools to find the relevant information instead of guessing.`;

  return { prompt, needsDocTools: true };
}
