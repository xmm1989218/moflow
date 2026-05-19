import { describe, it, expect } from "vitest";
import {
  getShortcut,
  getAllShortcuts,
  getShortcutDisplay,
  getShortcutLabel,
  applyShortcutOverrides,
  findConflict,
  parseKeyEvent,
  defaultShortcuts,
  formatShortcutDisplay,
} from "../lib/shortcuts";

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
        expect(s.labelKey).toBeTruthy();
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
    it("returns all default shortcuts", () => {
      expect(getAllShortcuts()).toHaveLength(defaultShortcuts.length);
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

  describe("shortcut overrides", () => {
    it("applyShortcutOverrides changes getShortcut result", () => {
      applyShortcutOverrides({ newFile: { key: "N", modifiers: ["ctrl", "shift"] } });
      const def = getShortcut("newFile");
      expect(def!.key).toBe("N");
      expect(def!.modifiers).toEqual(["ctrl", "shift"]);
    });

    it("applyShortcutOverrides with empty object restores defaults", () => {
      applyShortcutOverrides({ newFile: { key: "N", modifiers: ["ctrl", "shift"] } });
      applyShortcutOverrides({});
      const def = getShortcut("newFile");
      expect(def!.key).toBe("n");
      expect(def!.modifiers).toEqual(["ctrl"]);
    });

    it("override affects getShortcutDisplay", () => {
      applyShortcutOverrides({ fullscreen: { key: "F9", modifiers: [] } });
      expect(getShortcutDisplay("fullscreen")).toBe("F9");
      applyShortcutOverrides({});
    });

    it("override does not affect other shortcuts", () => {
      applyShortcutOverrides({ newFile: { key: "N", modifiers: ["ctrl", "shift"] } });
      const saveDef = getShortcut("saveFile");
      expect(saveDef!.key).toBe("s");
      expect(saveDef!.modifiers).toEqual(["ctrl"]);
      applyShortcutOverrides({});
    });

    it("getAllShortcuts reflects overrides", () => {
      applyShortcutOverrides({ find: { key: "F", modifiers: ["ctrl"] } });
      const all = getAllShortcuts();
      const find = all.find((s) => s.id === "find");
      expect(find!.key).toBe("F");
      applyShortcutOverrides({});
    });
  });

  describe("findConflict", () => {
    it("returns null when no conflict", () => {
      const result = findConflict("newFile", "q", ["ctrl"]);
      expect(result).toBeNull();
    });

    it("returns conflicting shortcut id", () => {
      const result = findConflict("newFile", "s", ["ctrl"]);
      expect(result).toBe("saveFile");
    });

    it("returns null for same id", () => {
      const result = findConflict("newFile", "n", ["ctrl"]);
      expect(result).toBeNull();
    });

    it("detects F-key conflicts", () => {
      const result = findConflict("find", "F7", []);
      expect(result).toBe("outline");
    });

    it("does not conflict if modifiers differ", () => {
      const result = findConflict("newFile", "F7", ["ctrl"]);
      expect(result).toBeNull();
    });
  });

  describe("parseKeyEvent", () => {
    it("returns null for modifier-only key", () => {
      const e = { key: "Control", ctrlKey: true, shiftKey: false, altKey: false, metaKey: false } as KeyboardEvent;
      expect(parseKeyEvent(e)).toBeNull();
    });

    it("parses Ctrl+letter", () => {
      const e = { key: "s", ctrlKey: true, shiftKey: false, altKey: false, metaKey: false } as KeyboardEvent;
      const result = parseKeyEvent(e);
      expect(result).toEqual({ key: "s", modifiers: ["ctrl"] });
    });

    it("parses Ctrl+Shift+letter", () => {
      const e = { key: "S", ctrlKey: true, shiftKey: true, altKey: false, metaKey: false } as KeyboardEvent;
      const result = parseKeyEvent(e);
      expect(result).toEqual({ key: "S", modifiers: ["ctrl", "shift"] });
    });

    it("parses function key without modifiers", () => {
      const e = { key: "F7", ctrlKey: false, shiftKey: false, altKey: false, metaKey: false } as KeyboardEvent;
      const result = parseKeyEvent(e);
      expect(result).toEqual({ key: "F7", modifiers: [] });
    });

    it("parses Ctrl+comma", () => {
      const e = { key: ",", ctrlKey: true, shiftKey: false, altKey: false, metaKey: false } as KeyboardEvent;
      const result = parseKeyEvent(e);
      expect(result).toEqual({ key: ",", modifiers: ["ctrl"] });
    });

    it("returns null for null/empty key", () => {
      const e = { key: "Shift", ctrlKey: false, shiftKey: true, altKey: false, metaKey: false } as KeyboardEvent;
      expect(parseKeyEvent(e)).toBeNull();
    });
  });

  describe("formatShortcutDisplay", () => {
    it("formats Ctrl+key", () => {
      const result = formatShortcutDisplay({ key: "s", modifiers: ["ctrl"] });
      const upper = result.toUpperCase();
      expect(upper === "CTRL+S" || upper === "⌘S").toBe(true);
    });

    it("formats bare function key", () => {
      expect(formatShortcutDisplay({ key: "F7", modifiers: [] })).toBe("F7");
    });
  });
});