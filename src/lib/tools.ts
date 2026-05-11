import type { ToolDefinition } from "./types";
import { invoke } from "@tauri-apps/api/core";
import { readTextFile, readDir, exists, stat } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { buildOutline } from "./contextBuilder";
import { t, isZh } from "./i18n";

export interface ToolContext {
  workspaceRoot?: string;
  docContent: string;
}

const MAX_TOOL_RESULT_CHARS = 30 * 1024;
const MAX_GREP_RESULTS = 50;
const MAX_READ_LINES = 200;
const MAX_FIND_RESULTS = 50;
const MAX_GLOB_RESULTS = 50;

function truncateResult(text: string): string {
  if (text.length <= MAX_TOOL_RESULT_CHARS) return text;
  return text.slice(0, MAX_TOOL_RESULT_CHARS) + "\n...[truncated]";
}

function isPathAllowed(path: string, workspaceRoot: string): boolean {
  const normalizedPath = path.replace(/\\/g, "/");
  const normalizedRoot = workspaceRoot.replace(/\\/g, "/").replace(/\/$/, "");
  return normalizedPath.startsWith(normalizedRoot + "/") || normalizedPath === normalizedRoot;
}

function des(zh: string, en: string): string {
  return isZh ? zh : en;
}

const outlineTool: ToolDefinition = {
  type: "function",
  function: {
    name: "outline",
    description: des("获取文档的标题大纲，包含每个标题的层级和行号范围。用于了解文档整体结构。", "Get the heading outline of a document, including heading levels and line ranges. Useful for understanding document structure."),
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: des("文件路径（相对于工作区根目录）。省略则使用当前文档。", "File path (relative to workspace root). Omit to use the current document."),
        },
      },
      required: [],
    },
  },
};

const readTool: ToolDefinition = {
  type: "function",
  function: {
    name: "read",
    description: des("读取文件内容，支持指定行号范围。行号从 1 开始，默认最多返回 200 行。", "Read file content, with optional line range. Line numbers start from 1, default max 200 lines."),
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: des("文件路径（相对于工作区根目录）。省略则使用当前文档。", "File path (relative to workspace root). Omit to use the current document."),
        },
        offset: {
          type: "number",
          description: des("起始行号（从 1 开始，默认 1）", "Starting line number (from 1, default 1)"),
        },
        limit: {
          type: "number",
          description: des("返回的最大行数（默认 200）", "Maximum number of lines to return (default 200)"),
        },
      },
      required: [],
    },
  },
};

const readSectionTool: ToolDefinition = {
  type: "function",
  function: {
    name: "read_section",
    description: des("读取指定标题下的内容，直到同级或更高级标题为止。标题需精确匹配（不含 # 前缀）。", "Read content under a specific heading, until a same-level or higher-level heading. Heading must match exactly (without # prefix)."),
    parameters: {
      type: "object",
      properties: {
        heading: {
          type: "string",
          description: des("要读取的标题文本（不含 # 前缀）", "Heading text to read (without # prefix)"),
        },
        path: {
          type: "string",
          description: des("文件路径（相对于工作区根目录）。省略则使用当前文档。", "File path (relative to workspace root). Omit to use the current document."),
        },
      },
      required: ["heading"],
    },
  },
};

const grepTool: ToolDefinition = {
  type: "function",
  function: {
    name: "grep",
    description: des("在文件中搜索匹配正则表达式的行，返回匹配行内容及行号。最多返回 50 个匹配。", "Search for lines matching a regex pattern in a file, returning matching content with line numbers. Max 50 matches."),
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: des("正则表达式模式", "Regex pattern"),
        },
        path: {
          type: "string",
          description: des("文件路径（相对于工作区根目录）。省略则使用当前文档。", "File path (relative to workspace root). Omit to use the current document."),
        },
      },
      required: ["pattern"],
    },
  },
};

