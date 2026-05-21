export type PermissionAction = "allow" | "ask" | "deny";
import { toPosix } from "./pathUtils";

export type PermissionRules = PermissionAction | Record<string, PermissionAction>;

export interface Permissions {
  externalPath: PermissionRules;
  runSkillScript: PermissionRules;
  edit: PermissionRules;
}

export interface PermissionRule {
  permissionKey: string;
  pattern: string;
  action: PermissionAction;
}

export interface PermissionRequest {
  permissionKey: "externalPath" | "runSkillScript" | "edit";
  input: string;
  alwaysPatterns: string[];
  detail?: string;
}

export const DEFAULT_PERMISSIONS: Permissions = {
  externalPath: { "*": "ask" },
  runSkillScript: { "*": "ask" },
  edit: { "*": "ask" },
};

function escapeRegex(str: string): string {
  return str.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

function wildcardToRegex(pattern: string, key: "externalPath" | "runSkillScript" | "edit"): RegExp {
  const normalized = toPosix(pattern);
  const parts = normalized.split("**");
  const escapedParts = parts.map((p) => escapeRegex(p));

  let regexStr: string;
  if (key === "externalPath" || key === "edit") {
    const processedParts = escapedParts.map((p) => p.replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]"));
    regexStr = processedParts.join(".*");
  } else {
    const processedParts = escapedParts.map((p) => p.replace(/\*/g, "[^:]*").replace(/\?/g, "[^:]"));
    regexStr = processedParts.join(".*");
  }

  try {
    return new RegExp(`^${regexStr}$`, "i");
  } catch {
    return new RegExp(`^$`);
  }
}

export function wildcardMatch(
  pattern: string,
  input: string,
  key: "externalPath" | "runSkillScript" | "edit"
): boolean {
  const normalizedInput = toPosix(input);
  const regex = wildcardToRegex(pattern, key);
  return regex.test(normalizedInput);
}

export function evaluate(
  rules: PermissionRules,
  input: string,
  key: "externalPath" | "runSkillScript" | "edit"
): PermissionAction {
  if (!rules) return "ask";
  if (typeof rules === "string") {
    return rules;
  }

  let lastMatch: { pattern: string; action: PermissionAction } | null = null;

  for (const [pattern, action] of Object.entries(rules)) {
    if (wildcardMatch(pattern, input, key)) {
      lastMatch = { pattern, action };
    }
  }

  return lastMatch?.action ?? "ask";
}

export function evaluateWithSession(
  sessionRules: PermissionRule[],
  globalRules: PermissionRules,
  key: "externalPath" | "runSkillScript" | "edit",
  input: string
): PermissionAction {
  let lastSessionAction: PermissionAction | null = null;
  for (const rule of sessionRules) {
    if (rule.permissionKey === key && wildcardMatch(rule.pattern, input, key)) {
      lastSessionAction = rule.action;
    }
  }
  if (lastSessionAction !== null) return lastSessionAction;

  return evaluate(globalRules, input, key);
}

export function generateAlwaysPattern(
  key: "externalPath" | "runSkillScript" | "edit",
  input: string
): string {
  if (key === "runSkillScript") {
    return input;
  }

  const normalized = toPosix(input);
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash > 0) {
    return normalized.substring(0, lastSlash) + "/*";
  }
  return "*";
}
