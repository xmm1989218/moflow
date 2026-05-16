export type PermissionAction = "allow" | "ask" | "deny";

export type PermissionRules = PermissionAction | Record<string, PermissionAction>;

export interface Permissions {
  external_path: PermissionRules;
  run_skill_script: PermissionRules;
  edit: PermissionRules;
}

export interface PermissionRule {
  permissionKey: string;
  pattern: string;
  action: PermissionAction;
}

export interface PermissionRequest {
  permissionKey: "external_path" | "run_skill_script" | "edit";
  input: string;
  alwaysPatterns: string[];
}

export const DEFAULT_PERMISSIONS: Permissions = {
  external_path: { "*": "ask" },
  run_skill_script: { "*": "ask" },
  edit: { "*": "ask" },
};

function escapeRegex(str: string): string {
  return str.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

function wildcardToRegex(pattern: string, key: "external_path" | "run_skill_script" | "edit"): RegExp {
  const normalized = pattern.replace(/\\/g, "/");

  let regexStr = escapeRegex(normalized);

  if (key === "external_path" || key === "edit") {
    regexStr = regexStr
      .replace(/\{\{GLOBSTAR\}\}/g, "{{GLOBSTAR_PLACEHOLDER}}")
      .replace(/\*/g, "[^/]*")
      .replace(/\?/g, "[^/]")
      .replace(/\{\{GLOBSTAR_PLACEHOLDER\}\}/g, ".*");
  } else {
    regexStr = regexStr
      .replace(/\{\{GLOBSTAR\}\}/g, "{{GLOBSTAR_PLACEHOLDER}}")
      .replace(/\*/g, "[^:]*")
      .replace(/\?/g, "[^:]")
      .replace(/\{\{GLOBSTAR_PLACEHOLDER\}\}/g, ".*");
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
  key: "external_path" | "run_skill_script" | "edit"
): boolean {
  const normalizedInput = input.replace(/\\/g, "/");
  const regex = wildcardToRegex(pattern, key);
  return regex.test(normalizedInput);
}

export function evaluate(
  rules: PermissionRules,
  input: string,
  key: "external_path" | "run_skill_script" | "edit"
): PermissionAction {
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
  key: "external_path" | "run_skill_script" | "edit",
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
  key: "external_path" | "run_skill_script" | "edit",
  input: string
): string {
  if (key === "run_skill_script") {
    return input;
  }

  const normalized = input.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash > 0) {
    return normalized.substring(0, lastSlash) + "/*";
  }
  return "*";
}
