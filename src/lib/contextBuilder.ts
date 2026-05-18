import DEFAULT_PROMPT from './prompt/default.txt?raw';
import { useSkillStore } from "../stores/skillStore";

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

const TOOLS_GUIDE = "When the user asks about files, directories, or code, ALWAYS use the provided tools. Proactively use tools to find relevant information instead of guessing.";

const WEBFETCH_INSTRUCTION = "You can use webfetch(url, format?) to access web page content for external information or references. format supports markdown (default), text, html. Max 3 calls per request.";

const SWITCH_NOTE = "Note: The user may switch files within the workspace. The content above is from the currently active file. If the user mentions other files, please use tools to view them.";

const SKILL_INSTRUCTION = `# Skills
Skills provide specialized capabilities. When a task matches a skill's description, first use the "skill" tool to load its instructions by name. After loading, if the skill includes scripts, use the "runSkillScript" tool to execute them. Always load the skill first before running any of its scripts. In runSkillScript args, use \${VAR_NAME} placeholders for environment variables. MoFlow resolves these before execution — you do NOT need to know their actual values. Available variables and their current values are listed below. After a script runs successfully, you MUST report the output to the user and STOP immediately. Do NOT make any additional runSkillScript calls. Do NOT retry with different arguments. Do NOT attempt to improve or modify the result unless the user explicitly asks.`;

function buildSkillInstruction(workspaceRoot?: string | null, activeFilePath?: string | null): string {
  const available = useSkillStore.getState().discoveredSkills.filter((s) => s.enabled);
  if (available.length === 0) {
    return "";
  }
  const skillXml = [
    "<available_skills>",
    ...available
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .map((s) => `  <skill name="${s.name}" description="${s.description}" />`),
    "</available_skills>",
  ].join("\n");

  const envVars: string[] = [];
  if (workspaceRoot) envVars.push(`  <var name="MOFLOW_WORKSPACE_ROOT" desc="Current workspace root path" value="${workspaceRoot}" />`);
  if (activeFilePath) envVars.push(`  <var name="MOFLOW_ACTIVE_FILE" desc="Currently active file path" value="${activeFilePath}" />`);

  const envXml = envVars.length > 0
    ? "\n<available_env_vars>\n" + envVars.join("\n") + "\n</available_env_vars>"
    : "";

  return "\n" + SKILL_INSTRUCTION + "\n\n" + skillXml + envXml + "\n";
}

export function buildSystemPrompt(
  docContent: string,
  maxContext: number,
  needsDocTools: boolean = false,
  workspaceRoot?: string | null,
  activeFilePath?: string | null,
): SystemPromptResult {
  const base = DEFAULT_PROMPT;
  const skillSection = buildSkillInstruction(workspaceRoot, activeFilePath);
  const hasWorkspace = !!workspaceRoot;

  if (hasWorkspace) {
    const docRatio = needsDocTools ? 0.50 : 0.65;
    const reserved = Math.floor(maxContext * (1 - docRatio));
    const availableDocTokens = maxContext - reserved;

    if (!docContent || docContent.trim().length === 0) {
      return {
        prompt: [
          base,
          "",
          "The user has a workspace open but no file is currently active.",
          "",
          TOOLS_GUIDE,
          "",
          WEBFETCH_INSTRUCTION,
          skillSection,
        ].join("\n"),
        needsDocTools: true,
      };
    }

    const docTokens = estimateTokens(docContent);

    if (docTokens <= availableDocTokens) {
      return {
        prompt: [
          base,
          "",
          "The user has a workspace open.",
          "<document_content>",
          docContent,
          "</document_content>",
          "",
          SWITCH_NOTE,
          "",
          TOOLS_GUIDE,
          "",
          WEBFETCH_INSTRUCTION,
          skillSection,
        ].join("\n"),
        needsDocTools: true,
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

    const prompt = [
      base,
      "",
      "The user has a workspace open (long content, only the beginning is shown).",
      "",
      "<document_content truncated=\"true\">",
      truncated,
      "</document_content>",
      "",
      "<document_structure>",
      outline,
      "</document_structure>",
      "",
      SWITCH_NOTE,
      "",
      TOOLS_GUIDE,
      "",
      WEBFETCH_INSTRUCTION,
      "",
      "When the user's question involves content beyond the truncated section, please proactively use tools to find the relevant information instead of guessing.",
      skillSection,
    ].join("\n");

    return { prompt, needsDocTools: true };
  }

  const docRatio = needsDocTools ? 0.50 : 0.65;
  const reserved = Math.floor(maxContext * (1 - docRatio));
  const availableDocTokens = maxContext - reserved;

  if (!docContent || docContent.trim().length === 0) {
    return {
      prompt: [
        base,
        "",
        "The user has no document open.",
        "",
        WEBFETCH_INSTRUCTION,
        skillSection,
      ].join("\n"),
      needsDocTools: false,
    };
  }

  const docTokens = estimateTokens(docContent);

  if (docTokens <= availableDocTokens) {
      const writeNote = activeFilePath
        ? "\nYou can use write(path, content) to create/overwrite files and edit(path, old_string, new_string) to replace text in files.\n"
        : "";
      return {
        prompt: [
          base,
          "",
          "<document_content>",
          docContent,
          "</document_content>",
          "",
          writeNote,
          WEBFETCH_INSTRUCTION,
          skillSection,
        ].join("\n"),
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

  const prompt = [
    base,
    "",
    "<document_content truncated=\"true\">",
    truncated,
    "</document_content>",
    "",
    "<document_structure>",
    outline,
    "</document_structure>",
    "",
    TOOLS_GUIDE,
    "",
    WEBFETCH_INSTRUCTION,
    "",
    "When the user's question involves content beyond the truncated section, please proactively use tools to find the relevant information instead of guessing.",
    skillSection,
  ].join("\n");

  return { prompt, needsDocTools: true };
}