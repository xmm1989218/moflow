import type { ToolDefinition } from "./types";
import { invoke } from "@tauri-apps/api/core";

export const docToolDefinitions: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "outline",
      description:
        "获取文档的标题大纲，包含每个标题的层级和行号范围。用于了解文档整体结构。",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "grep",
      description:
        "在文档中搜索匹配正则表达式的行，返回匹配行内容及行号。最多返回 50 个匹配。",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "正则表达式模式",
          },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_lines",
      description:
        "读取文档中指定行号范围的内容。行号从 1 开始，最多返回 200 行。",
      parameters: {
        type: "object",
        properties: {
          start: {
            type: "number",
            description: "起始行号（从 1 开始）",
          },
          end: {
            type: "number",
            description: "结束行号（包含）",
          },
        },
        required: ["start", "end"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_section",
      description:
        "读取指定标题下的内容，直到同级或更高级标题为止。标题需精确匹配（不含 # 前缀）。",
      parameters: {
        type: "object",
          properties: {
            heading: {
              type: "string",
              description: "要读取的标题文本（不含 # 前缀）",
            },
          },
          required: ["heading"],
      },
    },
  },
];

export const networkToolDefinitions: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "webfetch",
      description:
        "访问指定 URL 的网页内容。支持三种格式：markdown（默认，HTML转Markdown结构化输出）、text（纯文本提取）、html（保留HTML结构）。仅支持 http/https 协议。图片 URL 自动返回 base64 数据。",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "要访问的网页 URL（仅支持 http/https）",
          },
          format: {
            type: "string",
            enum: ["markdown", "text", "html"],
            description: "返回格式：markdown=结构化Markdown（默认），text=纯文本，html=原始HTML",
          },
        },
        required: ["url"],
      },
    },
  },
];

export const WEBFETCH_LIMIT = 3;

const MAX_TOOL_RESULT_CHARS = 30 * 1024;
const MAX_GREP_RESULTS = 50;
const MAX_READ_LINES = 200;

function truncateResult(text: string): string {
  if (text.length <= MAX_TOOL_RESULT_CHARS) return text;
  return text.slice(0, MAX_TOOL_RESULT_CHARS) + "\n...[结果已截断]";
}

function toolOutline(docContent: string): string {
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

  if (headings.length === 0) {
    return "文档没有标题结构";
  }

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

function toolGrep(pattern: string, docContent: string): string {
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, "gm");
  } catch (e) {
    return `Invalid regex pattern: ${e instanceof Error ? e.message : String(e)}`;
  }

  const lines = docContent.split("\n");
  const matches: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i])) {
      matches.push(`${i + 1}: ${lines[i]}`);
      if (matches.length >= MAX_GREP_RESULTS) break;
    }
    regex.lastIndex = 0;
  }

  if (matches.length === 0) {
    return "No matches found";
  }

  const suffix =
    matches.length >= MAX_GREP_RESULTS
      ? `\n...(仅显示前 ${MAX_GREP_RESULTS} 个匹配)`
      : `\n${matches.length} matches found`;
  return matches.join("\n") + suffix;
}

function toolReadLines(
  start: number,
  end: number,
  docContent: string
): string {
  const lines = docContent.split("\n");
  const clampedStart = Math.max(1, Math.floor(start));
  const clampedEnd = Math.min(lines.length, Math.floor(end));
  const limitedEnd = Math.min(clampedEnd, clampedStart + MAX_READ_LINES - 1);

  if (clampedStart > lines.length) {
    return `文档只有 ${lines.length} 行，请求的起始行 ${start} 超出范围`;
  }

  const result: string[] = [];
  for (let i = clampedStart - 1; i < limitedEnd; i++) {
    result.push(`${i + 1}: ${lines[i]}`);
  }

  return result.join("\n");
}

function toolReadSection(heading: string, docContent: string): string {
  const lines = docContent.split("\n");
  const headingLower = heading.toLowerCase().trim();

  let startLine = -1;
  let headingLevel = 0;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+)/);
    if (match) {
      const level = match[1].length;
      const text = match[2].trim();
      if (text.toLowerCase() === headingLower) {
        startLine = i;
        headingLevel = level;
        break;
      }
    }
  }

  if (startLine === -1) {
    const available: string[] = [];
    for (const line of lines) {
      const match = line.match(/^(#{1,6})\s+(.+)/);
      if (match) available.push(match[2].trim());
    }
    if (available.length > 0) {
      return `Section not found: "${heading}"\nAvailable sections:\n${available.map((s) => `- ${s}`).join("\n")}`;
    }
    return `Section not found: "${heading}"\n文档没有标题结构`;
  }

  let endLine = lines.length;
  for (let i = startLine + 1; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+/);
    if (match && match[1].length <= headingLevel) {
      endLine = i;
      break;
    }
  }

  return lines.slice(startLine, endLine).join("\n");
}

async function toolWebFetch(url: string, format: string | undefined, signal: AbortSignal): Promise<string> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return `Unsupported URL protocol: ${parsed.protocol}. Only http and https are allowed.`;
    }
  } catch {
    return `Invalid URL: ${url}`;
  }

  if (signal.aborted) return "Request cancelled";

  try {
    const result = await invoke<string>("webfetch", { url, format: format || "markdown" });
    return result;
  } catch (e) {
    return `Fetch error: ${e}`;
  }
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  docContent: string,
  signal: AbortSignal
): Promise<string> {
  try {
    let result: string;
    switch (name) {
      case "outline":
        result = toolOutline(docContent);
        break;
      case "grep":
        result = toolGrep(String(args.pattern ?? ""), docContent);
        break;
      case "read_lines":
        result = toolReadLines(
          Number(args.start ?? 1),
          Number(args.end ?? 1),
          docContent
        );
        break;
      case "read_section":
        result = toolReadSection(String(args.heading ?? ""), docContent);
        break;
      case "webfetch":
        result = await toolWebFetch(String(args.url ?? ""), args.format != null ? String(args.format) : undefined, signal);
        break;
      default:
        return `Unknown tool: ${name}`;
    }
    return truncateResult(result);
  } catch (e) {
    return `Tool execution error: ${e instanceof Error ? e.message : String(e)}`;
  }
}