const findTool: ToolDefinition = {
  type: "function",
  function: {
    name: "find",
    description: des("在工作区中按文件名搜索文件（子串匹配），返回匹配的相对路径。最多返回 50 个结果。", "Search for files by name in the workspace (substring match), returning relative paths. Max 50 results."),
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: des("文件名子串", "Filename substring"),
        },
      },
      required: ["pattern"],
    },
  },
};

const globTool: ToolDefinition = {
  type: "function",
  function: {
    name: "glob",
    description: des("在工作区中按 glob 模式匹配文件路径。支持 *（任意非路径分隔符字符）、**（任意层级目录）、?（单个字符）。最多返回 50 个结果。", "Match file paths in the workspace by glob pattern. Supports * (any non-separator chars), ** (any depth), ? (single char). Max 50 results."),
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: des("Glob 模式，如 **/*.md、src/**/*.ts", "Glob pattern, e.g. **/*.md, src/**/*.ts"),
        },
      },
      required: ["pattern"],
    },
  },
};

const lsTool: ToolDefinition = {
  type: "function",
  function: {
    name: "ls",
    description: des("列出目录下的文件和子目录。省略路径则列出工作区根目录。", "List files and subdirectories in a directory. Omit path to list workspace root."),
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: des("目录路径（相对于工作区根目录）。省略则列出工作区根目录。", "Directory path (relative to workspace root). Omit to list workspace root."),
        },
      },
      required: [],
    },
  },
};

export const webfetchTool: ToolDefinition = {
  type: "function",
  function: {
    name: "webfetch",
    description: des("访问指定 URL 的网页内容。支持三种格式：markdown（默认）、text（纯文本）、html（保留HTML结构）。仅支持 http/https 协议。", "Access web page content at a URL. Supports three formats: markdown (default), text (plain text), html (preserve HTML). Only http/https."),
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: des("要访问的网页 URL（仅支持 http/https）", "URL to access (http/https only)"),
        },
        format: {
          type: "string",
          enum: ["markdown", "text", "html"],
          description: des("返回格式：markdown（默认）、text、html", "Return format: markdown (default), text, html"),
        },
      },
      required: ["url"],
    },
  },
};

export const fileToolDefinitions: ToolDefinition[] = [outlineTool, readTool, readSectionTool];
export const grepToolDefinition: ToolDefinition = grepTool;
export const projectToolDefinitions: ToolDefinition[] = [findTool, globTool, lsTool];
export const networkToolDefinitions: ToolDefinition[] = [webfetchTool];

export const WEBFETCH_LIMIT = 3;

export function getToolDefinitions(needsDocTools: boolean, workspaceRoot?: string | null): ToolDefinition[] {
  const tools: ToolDefinition[] = [...networkToolDefinitions];
  if (needsDocTools) {
    tools.push(...fileToolDefinitions, grepToolDefinition);
  }
  if (workspaceRoot) {
    if (!needsDocTools) tools.push(...fileToolDefinitions, grepToolDefinition);
    tools.push(...projectToolDefinitions);
  }
  return tools;
}

async function resolveContent(
  path: string | undefined,
  ctx: ToolContext
): Promise<{ content: string; absPath?: string; error?: string }> {
  if (!path) {
    return { content: ctx.docContent };
  }

  if (!ctx.workspaceRoot) {
    return { content: "", error: isZh ? "当前未打开工作区，无法读取其他文件。请省略 path 参数以使用当前文档。" : "No workspace open. Cannot read other files. Omit path to use the current document." };
  }

  const absPath = await join(ctx.workspaceRoot, path);
  if (!isPathAllowed(absPath, ctx.workspaceRoot)) {
    return { content: "", error: isZh ? "路径超出工作区范围" : "Path is outside the workspace" };
  }

  if (!(await exists(absPath))) {
    return { content: "", error: isZh ? `文件不存在: ${path}` : `File not found: ${path}` };
  }

  try {
    const content = await readTextFile(absPath);
    return { content, absPath };
  } catch (e) {
    return { content: "", error: isZh ? `读取文件失败: ${e instanceof Error ? e.message : String(e)}` : `Failed to read file: ${e instanceof Error ? e.message : String(e)}` };
  }
}

