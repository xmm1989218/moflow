import { create } from "zustand";
import { defaultAIConfig, type AIConfig } from "../lib/settings";
import { useAppStore } from "./appStore";

interface AIConfigState {
  config: AIConfig;
  loaded: boolean;
  loadConfig: () => void;
  saveConfig: (config: AIConfig) => void;
}

export const useAIConfigStore = create<AIConfigState>((set) => ({
  config: { ...defaultAIConfig },
  loaded: false,

  loadConfig: () => {
    const aiConfig = useAppStore.getState().aiConfig;
    if (aiConfig) {
      set({ config: aiConfig, loaded: true });
    } else {
      set({ loaded: true });
    }
  },

  saveConfig: (config) => {
    set({ config });
    useAppStore.getState().setAIConfig(config);
  },
}));
