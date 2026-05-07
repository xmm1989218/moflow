import { describe, it, expect, beforeEach } from "vitest";
import { useThemeStore } from "../stores/themeStore";

describe("themeStore", () => {
  beforeEach(() => {
    useThemeStore.setState({
      showSettingsTab: false,
      settingsTabActive: false,
      proxyUrl: "",
    });
  });

  describe("settings tab state", () => {
    it("initial state has settings tab hidden", () => {
      const state = useThemeStore.getState();
      expect(state.showSettingsTab).toBe(false);
      expect(state.settingsTabActive).toBe(false);
    });

    it("openSettingsTab shows and activates settings tab", () => {
      useThemeStore.getState().openSettingsTab();
      const state = useThemeStore.getState();
      expect(state.showSettingsTab).toBe(true);
      expect(state.settingsTabActive).toBe(true);
    });

    it("closeSettingsTab hides and deactivates settings tab", () => {
      useThemeStore.getState().openSettingsTab();
      useThemeStore.getState().closeSettingsTab();
      const state = useThemeStore.getState();
      expect(state.showSettingsTab).toBe(false);
      expect(state.settingsTabActive).toBe(false);
    });

    it("activateSettingsTab sets settingsTabActive to true", () => {
      useThemeStore.setState({ showSettingsTab: true, settingsTabActive: false });
      useThemeStore.getState().activateSettingsTab();
      expect(useThemeStore.getState().settingsTabActive).toBe(true);
    });

    it("deactivateSettingsTab sets settingsTabActive to false", () => {
      useThemeStore.setState({ showSettingsTab: true, settingsTabActive: true });
      useThemeStore.getState().deactivateSettingsTab();
      expect(useThemeStore.getState().settingsTabActive).toBe(false);
    });
  });

  describe("proxy state", () => {
    it("initial state has proxy disabled", () => {
      const state = useThemeStore.getState();
      expect(state.proxyUrl).toBe("");
    });

    it("setProxyUrl updates proxyUrl", () => {
      useThemeStore.getState().setProxyUrl("http://127.0.0.1:7890");
      expect(useThemeStore.getState().proxyUrl).toBe("http://127.0.0.1:7890");
    });

    it("setProxyUrl accepts socks5 URLs", () => {
      useThemeStore.getState().setProxyUrl("socks5://127.0.0.1:1080");
      expect(useThemeStore.getState().proxyUrl).toBe("socks5://127.0.0.1:1080");
    });

    it("setProxyUrl can be cleared", () => {
      useThemeStore.getState().setProxyUrl("http://127.0.0.1:7890");
      useThemeStore.getState().setProxyUrl("");
      expect(useThemeStore.getState().proxyUrl).toBe("");
    });
  });

  describe("existing theme actions", () => {
    it("setAppTheme updates appTheme", () => {
      useThemeStore.getState().setAppTheme("dark");
      expect(useThemeStore.getState().appTheme).toBe("dark");
      useThemeStore.getState().setAppTheme("system");
      expect(useThemeStore.getState().appTheme).toBe("system");
    });

    it("toggleAutoSave toggles autoSave", () => {
      expect(useThemeStore.getState().autoSave).toBe(false);
      useThemeStore.getState().toggleAutoSave();
      expect(useThemeStore.getState().autoSave).toBe(true);
      useThemeStore.getState().toggleAutoSave();
      expect(useThemeStore.getState().autoSave).toBe(false);
    });

    it("toggleStatusBar toggles showStatusBar", () => {
      expect(useThemeStore.getState().showStatusBar).toBe(true);
      useThemeStore.getState().toggleStatusBar();
      expect(useThemeStore.getState().showStatusBar).toBe(false);
    });
  });
});
