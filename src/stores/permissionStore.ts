import { create } from "zustand";
import type { PermissionRule, PermissionAction, Permissions } from "../lib/permission";
import { evaluateWithSession } from "../lib/permission";

interface PermissionState {
  sessionRules: Record<string, PermissionRule[]>;
  addSessionRule: (chatKey: string, rule: PermissionRule) => void;
  evaluatePermission: (
    chatKey: string,
    key: "external_path" | "execute" | "edit",
    input: string,
    globalRules: Permissions
  ) => PermissionAction;
  clearSessionRules: (chatKey: string) => void;
}

export const usePermissionStore = create<PermissionState>((set, get) => ({
  sessionRules: {},

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
      const next = { ...state.sessionRules };
      delete next[chatKey];
      return { sessionRules: next };
    });
  },
}));
