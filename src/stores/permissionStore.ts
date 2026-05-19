import { create } from "zustand";
import type { PermissionRule, PermissionAction, Permissions } from "../lib/permission";
import { evaluateWithSession } from "../lib/permission";
import type { AiMode } from "../lib/settings";

interface PermissionState {
  sessionRules: Record<string, PermissionRule[]>;
  sessionAiModeMap: Record<string, AiMode>;
  addSessionRule: (chatKey: string, rule: PermissionRule) => void;
  evaluatePermission: (
    chatKey: string,
    key: "externalPath" | "runSkillScript" | "edit",
    input: string,
    globalRules: Permissions
  ) => PermissionAction;
  clearSessionRules: (chatKey: string) => void;
  setSessionAiMode: (chatKey: string, mode: AiMode) => void;
  getSessionAiMode: (chatKey: string) => AiMode;
}

const PLAN_DENY_RULES: PermissionRule[] = [
  { permissionKey: "edit", pattern: "**", action: "deny" },
  { permissionKey: "runSkillScript", pattern: "**", action: "deny" },
];

function filterAiModeRules(rules: PermissionRule[]): PermissionRule[] {
  return rules.filter((r) => {
    const isAiModeDeny = (r.permissionKey === "edit" || r.permissionKey === "runSkillScript") && r.pattern === "**" && r.action === "deny";
    return !isAiModeDeny;
  });
}

export const usePermissionStore = create<PermissionState>((set, get) => ({
  sessionRules: {},
  sessionAiModeMap: {},

  addSessionRule: (chatKey, rule) => {
    set((state) => {
      const existing = state.sessionRules[chatKey] ?? [];
      return {
        sessionRules: {
          ...state.sessionRules,
          [chatKey]: [...existing, rule],
        },
      };
    });
  },

  evaluatePermission: (chatKey, key, input, globalRules) => {
    const sessionRules = get().sessionRules[chatKey] ?? [];
    return evaluateWithSession(sessionRules, globalRules[key], key, input);
  },

  clearSessionRules: (chatKey) => {
    set((state) => {
      const nextRules = { ...state.sessionRules };
      delete nextRules[chatKey];
      return { sessionRules: nextRules };
    });
  },

  setSessionAiMode: (chatKey, mode) => {
    const currentRules = get().sessionRules[chatKey] ?? [];
    const cleanedRules = filterAiModeRules(currentRules);
    const newRules = mode === "plan" ? [...PLAN_DENY_RULES, ...cleanedRules] : cleanedRules;
    set((state) => ({
      sessionRules: { ...state.sessionRules, [chatKey]: newRules },
      sessionAiModeMap: { ...state.sessionAiModeMap, [chatKey]: mode },
    }));
  },

  getSessionAiMode: (chatKey) => {
    return get().sessionAiModeMap[chatKey] ?? "build";
  },
}));
