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

const WS_FILE_TOOLS = [
  "- outline: Get document heading outline",
  "- read_lines: Read a range of lines",
  "- read_section: Read content under a heading",
  "- grep: Search lines matching a regex",
  "- find: Search files by name",
  "- glob: Match file paths by glob pattern",
  "- ls: List directory contents",
].join("\n");

const DOC_FILE_TOOLS = [
  "- outline(path?): Get document heading outline",
  "- read_lines(path?, offset?, limit?): Read a range of lines",
  "- read_section(heading, path?): Read content under a heading",
  "- grep(pattern, path?): Search matching lines",
].join("\n");

const WEBFETCH_INSTRUCTION = "You can use webfetch(url, format?) to access web page content for external information or references. format supports markdown (default), text, html. Max 3 calls per request.";

const SWITCH_NOTE = "Note: The user may switch files within the workspace. The content above is from the currently active file. If the user mentions other files, please use tools to view them.";

const SKILL_INSTRUCTION = `# Skills
Skills provide specialized capabilities. When a task matches a skill's description, first use the "skill" tool to load its instructions by name. After loading, if the skill includes scripts, use the "run_skill_script" tool to execute them. Always load the skill first before running any of its scripts. In run_skill_script args, use \${VAR_NAME} placeholders for environment variables. MoFlow resolves these before execution — you do NOT need to know their actual values. Available variables and their current values are listed below. After a script runs successfully, you MUST report the output to the user and STOP immediately. Do NOT make any additional run_skill_script calls. Do NOT retry with different arguments. Do NOT attempt to improve or modify the result unless the user explicitly asks.`;

function buildSkillInstruction(workspaceRoot?: string | null, activeFilePath?: string | null): string {
  const available = useSkillStore.getState().discoveredSkills.filter((s) => s.enabled);
  if (available.length === 0) {
    return "";
  }
  const skillXml = [
    "<available_skills>",
    ...available
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .flatMap((s) => [
        "  <skill>",
        `    <name>${s.name}</name>`,
        `    <description>${s.description}</description>`,
        "  </skill>",
      ]),
    "</available_skills>",
  ].join("\n");

  const envVars: string[] = [];
  if (workspaceRoot) envVars.push(`    <var>\n      <name>MOFLOW_WORKSPACE_ROOT</name>\n      <description>Current workspace root path</description>\n      <current_value>${workspaceRoot}</current_value>\n    </var>`);
  if (activeFilePath) envVars.push(`    <var>\n      <name>MOFLOW_ACTIVE_FILE</name>\n      <description>Currently active file path</description>\n      <current_value>${activeFilePath}</current_value>\n    </var>`);

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
          "You can use the following tools to browse workspace files. When the user asks about files, directories, or code, ALWAYS use these tools:",
          WS_FILE_TOOLS,
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
          "You can use the following tools. When the user asks about files, directories, or code, ALWAYS use these tools:",
          WS_FILE_TOOLS,
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
      "You can use the following tools to explore the full document content. When the user asks about files, directories, or code, ALWAYS use these tools:",
      WS_FILE_TOOLS,
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
    return {
      prompt: [
        base,
        "",
        "<document_content>",
        docContent,
        "</document_content>",
        "",
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
    "You can use the following tools to explore the full document content. When the user asks about files, directories, or code, ALWAYS use these tools:",
    DOC_FILE_TOOLS,
    "",
    WEBFETCH_INSTRUCTION,
    "",
    "When the user's question involves content beyond the truncated section, please proactively use tools to find the relevant information instead of guessing.",
    skillSection,
  ].join("\n");

  return { prompt, needsDocTools: true };
}