import { describe, it, expect } from "vitest";
import { getShortcut, getAllShortcuts, getShortcutDisplay, getShortcutLabel } from "../lib/shortcuts";

describe("shortcuts", () => {
  describe("getShortcut", () => {
    it("returns definition for known shortcut", () => {
      const def = getShortcut("newFile");
      expect(def).toBeDefined();
      expect(def!.id).toBe("newFile");
      expect(def!.key).toBe("n");
      expect(def!.modifiers).toContain("ctrl");
    });

    it("returns undefined for unknown shortcut", () => {
      expect(getShortcut("nonexistent")).toBeUndefined();
    });

    it("all shortcuts have required fields", () => {
      const all = getAllShortcuts();
      for (const s of all) {
        expect(s.id).toBeTruthy();
        expect(s.key).toBeTruthy();
        expect(s.label.zh).toBeTruthy();
        expect(s.label.en).toBeTruthy();
        expect(Array.isArray(s.modifiers)).toBe(true);
      }
    });
  });

  describe("getShortcutDisplay", () => {
    it("returns Ctrl+key format on non-Mac", () => {
      const display = getShortcutDisplay("newFile");
      const isCtrl = display.startsWith("Ctrl+") || display.startsWith("⌘");
      expect(isCtrl).toBe(true);
    });

    it("returns empty string for unknown shortcut", () => {
      expect(getShortcutDisplay("nonexistent")).toBe("");
    });

    it("returns plain key for function keys", () => {
      expect(getShortcutDisplay("fullscreen")).toBe("F11");
    });

    it("includes Shift for two-modifier shortcuts", () => {
      const display = getShortcutDisplay("openFolder");
      const hasShift = display.includes("Shift") || display.includes("⇧");
      expect(hasShift).toBe(true);
    });

    it("handles Ctrl+Shift+S correctly", () => {
      const display = getShortcutDisplay("saveFileAs");
      const hasShift = display.includes("Shift") || display.includes("⇧");
      expect(hasShift).toBe(true);
    });
  });

  describe("getShortcutLabel", () => {
    it("returns label for known shortcut", () => {
      const label = getShortcutLabel("newFile");
      expect(label).toBeTruthy();
      expect(typeof label).toBe("string");
    });

    it("returns empty string for unknown shortcut", () => {
      expect(getShortcutLabel("nonexistent")).toBe("");
    });
  });

  describe("getAllShortcuts", () => {
    it("returns all 17 shortcuts", () => {
      expect(getAllShortcuts()).toHaveLength(17);
    });

    it("includes all expected shortcut ids", () => {
      const ids = getAllShortcuts().map((s) => s.id);
      expect(ids).toContain("newFile");
      expect(ids).toContain("openFile");
      expect(ids).toContain("openFolder");
      expect(ids).toContain("saveFile");
      expect(ids).toContain("saveFileAs");
      expect(ids).toContain("closeTab");
      expect(ids).toContain("nextTab");
      expect(ids).toContain("find");
      expect(ids).toContain("replace");
      expect(ids).toContain("settings");
      expect(ids).toContain("outline");
      expect(ids).toContain("aiSidebar");
      expect(ids).toContain("fullscreen");
      expect(ids).toContain("devtools");
    });

    it("no duplicate ids", () => {
      const ids = getAllShortcuts().map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
});