function toolOutline(docContent: string): string {
  const result = buildOutline(docContent);
  return result || t("文档没有标题结构", "Document has no heading structure");
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
      ? isZh ? `\n...(仅显示前 ${MAX_GREP_RESULTS} 个匹配)` : `\n...(showing first ${MAX_GREP_RESULTS} matches)`
      : `\n${matches.length} matches found`;
  return matches.join("\n") + suffix;
}

function toolRead(docContent: string, offset?: number, limit?: number): string {
  const lines = docContent.split("\n");
  const startLine = Math.max(1, Math.floor(offset ?? 1));
  const maxLines = Math.min(limit ?? MAX_READ_LINES, MAX_READ_LINES);
  const endLine = Math.min(lines.length, startLine + maxLines - 1);

  if (startLine > lines.length) {
    return isZh
      ? `文件只有 ${lines.length} 行，请求的起始行 ${startLine} 超出范围`
      : `File has ${lines.length} lines, requested start line ${startLine} is out of range`;
  }

  const result: string[] = [];
  for (let i = startLine - 1; i < endLine; i++) {
    result.push(`${i + 1}: ${lines[i]}`);
  }

  if (endLine < lines.length) {
    result.push(isZh ? `...(共 ${lines.length} 行)` : `...(total ${lines.length} lines)`);
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
      return `Section not found: "${heading}"\n${isZh ? "可用标题" : "Available sections"}:\n${available.map((s) => `- ${s}`).join("\n")}`;
    }
    return `Section not found: "${heading}"\n${isZh ? "文档没有标题结构" : "Document has no heading structure"}`;
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

async function toolFind(pattern: string, workspaceRoot: string): Promise<string> {
  const patternLower = pattern.toLowerCase();
  const results: string[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 3 || results.length >= MAX_FIND_RESULTS) return;
    let entries;
    try {
      entries = await readDir(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= MAX_FIND_RESULTS) return;
      if (entry.name.startsWith(".")) continue;
      const entryPath = await join(dir, entry.name);
      if (entry.isDirectory) {
        if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "assets") continue;
        await walk(entryPath, depth + 1);
      } else {
        if (entry.name.toLowerCase().includes(patternLower)) {
          const rel = entryPath.replace(workspaceRoot.replace(/\\/g, "/").replace(/\/$/, "") + "/", "").replace(/\\/g, "/");
          results.push(rel);
        }
      }
    }
  }

  await walk(workspaceRoot, 0);

  if (results.length === 0) {
    return isZh ? `未找到匹配 "${pattern}" 的文件` : `No files matching "${pattern}" found`;
  }
  const suffix = results.length >= MAX_FIND_RESULTS
    ? isZh ? `\n...(仅显示前 ${MAX_FIND_RESULTS} 个结果)` : `\n...(showing first ${MAX_FIND_RESULTS} results)`
    : "";
  return results.join("\n") + suffix;
}

function globMatch(pattern: string, path: string): boolean {
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "{{GLOBSTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/\{\{GLOBSTAR\}\}/g, ".*");
  try {
    return new RegExp(`^${regexStr}$`).test(path);
  } catch {
    return false;
  }
}

