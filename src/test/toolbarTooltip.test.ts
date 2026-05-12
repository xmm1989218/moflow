import { describe, it, expect } from "vitest";
import { getToolbarTooltipMap, BUILT_IN_TOOLTIP_KEYS } from "../lib/toolbarTooltip";

describe("toolbar tooltip mapping", () => {
  it("every BUILT_IN_TOOLTIP_KEYS entry has a tooltip", () => {
    const map = getToolbarTooltipMap();
    for (const key of BUILT_IN_TOOLTIP_KEYS) {
      expect(map[key]).toBeDefined();
    }
  });

  it("every custom toolbar key has a tooltip", () => {
    const map = getToolbarTooltipMap();
    const customKeys = ["highlight", "explain", "translate", "ask"];
    for (const key of customKeys) {
      expect(map[key]).toBeDefined();
    }
  });

  it("all tooltip values are non-empty strings", () => {
    const map = getToolbarTooltipMap();
    for (const [key, value] of Object.entries(map)) {
      expect(value.length, `tooltip for "${key}" should not be empty`).toBeGreaterThan(0);
    }
  });

  it("BUILT_IN_TOOLTIP_KEYS has correct known order", () => {
    expect(BUILT_IN_TOOLTIP_KEYS.slice(0, 3)).toEqual(["bold", "italic", "strikethrough"]);
    expect(BUILT_IN_TOOLTIP_KEYS).toContain("code");
    expect(BUILT_IN_TOOLTIP_KEYS).toContain("link");
  });
});
