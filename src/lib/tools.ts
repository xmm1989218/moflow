import type { ToolDefinition } from "./types";
import { invoke } from "@tauri-apps/api/core";
import { readTextFile, readDir, exists, stat, writeFile, mkdir } from "@tauri-apps/plugin-fs";
import { join, dirname } from "@tauri-apps/api/path";
import { buildOutline } from "./contextBuilder";
import type { PermissionAction, PermissionRequest } from "./permission";
import { evaluateWithSession, generateAlwaysPattern, DEFAULT_PERMISSIONS } from "./permission";
import type { Permissions } from "./permission";
import { useSkillStore } from "../stores/skillStore";
import { loadSkillBody, listScriptFiles, executeSkillScript } from "./skillManager";
import { useThemeStore } from "../stores/themeStore";
import { useTabStore } from "../stores/appStore";

export type OnPermissionCallback = (request: PermissionRequest) => Promise<PermissionAction>;

export interface ToolContext {
  workspaceRoot?: string;
  activeFilePath?: string;
  docContent: string;
  permissions?: Permissions;
  sessionRules?: import("./permission").PermissionRule[];
  chatKey?: string;
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

function isPathInsideWorkspace(path: string, workspaceRoot: string): boolean {
  const normalizedPath = path.replace(/\\/g, "/");
  const normalizedRoot = workspaceRoot.replace(/\\/g, "/").replace(/\/$/, "");
  return normalizedPath.startsWith(normalizedRoot + "/") || normalizedPath === normalizedRoot;
}

function isAbsolutePath(p: string): boolean {
  if (/^[A-Za-z]:[\\/]/.test(p)) return true;
  if (p.startsWith("/")) return true;
  return false;
}

async function resolveAbsolutePath(path: string, workspaceRoot: string): Promise<string> {
  if (isAbsolutePath(path)) return path;
  return join(workspaceRoot, path);
}

async function allowFsScope(absPath: string): Promise<void> {
  try {
    await invoke("allow_paths", { paths: [absPath] });
  } catch { /* ignore if scope already allows */ }
}

async function checkPathAccess(
  absPath: string,
  workspaceRoot: string | undefined,
  ctx: ToolContext,
  onPermission?: OnPermissionCallback
): Promise<{ allowed: boolean; error?: string }> {
  if (!workspaceRoot) {
    return { allowed: false, error: "No workspace open. Cannot read other files. Omit path to use the current document." };
  }

  if (isPathInsideWorkspace(absPath, workspaceRoot)) {
    return { allowed: true };
  }

  const permissions = ctx.permissions ?? DEFAULT_PERMISSIONS;
  const sessionRules = ctx.sessionRules ?? [];
  const action = evaluateWithSession(sessionRules, permissions.externalPath, "externalPath", absPath);

  if (action === "allow") {
    await allowFsScope(absPath);
    return { allowed: true };
  }
  if (action === "deny") return { allowed: false, error: "Access denied: path is outside the workspace and permission was not granted" };

  if (!onPermission) {
    return { allowed: false, error: "Path is outside the workspace" };
  }

  const alwaysPattern = generateAlwaysPattern("externalPath", absPath);
  const userAction = await onPermission({
    permissionKey: "externalPath",
    input: absPath,
    alwaysPatterns: [alwaysPattern],
  });

  if (userAction === "allow") {
    await allowFsScope(absPath);
    return { allowed: true };
  }
  return { allowed: false, error: "Access denied: path is outside the workspace and permission was not granted" };
}

function makeOutlineTool(): ToolDefinition {
  return {
    type: "function",
    function: {
      name: "outline",
      description: "Get the heading outline of a document, including heading levels and line ranges. Useful for understanding document structure.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path (relative to workspace root). Omit to use the current document.",
          },
        },
        required: [],
      },
    },
  };
}

function makeReadTool(): ToolDefinition {
  return {
    type: "function",
    function: {
      name: "read",
      description: "Read file content, with optional line range. Line numbers start from 1, default max 200 lines.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path (relative to workspace root). Omit to use the current document.",
          },
          offset: {
            type: "number",
            description: "Starting line number (from 1, default 1)",
          },
          limit: {
            type: "number",
            description: "Maximum number of lines to return (default 200)",
          },
        },
        required: [],
      },
    },
  };
}