async function toolGlob(pattern: string, workspaceRoot: string): Promise<string> {
  const results: string[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (results.length >= MAX_GLOB_RESULTS) return;
    let entries;
    try {
      entries = await readDir(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= MAX_GLOB_RESULTS) return;
      if (entry.name.startsWith(".")) continue;
      const entryPath = await join(dir, entry.name);
      const rel = entryPath.replace(workspaceRoot.replace(/\\/g, "/").replace(/\/$/, "") + "/", "").replace(/\\/g, "/");
      if (entry.isDirectory) {
        if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "assets") continue;
        await walk(entryPath, depth + 1);
      } else {
        if (globMatch(pattern, rel)) {
          results.push(rel);
        }
      }
    }
  }

  await walk(workspaceRoot, 0);

  if (results.length === 0) {
    return isZh ? `未找到匹配 "${pattern}" 的文件` : `No files matching "${pattern}" found`;
  }
  const suffix = results.length >= MAX_GLOB_RESULTS
    ? isZh ? `\n...(仅显示前 ${MAX_GLOB_RESULTS} 个结果)` : `\n...(showing first ${MAX_GLOB_RESULTS} results)`
    : "";
  return results.join("\n") + suffix;
}

async function toolLs(dirPath: string | undefined, workspaceRoot: string): Promise<string> {
  const absDir = dirPath ? await join(workspaceRoot, dirPath) : workspaceRoot;
  if (!isPathAllowed(absDir, workspaceRoot)) {
    return isZh ? "路径超出工作区范围" : "Path is outside the workspace";
  }
  if (!(await exists(absDir))) {
    return isZh ? `目录不存在: ${dirPath ?? "/"}` : `Directory not found: ${dirPath ?? "/"}`;
  }

  const dirStat = await stat(absDir);
  if (!dirStat.isDirectory) {
    return isZh ? `不是目录: ${dirPath ?? "/"}` : `Not a directory: ${dirPath ?? "/"}`;
  }

  let entries;
  try {
    entries = await readDir(absDir);
  } catch (e) {
    return isZh ? `读取目录失败: ${e instanceof Error ? e.message : String(e)}` : `Failed to read directory: ${e instanceof Error ? e.message : String(e)}`;
  }

  const sorted = entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const lines = sorted.map((e) => {
    const type = e.isDirectory ? "/" : "";
    return `${e.name}${type}`;
  });

  return lines.join("\n");
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
  signal: AbortSignal,
  ctx: ToolContext
): Promise<string> {
  try {
    let result: string;

    switch (name) {
      case "outline": {
        const { content, error } = await resolveContent(args.path as string | undefined, ctx);
        if (error) return error;
        result = toolOutline(content);
        break;
      }
      case "read": {
        const { content, error } = await resolveContent(args.path as string | undefined, ctx);
        if (error) return error;
        result = toolRead(content, args.offset as number | undefined, args.limit as number | undefined);
        break;
      }
      case "read_section": {
        const { content, error } = await resolveContent(args.path as string | undefined, ctx);
        if (error) return error;
        result = toolReadSection(String(args.heading ?? ""), content);
        break;
      }
      case "grep": {
        const { content, error } = await resolveContent(args.path as string | undefined, ctx);
        if (error) return error;
        result = toolGrep(String(args.pattern ?? ""), content);
        break;
      }
      case "find": {
        if (!ctx.workspaceRoot) {
          return isZh ? "当前未打开工作区，无法使用 find 命令" : "No workspace open, cannot use find";
        }
        result = await toolFind(String(args.pattern ?? ""), ctx.workspaceRoot);
        break;
      }
      case "glob": {
        if (!ctx.workspaceRoot) {
          return isZh ? "当前未打开工作区，无法使用 glob 命令" : "No workspace open, cannot use glob";
        }
        result = await toolGlob(String(args.pattern ?? ""), ctx.workspaceRoot);
        break;
      }
      case "ls": {
        if (!ctx.workspaceRoot) {
          return isZh ? "当前未打开工作区，无法使用 ls 命令" : "No workspace open, cannot use ls";
        }
        result = await toolLs(args.path as string | undefined, ctx.workspaceRoot);
        break;
      }
      case "webfetch": {
        result = await toolWebFetch(String(args.url ?? ""), args.format != null ? String(args.format) : undefined, signal);
        break;
      }
      default:
        return `Unknown tool: ${name}`;
    }

    return truncateResult(result);
  } catch (e) {
    return `Tool execution error: ${e instanceof Error ? e.message : String(e)}`;
  }
}
