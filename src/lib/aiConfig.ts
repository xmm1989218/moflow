import { appDataDir, join } from "@tauri-apps/api/path";
import { readFile, writeFile, exists } from "@tauri-apps/plugin-fs";

export interface AIConfig {
  mode: "mock" | "real";
  providerId: string;
  provider: "openai-compatible" | "claude-compatible";
  apiEndpoint: string;
  apiToken: string;
  model: string;
}

export const defaultAIConfig: AIConfig = {
  mode: "mock",
  providerId: "custom",
  provider: "openai-compatible",
  apiEndpoint: "",
  apiToken: "",
  model: "",
};

export async function readAIConfig(): Promise<AIConfig | null> {
  try {
    const dir = await appDataDir();
    const configPath = await join(dir, "ai-config.json");
    if (!(await exists(configPath))) {
      return null;
    }
    const data = await readFile(configPath);
    const parsed = JSON.parse(new TextDecoder().decode(data));
    return { ...defaultAIConfig, ...parsed };
  } catch {
    return null;
  }
}

export async function writeAIConfig(config: AIConfig): Promise<void> {
  try {
    const dir = await appDataDir();
    const configPath = await join(dir, "ai-config.json");
    const json = JSON.stringify(config, null, 2);
    await writeFile(configPath, new TextEncoder().encode(json));
  } catch (e) {
    console.error("[writeAIConfig] error:", e);
  }
}