function makeReadSectionTool(): ToolDefinition {
  return {
    type: "function",
    function: {
      name: "readSection",
      description: "Read content under a specific heading, until a same-level or higher-level heading. Heading must match exactly (without # prefix).",
      parameters: {
        type: "object",
        properties: {
          heading: {
            type: "string",
            description: "Heading text to read (without # prefix)",
          },
          path: {
            type: "string",
            description: "File path (relative to workspace root). Omit to use the current document.",
          },
        },
        required: ["heading"],
      },
    },
  };
}

function makeGrepTool(): ToolDefinition {
  return {
    type: "function",
    function: {
      name: "grep",
      description: "Search for lines matching a regex pattern in a file, returning matching content with line numbers. Max 50 matches.",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "Regex pattern",
          },
          path: {
            type: "string",
            description: "File path (relative to workspace root). Omit to use the current document.",
          },
        },
        required: ["pattern"],
      },
    },
  };
}

function makeFindTool(): ToolDefinition {
  return {
    type: "function",
    function: {
      name: "find",
      description: "Search for files by name in the workspace (substring match), returning relative paths. Max 50 results.",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "Filename substring",
          },
        },
        required: ["pattern"],
      },
    },
  };
}

function makeGlobTool(): ToolDefinition {
  return {
    type: "function",
    function: {
      name: "glob",
      description: "Match file paths in the workspace by glob pattern. Supports *, **, ?. Max 50 results.",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "Glob pattern, e.g. **/*.md, src/**/*.ts",
          },
        },
        required: ["pattern"],
      },
    },
  };
}

function makeLsTool(): ToolDefinition {
  return {
    type: "function",
    function: {
      name: "ls",
      description: "List files and subdirectories in a directory. Omit path to list workspace root.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Directory path (relative to workspace root). Omit to list workspace root.",
          },
        },
        required: [],
      },
    },
  };
}

function makeWebfetchTool(): ToolDefinition {
  return {
    type: "function",
    function: {
      name: "webfetch",
      description: "Access web page content at a URL. Supports three formats: markdown, text, html. Only http/https.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "URL to access (http/https only)",
          },
          format: {
            type: "string",
            enum: ["markdown", "text", "html"],
            description: "Return format: markdown (default), text, html",
          },
        },
        required: ["url"],
      },
    },
  };
}

function makeWriteTool(): ToolDefinition {
  return {
    type: "function",
    function: {
      name: "write",
      description: "Create or overwrite a file. Path can be absolute or relative (to workspace root, or to the active file's directory if no workspace). Use this to create new files or save generated content.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path (absolute, or relative to workspace root / active file directory)",
          },
          content: {
            type: "string",
            description: "Complete file content to write",
          },
        },
        required: ["path", "content"],
      },
    },
  };
}

function makeEditTool(): ToolDefinition {
  return {
    type: "function",
    function: {
      name: "edit",
      description: "Replace text in an existing file. Provide the exact text to find (old_string) and the replacement (new_string). Use replace_all to replace all occurrences. Prefer edit over write for small changes — it uses fewer tokens.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path (absolute, or relative to workspace root / active file directory)",
          },
          old_string: {
            type: "string",
            description: "Exact text to find and replace",
          },
          new_string: {
            type: "string",
            description: "Replacement text",
          },
          replace_all: {
            type: "boolean",
            description: "Replace all occurrences of old_string (default: false, replaces only the first unique match)",
          },
        },
        required: ["path", "old_string", "new_string"],
      },
    },
  };
}

export function getFileToolDefinitions(): ToolDefinition[] {
  return [makeOutlineTool(), makeReadTool(), makeReadSectionTool()];
}

export function getGrepToolDefinition(): ToolDefinition {
  return makeGrepTool();
}

export function getProjectToolDefinitions(): ToolDefinition[] {
  return [makeFindTool(), makeGlobTool(), makeLsTool()];
}

export function getNetworkToolDefinitions(): ToolDefinition[] {
  return [makeWebfetchTool()];
}

export const WEBFETCH_LIMIT = 3;

