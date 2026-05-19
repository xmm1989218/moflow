import { describe, it, expect } from "vitest";
import { defaultSettings, defaultAIConfig } from "../lib/settings";
import type { AppSettings } from "../lib/settings";

describe("settings", () => {
  describe("defaultSettings", () => {
    it("has proxyUrl empty by default", () => {
      expect(defaultSettings.proxyUrl).toBe("");
    });

    it("has all required fields", () => {
      const keys = Object.keys(defaultSettings);
      expect(keys).toContain("appTheme");
      expect(keys).toContain("editorTheme");
      expect(keys).toContain("autoSave");
      expect(keys).toContain("showStatusBar");
      expect(keys).toContain("sidebarWidth");
      expect(keys).toContain("aiConfig");
      expect(keys).toContain("proxyUrl");
      expect(keys).toContain("aiMode");
      expect(keys).toContain("shortcutOverrides");
    });

    it("aiMode defaults to build", () => {
      expect(defaultSettings.aiMode).toBe("build");
    });

    it("shortcutOverrides defaults to empty object", () => {
      expect(defaultSettings.shortcutOverrides).toEqual({});
    });
  });

  describe("defaultAIConfig", () => {
    it("has mock mode by default", () => {
      expect(defaultAIConfig.mode).toBe("mock");
    });
  });

  describe("readSettings backward compatibility", () => {
    it("merges proxyUrl with default when missing from parsed JSON", () => {
      const parsed: Record<string, unknown> = {
        appTheme: "dark",
        editorTheme: "github-dark",
        autoSave: true,
        showStatusBar: true,
        sidebarWidth: 400,
        aiConfig: { ...defaultAIConfig },
      };
      const settings: AppSettings = {
        ...defaultSettings,
        ...(parsed as Partial<AppSettings>),
        aiConfig: { ...defaultAIConfig, ...((parsed.aiConfig as Record<string, unknown>) || {}) },
        proxyUrl: (parsed.proxyUrl as string | undefined) ?? "",
      };
      expect(settings.proxyUrl).toBe("");
      expect(settings.appTheme).toBe("dark");
      expect(settings.sidebarWidth).toBe(400);
    });

    it("preserves proxyUrl when present in parsed JSON", () => {
      const parsed: Record<string, unknown> = {
        appTheme: "system",
        proxyUrl: "socks5://127.0.0.1:1080",
      };
      const settings: AppSettings = {
        ...defaultSettings,
        ...(parsed as Partial<AppSettings>),
        aiConfig: { ...defaultAIConfig, ...((parsed.aiConfig as Record<string, unknown>) || {}) },
        proxyUrl: (parsed.proxyUrl as string | undefined) ?? "",
      };
      expect(settings.proxyUrl).toBe("socks5://127.0.0.1:1080");
    });
  });
});
