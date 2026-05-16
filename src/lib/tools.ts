import type { ToolDefinition } from "./types";
import { invoke } from "@tauri-apps/api/core";
import { readTextFile, readDir, exists, stat } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { buildOutline } from "./contextBuilder";
import { t } from "../i18n/core";
import type { PermissionAction, PermissionRequest } from "./permission";
import { evaluateWithSession, generateAlwaysPattern, DEFAULT_PERMISSIONS } from "./permission";
import type { Permissions } from "./permission";
import { useSkillStore } from "../stores/skillStore";
import { loadSkillBody, listScriptFiles, executeSkillScript } from "./skillManager";
import { useThemeStore } from "../stores/themeStore";

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
    return { allowed: false, error: t("ai.tool.error.noWorkspace") };
  }

  if (isPathInsideWorkspace(absPath, workspaceRoot)) {
    return { allowed: true };
  }

  const permissions = ctx.permissions ?? DEFAULT_PERMISSIONS;
  const sessionRules = ctx.sessionRules ?? [];
  const action = evaluateWithSession(sessionRules, permissions.external_path, "external_path", absPath);

  if (action === "allow") {
    await allowFsScope(absPath);
    return { allowed: true };
  }
  if (action === "deny") return { allowed: false, error: t("ai.tool.error.pathDenied") };

  if (!onPermission) {
    return { allowed: false, error: t("ai.tool.error.pathOutsideWorkspace") };
  }

  const alwaysPattern = generateAlwaysPattern("external_path", absPath);
  const userAction = await onPermission({
    permissionKey: "external_path",
    input: absPath,
    alwaysPatterns: [alwaysPattern],
  });

  if (userAction === "allow") {
    await allowFsScope(absPath);
    return { allowed: true };
  }
  return { allowed: false, error: t("ai.tool.error.pathDenied") };
}