export function getToolDefinitions(needsDocTools: boolean, workspaceRoot?: string | null, activeFilePath?: string | null): ToolDefinition[] {
  const tools: ToolDefinition[] = [makeWebfetchTool(), makeQuestionTool()];
  const fileDefs = [makeOutlineTool(), makeReadTool(), makeReadSectionTool()];
  const grepDef = makeGrepTool();
  const projectDefs = [makeFindTool(), makeGlobTool(), makeLsTool()];
  if (needsDocTools) {
    tools.push(...fileDefs, grepDef);
  }
  if (workspaceRoot) {
    if (!needsDocTools) tools.push(...fileDefs, grepDef);
    tools.push(...projectDefs, makeWriteTool(), makeEditTool());
  } else if (activeFilePath) {
    tools.push(...fileDefs, grepDef, makeWriteTool(), makeEditTool());
  }
  return tools;
}

async function resolveContent(
  path: string | undefined,
  ctx: ToolContext,
  onPermission?: OnPermissionCallback
): Promise<{ content: string; absPath?: string; error?: string }> {
  if (!path) {
    return { content: ctx.docContent };
  }

  if (!ctx.workspaceRoot) {
    let absPath: string;
    if (isAbsolutePath(path)) {
      absPath = path;
    } else if (ctx.activeFilePath) {
      absPath = await join(await dirname(ctx.activeFilePath), path);
    } else {
      return { content: "", error: "No workspace open and no active file. Cannot resolve relative path." };
    }

    const isCurrentFile = ctx.activeFilePath && absPath.replace(/\\/g, "/") === ctx.activeFilePath.replace(/\\/g, "/");

    if (!isCurrentFile) {
      const permissions = ctx.permissions ?? DEFAULT_PERMISSIONS;
      const sessionRules = ctx.sessionRules ?? [];
      const action = evaluateWithSession(sessionRules, permissions.externalPath, "externalPath", absPath);

      if (action === "deny") return { content: "", error: "Access denied: permission not granted" };
      if (action === "ask") {
        if (!onPermission) return { content: "", error: "Access denied: permission not granted" };
        const alwaysPattern = generateAlwaysPattern("externalPath", absPath);
        const userAction = await onPermission({
          permissionKey: "externalPath",
          input: absPath,
          alwaysPatterns: [alwaysPattern],
        });
        if (userAction === "deny") return { content: "", error: "Access denied: permission not granted" };
      }
    }

    await allowFsScope(absPath);

    if (!(await exists(absPath))) {
      return { content: "", error: `File not found: ${absPath}` };
    }

    try {
      const content = await readTextFile(absPath);
      return { content, absPath };
    } catch (e) {
      return { content: "", error: `Failed to read file: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  const absPath = await resolveAbsolutePath(path, ctx.workspaceRoot);
  const { allowed, error } = await checkPathAccess(absPath, ctx.workspaceRoot, ctx, onPermission);
  if (!allowed) {
    return { content: "", error: error ?? "Path is outside the workspace" };
  }

  if (!(await exists(absPath))) {
    return { content: "", error: `File not found: ${absPath}` };
  }

  try {
    const content = await readTextFile(absPath);
    return { content, absPath };
  } catch (e) {
    return { content: "", error: `Failed to read file: ${e instanceof Error ? e.message : String(e)}` };
  }
}

function toolOutline(docContent: string): string {
  const result = buildOutline(docContent);
  return result || "Document has no heading structure";
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
      ? "\n...(showing first " + MAX_GREP_RESULTS + " matches)"
      : `\n${matches.length} matches found`;
  return matches.join("\n") + suffix;
}

function toolRead(docContent: string, offset?: number, limit?: number): string {
  const lines = docContent.split("\n");
  const startLine = Math.max(1, Math.floor(offset ?? 1));
  const maxLines = Math.min(limit ?? MAX_READ_LINES, MAX_READ_LINES);
  const endLine = Math.min(lines.length, startLine + maxLines - 1);

  if (startLine > lines.length) {
    return `File has ${lines.length} lines, requested start line ${startLine} is out of range`;
  }

  const result: string[] = [];
  for (let i = startLine - 1; i < endLine; i++) {
    result.push(`${i + 1}: ${lines[i]}`);
  }

  if (endLine < lines.length) {
    result.push(`...(total ${lines.length} lines)`);
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
    return `Section not found: "${heading}"\nDocument has no heading structure`;
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
    return `No files matching "${pattern}" found`;
  }
  const suffix = results.length >= MAX_FIND_RESULTS
    ? "\n...(showing first " + MAX_FIND_RESULTS + " results)"
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
    return `No files matching "${pattern}" found`;
  }
  const suffix = results.length >= MAX_GLOB_RESULTS
    ? "\n...(showing first " + MAX_GLOB_RESULTS + " results)"
    : "";
  return results.join("\n") + suffix;
}

async function toolLs(dirPath: string | undefined, workspaceRoot: string, ctx: ToolContext, onPermission?: OnPermissionCallback): Promise<string> {
  const absDir = dirPath ? await resolveAbsolutePath(dirPath, workspaceRoot) : workspaceRoot;
  const { allowed, error } = await checkPathAccess(absDir, workspaceRoot, ctx, onPermission);
  if (!allowed) {
    return error ?? "Path is outside the workspace";
  }
  if (!(await exists(absDir))) {
    return `Directory not found: ${dirPath ?? "/"}`;
  }

  const dirStat = await stat(absDir);
  if (!dirStat.isDirectory) {
    return `Not a directory: ${dirPath ?? "/"}`;
  }

  let entries;
  try {
    entries = await readDir(absDir);
  } catch (e) {
    return `Failed to read directory: ${e instanceof Error ? e.message : String(e)}`;
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

async function resolvePathAndCheckWritePermission(
  path: string,
  workspaceRoot: string | undefined,
  activeFilePath: string | undefined,
  ctx: ToolContext,
  onPermission?: OnPermissionCallback,
  detail?: string,
): Promise<{ absPath?: string; error?: string }> {
  let absPath: string;

  if (isAbsolutePath(path)) {
    absPath = path;
  } else if (workspaceRoot) {
    absPath = await resolveAbsolutePath(path, workspaceRoot);
  } else if (activeFilePath) {
    absPath = await join(await dirname(activeFilePath), path);
  } else {
    return { error: "No workspace open and no active file. Please provide an absolute file path." };
  }

  if (workspaceRoot && !isPathInsideWorkspace(absPath, workspaceRoot)) {
    const { allowed, error } = await checkPathAccess(absPath, workspaceRoot, ctx, onPermission);
    if (!allowed) return { error: error ?? "Access denied: path is outside the workspace" };
  }

  const permissions = ctx.permissions ?? DEFAULT_PERMISSIONS;
  const sessionRules = ctx.sessionRules ?? [];
  const action = evaluateWithSession(sessionRules, permissions.edit, "edit", absPath);

  if (action === "deny") return { error: "Permission denied: edit not granted" };
  if (action === "ask") {
    if (!onPermission) return { error: "Permission denied: edit not granted" };
    const alwaysPattern = generateAlwaysPattern("edit", absPath);
    const userAction = await onPermission({
      permissionKey: "edit",
      input: absPath,
      alwaysPatterns: [alwaysPattern],
      detail,
    });
    if (userAction === "deny") return { error: "Permission denied: edit not granted" };
  }

  return { absPath };
}

function syncTabContent(absPath: string, content: string): void {
  const tabState = useTabStore.getState();
  const existingTab = tabState.files.find((f) => f.filePath === absPath);
  if (existingTab) {
    tabState.updateTabMeta(existingTab.id, {
      content,
      lastSavedContent: content,
      isModified: false,
      contentLoaded: true,
    });
  }
}

async function toolWrite(
  path: string,
  content: string,
  workspaceRoot: string | undefined,
  activeFilePath: string | undefined,
  ctx: ToolContext,
  onPermission?: OnPermissionCallback,
): Promise<string> {
  const detail = `write ${path} (${content.length} chars)`;
  const { absPath, error } = await resolvePathAndCheckWritePermission(path, workspaceRoot, activeFilePath, ctx, onPermission, detail);
  if (!absPath) return error ?? "Write error";

  try {
    await allowFsScope(absPath);

    const dir = await dirname(absPath);
    if (!(await exists(dir))) {
      await mkdir(dir, { recursive: true });
    }

    await writeFile(absPath, new TextEncoder().encode(content));
    syncTabContent(absPath, content);

    return "File written successfully.";
  } catch (e) {
    return `Write error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

async function toolEdit(
  path: string,
  oldString: string,
  newString: string,
  replaceAll: boolean,
  workspaceRoot: string | undefined,
  activeFilePath: string | undefined,
  ctx: ToolContext,
  onPermission?: OnPermissionCallback,
): Promise<string> {
  const truncate = (s: string) => s.length > 80 ? s.slice(0, 80) + "..." : s;
  const detail = `edit ${path}\n  old: "${truncate(oldString)}"\n  new: "${truncate(newString)}"`;
  const { absPath, error: permError } = await resolvePathAndCheckWritePermission(path, workspaceRoot, activeFilePath, ctx, onPermission, detail);
  if (!absPath) return permError ?? "Edit error";

  try {
    await allowFsScope(absPath);

    if (!(await exists(absPath))) {
      return `File not found: ${absPath}`;
    }

    const fileContent = await readTextFile(absPath);

    const exactMatches: number[] = [];
    let pos = 0;
    while (pos < fileContent.length) {
      const idx = fileContent.indexOf(oldString, pos);
      if (idx === -1) break;
      exactMatches.push(idx);
      pos = idx + 1;
    }

    const trimMatches: number[] = [];
    if (exactMatches.length === 0 && oldString.trimEnd() !== oldString) {
      const trimmed = oldString.trimEnd();
      pos = 0;
      while (pos < fileContent.length) {
        const idx = fileContent.indexOf(trimmed, pos);
        if (idx === -1) break;
        const after = fileContent.slice(idx + trimmed.length, idx + trimmed.length + (oldString.length - trimmed.length));
        if (after.trimEnd().length === 0) {
          trimMatches.push(idx);
        }
        pos = idx + 1;
      }
    }

    const matches = exactMatches.length > 0 ? exactMatches : trimMatches;
    const matchSource = exactMatches.length > 0 ? "exact" : "trailing-whitespace";

    if (matches.length === 0) {
      const lines = fileContent.split("\n");
      const lineNum = lines.findIndex((line) => line.includes(oldString.split("\n")[0]));
      const contextStart = Math.max(0, lineNum - 3);
      const contextEnd = Math.min(lines.length, lineNum + 7);
      const context = lines.slice(contextStart, contextEnd).map((l, i) => `${contextStart + i + 1}: ${l}`).join("\n");
      return `No match found for old_string in ${path}. The string you provided may not exist in the file exactly as written. Here is the surrounding context:\n${context}\n\nPlease try again with the exact text from the file, or use the read tool to view the file content first.`;
    }

    if (matches.length > 1 && !replaceAll) {
      return `Found ${matches.length} matches for old_string in ${path}. Use replace_all: true to replace all occurrences, or provide more surrounding text to make the match unique.`;
    }

    let newContent: string;
    if (replaceAll || matches.length === 1) {
      const matchStr = matchSource === "exact" ? oldString : oldString.trimEnd();
      newContent = fileContent.split(matchStr).join(newString);
    } else {
      const matchStr = matchSource === "exact" ? oldString : oldString.trimEnd();
      newContent = fileContent.replace(matchStr, newString);
    }

    await writeFile(absPath, new TextEncoder().encode(newContent));
    syncTabContent(absPath, newContent);

    const countLabel = matches.length > 1 ? ` (${matches.length} replacements)` : "";
    return `Edit applied successfully.${countLabel}`;
  } catch (e) {
    return `Edit error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

export function makeQuestionTool(): ToolDefinition {
  return {
    type: "function",
    function: {
      name: "question",
      description: "Ask the user one or more questions with predefined options to make a decision. Use this tool ONLY when you have clear, distinct options for the user to choose from. For open-ended questions or discussion, just ask in your response text directly — do NOT use this tool.",
      parameters: {
        type: "object",
        properties: {
          questions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                question: {
                  type: "string",
                  description: "The question to ask the user",
                },
                options: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      label: {
                        type: "string",
                        description: "Short option label (5 words max)",
                      },
                      description: {
                        type: "string",
                        description: "Brief explanation of this option",
                      },
                    },
                    required: ["label"],
                  },
                  description: "Available options for the user to choose from. Must have at least 2 options.",
                },
                multiple: {
                  type: "boolean",
                  description: "Whether the user can select multiple options. Default: false.",
                },
              },
              required: ["question", "options"],
            },
            description: "List of questions to ask the user. Each question must have at least 2 options.",
          },
        },
        required: ["questions"],
      },
    },
  };
}

export interface QuestionOption {
  label: string;
  description?: string;
}

export interface QuestionItem {
  question: string;
  options: QuestionOption[];
  multiple: boolean;
}

export function makeSkillTool(): ToolDefinition {
  return {
    type: "function",
    function: {
      name: "skill",
      description: "Load a skill's instructions into context by name. Skill names must match those listed in the available_skills section of the system prompt.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Skill name as listed in available_skills",
          },
        },
        required: ["name"],
      },
    },
  };
}

export function makeRunSkillScriptTool(): ToolDefinition {
  return {
    type: "function",
    function: {
      name: "runSkillScript",
      description: "Run a .ts or .js script from a skill's scripts/ directory. You must first use the \"skill\" tool to load the skill before running its scripts. The script parameter must be in skillName/scriptName format (e.g. 'markdown-to-ppt/convert.js'). In args, use ${VAR_NAME} placeholders for environment variables — they will be resolved before execution. Available variables are listed when you load the skill. This tool only runs skill scripts, not shell commands. After a successful execution, you MUST report the output to the user and STOP. Do NOT retry or modify the command.",
      parameters: {
        type: "object",
        properties: {
          script: {
            type: "string",
            description: "Script name in skillName/scriptName format (e.g. 'markdown-to-ppt/convert.js'). Must match a script listed when you loaded the skill.",
          },
          args: {
            type: "string",
            description: "Space-separated arguments to pass to the script. Use ${VAR_NAME} placeholders for environment variables — they will be resolved before execution. Example: '${MOFLOW_ACTIVE_FILE} --html'",
          },
        },
        required: ["script"],
      },
    },
  };
}

export function shouldAddRunSkillScriptTool(): boolean {
  const skills = useSkillStore.getState().discoveredSkills.filter((s) => s.enabled);
  const withScripts = skills.filter((s) => s.hasScripts);
  const result = withScripts.length > 0;
  return result;
}

async function toolSkill(name: string): Promise<string> {
  if (!name) return "Skill name is required";

  const skill = useSkillStore.getState().discoveredSkills.find((s) => s.name === name);
  if (!skill) return `Unknown skill: ${name}`;
  if (!skill.enabled) return `Skill disabled: ${name}`;

  try {
    const body = await loadSkillBody(name);
    const scripts = await listScriptFiles(name);
    const parts = [body];
    if (scripts.length > 0) {
      parts.push("\n\nAvailable scripts (use with runSkillScript):");
      for (const f of scripts) parts.push(`- ${name}/${f}`);
    }
    const result = parts.join("\n");
    return result;
  } catch (e) {
    return `Failed to load skill "${name}": ${e instanceof Error ? e.message : String(e)}`;
  }
}

function resolveEnvVars(args: string, ctx: ToolContext, userEnv?: Record<string, string>): string {
  return args.replace(/\$\{(\w+)\}/g, (_, key) => {
    if (key === "MOFLOW_WORKSPACE_ROOT" && ctx.workspaceRoot) return ctx.workspaceRoot;
    if (key === "MOFLOW_ACTIVE_FILE" && ctx.activeFilePath) return ctx.activeFilePath;
    if (userEnv && userEnv[key]) return userEnv[key];
    return `\${${key}}`;
  });
}

async function toolRunSkillScript(
  script: string,
  args: string,
  ctx: ToolContext,
  onPermission?: OnPermissionCallback,
): Promise<string> {
  const slashIdx = script.indexOf("/");
  if (slashIdx === -1) return `Invalid script format: "${script}". Must be skillName/scriptName (e.g. 'markdown-to-ppt/convert.js').`;

  const skillName = script.slice(0, slashIdx);
  const scriptName = script.slice(slashIdx + 1);

  const skill = useSkillStore.getState().discoveredSkills.find((s) => s.name === skillName);
  if (!skill) return `Unknown skill: ${skillName}`;
  if (!skill.enabled) return `Skill disabled: ${skillName}`;

  const scripts = await listScriptFiles(skillName);
  if (!scripts.includes(scriptName)) return `Script not found: ${scriptName}. Available scripts: ${scripts.map((s) => `${skillName}/${s}`).join(", ")}`;

  const permissions = ctx.permissions ?? DEFAULT_PERMISSIONS;
  const sessionRules = ctx.sessionRules ?? [];
  const action = evaluateWithSession(sessionRules, permissions.runSkillScript, "runSkillScript", skillName);

  if (action === "deny") {
    return `Skill script execution for "${skillName}" was denied`;
  }
  if (action === "ask" && onPermission) {
    const alwaysPattern = generateAlwaysPattern("runSkillScript", skillName);
    const userAction = await onPermission({
      permissionKey: "runSkillScript",
      input: skillName,
      alwaysPatterns: [alwaysPattern],
      detail: `${script} ${args}`.trim(),
    });
    if (userAction === "deny") {
      return `Skill script execution for "${skillName}" was denied`;
    }
  }

  let cwd: string | undefined;
  if (ctx.activeFilePath) {
    cwd = await dirname(ctx.activeFilePath);
  } else if (ctx.workspaceRoot) {
    cwd = ctx.workspaceRoot;
  }

  try {
    const envVars = useThemeStore.getState().envVars ?? {};
    const resolvedArgs = resolveEnvVars(args, ctx, envVars);
    const mergedEnv: Record<string, string> = { ...envVars };
    if (ctx.workspaceRoot) mergedEnv.MOFLOW_WORKSPACE_ROOT = ctx.workspaceRoot;
    if (ctx.activeFilePath) mergedEnv.MOFLOW_ACTIVE_FILE = ctx.activeFilePath;
    const result = await executeSkillScript(skillName, scriptName, resolvedArgs, mergedEnv, cwd);
    return truncateResult(result);
  } catch (e) {
    return `Script execution error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  signal: AbortSignal,
  ctx: ToolContext,
  onPermission?: OnPermissionCallback
): Promise<string> {
  try {
    let result: string;

    switch (name) {
      case "outline": {
        const { content, error } = await resolveContent(args.path as string | undefined, ctx, onPermission);
        if (error) return error;
        result = toolOutline(content);
        break;
      }
      case "read": {
        const { content, error } = await resolveContent(args.path as string | undefined, ctx, onPermission);
        if (error) return error;
        result = toolRead(content, args.offset as number | undefined, args.limit as number | undefined);
        break;
      }
      case "readSection": {
        const { content, error } = await resolveContent(args.path as string | undefined, ctx, onPermission);
        if (error) return error;
        result = toolReadSection(String(args.heading ?? ""), content);
        break;
      }
      case "grep": {
        const { content, error } = await resolveContent(args.path as string | undefined, ctx, onPermission);
        if (error) return error;
        result = toolGrep(String(args.pattern ?? ""), content);
        break;
      }
      case "find": {
        if (!ctx.workspaceRoot) {
          return "No workspace open, cannot use find";
        }
        result = await toolFind(String(args.pattern ?? ""), ctx.workspaceRoot);
        break;
      }
      case "glob": {
        if (!ctx.workspaceRoot) {
          return "No workspace open, cannot use glob";
        }
        result = await toolGlob(String(args.pattern ?? ""), ctx.workspaceRoot);
        break;
      }
      case "ls": {
        if (!ctx.workspaceRoot) {
          return "No workspace open, cannot use ls";
        }
        result = await toolLs(args.path as string | undefined, ctx.workspaceRoot, ctx, onPermission);
        break;
      }
      case "webfetch": {
        result = await toolWebFetch(String(args.url ?? ""), args.format != null ? String(args.format) : undefined, signal);
        break;
      }
      case "write": {
        result = await toolWrite(String(args.path ?? ""), String(args.content ?? ""), ctx.workspaceRoot, ctx.activeFilePath, ctx, onPermission);
        break;
      }
      case "edit": {
        result = await toolEdit(String(args.path ?? ""), String(args.old_string ?? ""), String(args.new_string ?? ""), args.replace_all === true, ctx.workspaceRoot, ctx.activeFilePath, ctx, onPermission);
        break;
      }
      case "skill": {
        result = await toolSkill(String(args.name ?? ""));
        break;
      }
      case "runSkillScript": {
        result = await toolRunSkillScript(String(args.script ?? ""), String(args.args ?? ""), ctx, onPermission);
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
