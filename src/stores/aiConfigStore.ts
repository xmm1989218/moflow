import { create } from "zustand";
import { defaultAIConfig, readAIConfig, writeAIConfig, type AIConfig } from "../lib/aiConfig";

interface AIConfigState {
  config: AIConfig;
  loaded: boolean;
  loadConfig: () => Promise<void>;
  saveConfig: (config: AIConfig) => Promise<void>;
}

export const useAIConfigStore = create<AIConfigState>((set) => ({
  config: { ...defaultAIConfig },
  loaded: false,

  loadConfig: async () => {
    const saved = await readAIConfig();
    if (saved) {
      set({ config: saved, loaded: true });
    } else {
      set({ loaded: true });
    }
  },

  saveConfig: async (config) => {
    await writeAIConfig(config);
    set({ config });
  },
}));