function makeOutlineTool(): ToolDefinition {
  return {
    type: "function",
    function: {
      name: "outline",
      description: t("ai.tool.outline.desc"),
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: t("ai.tool.outline.param.path"),
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
      description: t("ai.tool.read.desc"),
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: t("ai.tool.read.param.path"),
          },
          offset: {
            type: "number",
            description: t("ai.tool.read.param.offset"),
          },
          limit: {
            type: "number",
            description: t("ai.tool.read.param.limit"),
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
      name: "read_section",
      description: t("ai.tool.readSection.desc"),
      parameters: {
        type: "object",
        properties: {
          heading: {
            type: "string",
            description: t("ai.tool.readSection.param.heading"),
          },
          path: {
            type: "string",
            description: t("ai.tool.readSection.param.path"),
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
      description: t("ai.tool.grep.desc"),
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: t("ai.tool.grep.param.pattern"),
          },
          path: {
            type: "string",
            description: t("ai.tool.grep.param.path"),
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
      description: t("ai.tool.find.desc"),
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: t("ai.tool.find.param.pattern"),
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
      description: t("ai.tool.glob.desc"),
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: t("ai.tool.glob.param.pattern"),
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
      description: t("ai.tool.ls.desc"),
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: t("ai.tool.ls.param.path"),
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
      description: t("ai.tool.webfetch.desc"),
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: t("ai.tool.webfetch.param.url"),
          },
          format: {
            type: "string",
            enum: ["markdown", "text", "html"],
            description: t("ai.tool.webfetch.param.format"),
          },
        },
        required: ["url"],
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

export function getToolDefinitions(needsDocTools: boolean, workspaceRoot?: string | null): ToolDefinition[] {
  const tools: ToolDefinition[] = [makeWebfetchTool()];
  const fileDefs = [makeOutlineTool(), makeReadTool(), makeReadSectionTool()];
  const grepDef = makeGrepTool();
  const projectDefs = [makeFindTool(), makeGlobTool(), makeLsTool()];
  if (needsDocTools) {
    tools.push(...fileDefs, grepDef);
  }
  if (workspaceRoot) {
    if (!needsDocTools) tools.push(...fileDefs, grepDef);
    tools.push(...projectDefs);
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
    return { content: "", error: t("ai.tool.error.noWorkspace") };
  }

  const absPath = await resolveAbsolutePath(path, ctx.workspaceRoot);
  const { allowed, error } = await checkPathAccess(absPath, ctx.workspaceRoot, ctx, onPermission);
  if (!allowed) {
    return { content: "", error: error ?? t("ai.tool.error.pathOutsideWorkspace") };
  }

  if (!(await exists(absPath))) {
    return { content: "", error: t("ai.tool.error.fileNotFound", { path }) };
  }

  try {
    const content = await readTextFile(absPath);
    return { content, absPath };
  } catch (e) {
    return { content: "", error: t("ai.tool.error.readFileFailed", { error: e instanceof Error ? e.message : String(e) }) };
  }
}

function toolOutline(docContent: string): string {
  const result = buildOutline(docContent);
  return result || t("ai.tool.error.noOutline");
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
      ? "\n" + t("ai.tool.error.grepTruncated", { n: MAX_GREP_RESULTS })
      : `\n${matches.length} matches found`;
  return matches.join("\n") + suffix;
}

function toolRead(docContent: string, offset?: number, limit?: number): string {
  const lines = docContent.split("\n");
  const startLine = Math.max(1, Math.floor(offset ?? 1));
  const maxLines = Math.min(limit ?? MAX_READ_LINES, MAX_READ_LINES);
  const endLine = Math.min(lines.length, startLine + maxLines - 1);

  if (startLine > lines.length) {
    return t("ai.tool.error.readLineOutOfRange", { n: lines.length, s: startLine });
  }

  const result: string[] = [];
  for (let i = startLine - 1; i < endLine; i++) {
    result.push(`${i + 1}: ${lines[i]}`);
  }

  if (endLine < lines.length) {
    result.push(t("ai.tool.error.readTruncated", { n: lines.length }));
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
      return `Section not found: "${heading}"\n${t("ai.tool.error.sectionNotFound")}:\n${available.map((s) => `- ${s}`).join("\n")}`;
    }
    return `Section not found: "${heading}"\n${t("ai.tool.error.noOutline")}`;
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
    return t("ai.tool.error.findNoResults", { pattern });
  }
  const suffix = results.length >= MAX_FIND_RESULTS
    ? "\n" + t("ai.tool.error.findTruncated", { n: MAX_FIND_RESULTS })
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
    return t("ai.tool.error.globNoResults", { pattern });
  }
  const suffix = results.length >= MAX_GLOB_RESULTS
    ? "\n" + t("ai.tool.error.globTruncated", { n: MAX_GLOB_RESULTS })
    : "";
  return results.join("\n") + suffix;
}

async function toolLs(dirPath: string | undefined, workspaceRoot: string, ctx: ToolContext, onPermission?: OnPermissionCallback): Promise<string> {
  const absDir = dirPath ? await resolveAbsolutePath(dirPath, workspaceRoot) : workspaceRoot;
  const { allowed, error } = await checkPathAccess(absDir, workspaceRoot, ctx, onPermission);
  if (!allowed) {
    return error ?? t("ai.tool.error.pathOutsideWorkspace");
  }
  if (!(await exists(absDir))) {
    return t("ai.tool.error.dirNotFound", { path: dirPath ?? "/" });
  }

  const dirStat = await stat(absDir);
  if (!dirStat.isDirectory) {
    return t("ai.tool.error.notDirectory", { path: dirPath ?? "/" });
  }

  let entries;
  try {
    entries = await readDir(absDir);
  } catch (e) {
    return t("ai.tool.error.readDirFailed", { error: e instanceof Error ? e.message : String(e) });
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

export function makeSkillTool(): ToolDefinition {
  return {
    type: "function",
    function: {
      name: "skill",
      description: t("ai.tool.skill.desc"),
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: t("ai.tool.skill.param.name"),
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
      name: "run_skill_script",
      description: t("ai.tool.runSkillScript.desc"),
      parameters: {
        type: "object",
        properties: {
          script: {
            type: "string",
            description: t("ai.tool.runSkillScript.param.script"),
          },
          args: {
            type: "string",
            description: t("ai.tool.runSkillScript.param.args"),
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
      parts.push("\n\nAvailable scripts (use with run_skill_script):");
      for (const f of scripts) parts.push(`- ${f}`);
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
  const enabledSkills = useSkillStore.getState().discoveredSkills.filter((s) => s.enabled && s.hasScripts);
  let owningSkill = enabledSkills.find((s) => s.name === script.split("/")[0]);
  if (!owningSkill) {
    for (const s of enabledSkills) {
      const scripts = await listScriptFiles(s.name);
      if (scripts.includes(script)) {
        owningSkill = s;
        break;
      }
    }
  }
  if (!owningSkill) return `Script not found: ${script}. No enabled skill contains this script.`;


  const permissions = ctx.permissions ?? DEFAULT_PERMISSIONS;
  const sessionRules = ctx.sessionRules ?? [];
  const action = evaluateWithSession(sessionRules, permissions.run_skill_script, "run_skill_script", owningSkill.name);

  if (action === "deny") {
    return t("ai.tool.error.runSkillScriptDenied", { name: owningSkill.name });
  }
  if (action === "ask" && onPermission) {
    const alwaysPattern = generateAlwaysPattern("run_skill_script", owningSkill.name);
    const userAction = await onPermission({
      permissionKey: "run_skill_script",
      input: owningSkill.name,
      alwaysPatterns: [alwaysPattern],
    });
    if (userAction === "deny") {
      return t("ai.tool.error.runSkillScriptDenied", { name: owningSkill.name });
    }
  }

  try {
    const envVars = useThemeStore.getState().envVars ?? {};
    const resolvedArgs = resolveEnvVars(args, ctx, envVars);
    const mergedEnv: Record<string, string> = { ...envVars };
    if (ctx.workspaceRoot) mergedEnv.MOFLOW_WORKSPACE_ROOT = ctx.workspaceRoot;
    if (ctx.activeFilePath) mergedEnv.MOFLOW_ACTIVE_FILE = ctx.activeFilePath;
    const result = await executeSkillScript(owningSkill.name, script, resolvedArgs, mergedEnv);
    return truncateResult(result) + "\n\n[SUCCESS — Do NOT call run_skill_script again. Report this output to the user now.]";
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
      case "read_section": {
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
          return t("ai.tool.error.noWorkspaceFind");
        }
        result = await toolFind(String(args.pattern ?? ""), ctx.workspaceRoot);
        break;
      }
      case "glob": {
        if (!ctx.workspaceRoot) {
          return t("ai.tool.error.noWorkspaceGlob");
        }
        result = await toolGlob(String(args.pattern ?? ""), ctx.workspaceRoot);
        break;
      }
      case "ls": {
        if (!ctx.workspaceRoot) {
          return t("ai.tool.error.noWorkspaceLs");
        }
        result = await toolLs(args.path as string | undefined, ctx.workspaceRoot, ctx, onPermission);
        break;
      }
      case "webfetch": {
        result = await toolWebFetch(String(args.url ?? ""), args.format != null ? String(args.format) : undefined, signal);
        break;
      }
      case "skill": {
        result = await toolSkill(String(args.name ?? ""));
        break;
      }
      case "run_skill_script": {
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
