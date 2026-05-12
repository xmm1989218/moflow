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

import { t, isZh } from "../i18n/core";

function buildWsFileTools(): string {
  return [
    t("ai.systemPrompt.toolOutline"),
    t("ai.systemPrompt.toolRead"),
    t("ai.systemPrompt.toolReadSection"),
    t("ai.systemPrompt.toolGrep"),
    t("ai.systemPrompt.toolFind"),
    t("ai.systemPrompt.toolGlob"),
    t("ai.systemPrompt.toolLs"),
  ].join("\n");
}

function buildDocTools(): string {
  return [
    t("ai.systemPrompt.docToolOutline"),
    t("ai.systemPrompt.docToolRead"),
    t("ai.systemPrompt.docToolReadSection"),
    t("ai.systemPrompt.docToolGrep"),
  ].join("\n");
}

export function buildSystemPrompt(
  docContent: string,
  maxContext: number,
  needsDocTools: boolean = false,
  workspaceRoot?: string | null,
  activeFileName?: string | null,
): SystemPromptResult {
  const hasWorkspace = !!workspaceRoot;

  if (hasWorkspace) {
    const docRatio = needsDocTools ? 0.50 : 0.65;
    const reserved = Math.floor(maxContext * (1 - docRatio));
    const availableDocTokens = maxContext - reserved;

    if (!docContent || docContent.trim().length === 0) {
      return {
        prompt: [
          t("ai.systemPrompt.wsNoFile"),
          "",
          t("ai.mdSyntax"),
          "",
          t("ai.systemPrompt.browseWorkspace"),
          buildWsFileTools(),
          "",
          t("ai.systemPrompt.webfetchInstruction"),
        ].join("\n"),
        needsDocTools: true,
      };
    }

    const docTokens = estimateTokens(docContent);

    if (docTokens <= availableDocTokens) {
      const fileLabel = activeFileName
        ? (isZh() ? `「${activeFileName}」` : `"${activeFileName}"`)
        : (isZh() ? "" : "a Markdown document");
      return {
        prompt: [
          t("ai.systemPrompt.wsWithFile", { fileLabel }),
          "---",
          docContent,
          "---",
          t("ai.systemPrompt.basedOnDoc"),
          "",
          t("ai.systemPrompt.switchNote"),
          "",
          t("ai.mdSyntax"),
          "",
          t("ai.systemPrompt.youCanUseTools"),
          buildWsFileTools(),
          "",
          t("ai.systemPrompt.webfetchInstruction"),
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
    const fileLabel = activeFileName
      ? (isZh() ? `「${activeFileName}」` : `"${activeFileName}"`)
      : (isZh() ? "" : "a Markdown document");

    const prompt = [
      t("ai.systemPrompt.wsTruncated", { fileLabel }),
      "",
      t("ai.systemPrompt.docContentTruncated"),
      truncated,
      "---",
      "",
      t("ai.systemPrompt.docStructure"),
      outline,
      "---",
      "",
      t("ai.systemPrompt.switchNote"),
      "",
      t("ai.mdSyntax"),
      "",
      t("ai.systemPrompt.useToolsToExplore"),
      buildWsFileTools(),
      "",
      t("ai.systemPrompt.webfetchInstruction"),
      "",
      t("ai.systemPrompt.proactiveToolUse"),
    ].join("\n");

    return { prompt, needsDocTools: true };
  }

  const docRatio = needsDocTools ? 0.50 : 0.65;
  const reserved = Math.floor(maxContext * (1 - docRatio));
  const availableDocTokens = maxContext - reserved;

  if (!docContent || docContent.trim().length === 0) {
    return {
      prompt: [
        t("ai.systemPrompt.noDoc"),
        "",
        t("ai.mdSyntax"),
        "",
        t("ai.systemPrompt.webfetchInstruction"),
      ].join("\n"),
      needsDocTools: false,
    };
  }

  const docTokens = estimateTokens(docContent);

  if (docTokens <= availableDocTokens) {
    return {
      prompt: [
        t("ai.systemPrompt.withDoc"),
        "---",
        docContent,
        "---",
        t("ai.systemPrompt.basedOnDoc"),
        "",
        t("ai.mdSyntax"),
        "",
        t("ai.systemPrompt.webfetchInstruction"),
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
    t("ai.systemPrompt.truncated"),
    "",
    t("ai.systemPrompt.docContentTruncated"),
    truncated,
    "---",
    "",
    t("ai.systemPrompt.docStructure"),
    outline,
    "---",
    "",
    t("ai.mdSyntax"),
    "",
    t("ai.systemPrompt.useToolsToExplore"),
    buildDocTools(),
    "",
    t("ai.systemPrompt.webfetchInstruction"),
    "",
    t("ai.systemPrompt.proactiveToolUse"),
  ].join("\n");

  return { prompt, needsDocTools: true };
}
