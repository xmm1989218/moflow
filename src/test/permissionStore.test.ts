import { describe, it, expect, beforeEach } from "vitest";
import { usePermissionStore } from "../stores/permissionStore";
import { DEFAULT_PERMISSIONS } from "../lib/permission";

describe("permissionStore", () => {
  beforeEach(() => {
    usePermissionStore.setState({
      sessionRules: {},
      sessionAiModeMap: {},
    });
  });

  describe("sessionRules", () => {
    it("starts with no session rules", () => {
      expect(Object.keys(usePermissionStore.getState().sessionRules)).toHaveLength(0);
    });

    it("addSessionRule adds rule for a chatKey", () => {
      usePermissionStore.getState().addSessionRule("chat1", {
        permissionKey: "edit",
        pattern: "*",
        action: "deny",
      });
      const rules = usePermissionStore.getState().sessionRules["chat1"];
      expect(rules).toHaveLength(1);
      expect(rules[0].action).toBe("deny");
    });

    it("clearSessionRules removes rules for a chatKey", () => {
      usePermissionStore.getState().addSessionRule("chat1", {
        permissionKey: "edit",
        pattern: "*",
        action: "deny",
      });
      usePermissionStore.getState().clearSessionRules("chat1");
      expect(usePermissionStore.getState().sessionRules["chat1"]).toBeUndefined();
    });
  });

  describe("sessionAiMode", () => {
    it("getSessionAiMode returns build by default", () => {
      expect(usePermissionStore.getState().getSessionAiMode("chat1")).toBe("build");
    });

    it("setSessionAiMode sets mode and injects deny rules for plan", () => {
      usePermissionStore.getState().setSessionAiMode("chat1", "plan");
      expect(usePermissionStore.getState().sessionAiModeMap["chat1"]).toBe("plan");
      expect(usePermissionStore.getState().getSessionAiMode("chat1")).toBe("plan");

      const rules = usePermissionStore.getState().sessionRules["chat1"];
      const editRule = rules.find((r) => r.permissionKey === "edit");
      const scriptRule = rules.find((r) => r.permissionKey === "runSkillScript");
      expect(editRule).toBeDefined();
      expect(editRule!.action).toBe("deny");
      expect(scriptRule).toBeDefined();
      expect(scriptRule!.action).toBe("deny");
    });

    it("setSessionAiMode build removes plan deny rules", () => {
      usePermissionStore.getState().setSessionAiMode("chat1", "plan");
      usePermissionStore.getState().setSessionAiMode("chat1", "build");

      expect(usePermissionStore.getState().sessionAiModeMap["chat1"]).toBe("build");
      const rules = usePermissionStore.getState().sessionRules["chat1"] ?? [];
      const editDeny = rules.find((r) => r.permissionKey === "edit" && r.pattern === "*" && r.action === "deny");
      const scriptDeny = rules.find((r) => r.permissionKey === "runSkillScript" && r.pattern === "*" && r.action === "deny");
      expect(editDeny).toBeUndefined();
      expect(scriptDeny).toBeUndefined();
    });

    it("clearSessionRules also clears sessionAiModeMap", () => {
      usePermissionStore.getState().setSessionAiMode("chat1", "plan");
      usePermissionStore.getState().clearSessionRules("chat1");
      expect(usePermissionStore.getState().sessionAiModeMap["chat1"]).toBeUndefined();
      expect(usePermissionStore.getState().getSessionAiMode("chat1")).toBe("build");
    });

    it("session plan rules override global ask rules via evaluatePermission", () => {
      usePermissionStore.getState().setSessionAiMode("chat1", "plan");
      const rules = usePermissionStore.getState().sessionRules["chat1"];
      const editRule = rules.find((r) => r.permissionKey === "edit");
      expect(editRule).toBeDefined();
      expect(editRule!.pattern).toBe("**");
      expect(editRule!.action).toBe("deny");
      const action = usePermissionStore.getState().evaluatePermission(
        "chat1",
        "edit",
        "/some/file.md",
        DEFAULT_PERMISSIONS,
      );
      expect(action).toBe("deny");
    });

    it("session build mode preserves global ask rules", () => {
      usePermissionStore.getState().setSessionAiMode("chat1", "build");
      const action = usePermissionStore.getState().evaluatePermission(
        "chat1",
        "edit",
        "/some/file.md",
        DEFAULT_PERMISSIONS,
      );
      expect(action).toBe("ask");
    });

    it("different chatKeys have independent aiModes", () => {
      usePermissionStore.getState().setSessionAiMode("chat1", "plan");
      usePermissionStore.getState().setSessionAiMode("chat2", "build");
      expect(usePermissionStore.getState().getSessionAiMode("chat1")).toBe("plan");
      expect(usePermissionStore.getState().getSessionAiMode("chat2")).toBe("build");

      const action1 = usePermissionStore.getState().evaluatePermission("chat1", "edit", "/f", DEFAULT_PERMISSIONS);
      const action2 = usePermissionStore.getState().evaluatePermission("chat2", "edit", "/f", DEFAULT_PERMISSIONS);
      expect(action1).toBe("deny");
      expect(action2).toBe("ask");
    });

    it("plan mode does not affect externalPath", () => {
      usePermissionStore.getState().setSessionAiMode("chat1", "plan");
      const action = usePermissionStore.getState().evaluatePermission(
        "chat1",
        "externalPath",
        "/some/external/path",
        DEFAULT_PERMISSIONS,
      );
      expect(action).toBe("ask");
    });

    it("user-added session rules survive mode switch from build to plan", () => {
      usePermissionStore.getState().addSessionRule("chat1", {
        permissionKey: "externalPath",
        pattern: "/safe/*",
        action: "allow",
      });
      usePermissionStore.getState().setSessionAiMode("chat1", "plan");
      const rules = usePermissionStore.getState().sessionRules["chat1"];
      const userRule = rules.find((r) => r.permissionKey === "externalPath" && r.pattern === "/safe/*");
      expect(userRule).toBeDefined();
      expect(userRule!.action).toBe("allow");
    });
  });
});
