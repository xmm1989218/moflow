import pricingData from "./modelPricing.json";

export interface ModelEntry {
  id: string;
  maxContext: number;
  inputPricePer1M: number;
  outputPricePer1M: number;
  currency: "USD" | "CNY";
}

export interface ProviderInfo {
  label: string;
  labelZh: string;
  defaultEndpoint: string;
  compatibility: "openai" | "claude";
  models: ModelEntry[];
}

export type ProviderId = keyof (typeof pricingData.providers);

const defaultModelEntry: ModelEntry = {
  id: "",
  maxContext: 0,
  inputPricePer1M: 0,
  outputPricePer1M: 0,
  currency: "USD",
};

const providersMap = pricingData.providers as Record<string, ProviderInfo>;

export function getProviders(): { id: string; label: string; labelZh: string }[] {
  return Object.entries(providersMap).map(([id, p]) => ({
    id,
    label: p.label,
    labelZh: p.labelZh,
  }));
}

export function getProviderInfo(providerId: string): ProviderInfo | null {
  return providersMap[providerId] ?? null;
}

export function getProviderModels(providerId: string): ModelEntry[] {
  return getProviderInfo(providerId)?.models ?? [];
}

export function getModelInfo(providerId: string, model: string): ModelEntry {
  const provider = getProviderInfo(providerId);
  if (!provider) return { ...defaultModelEntry };

  const exact = provider.models.find((m) => m.id === model);
  if (exact) return exact;

  const sorted = [...provider.models].sort((a, b) => b.id.length - a.id.length);
  const prefix = sorted.find((m) => model.startsWith(m.id));
  if (prefix) return prefix;

  return { ...defaultModelEntry };
}

export function calculateCost(
  promptTokens: number,
  completionTokens: number,
  providerId: string,
  model: string,
  cachedTokens?: number,
  cacheCreationTokens?: number
): { cost: number; currency: string; cacheSavings: number } {
  const info = getModelInfo(providerId, model);
  const isClaude = getProviderInfo(providerId)?.compatibility === "claude";
  const nonCachedInput = Math.max(0, promptTokens - (cachedTokens ?? 0) - (cacheCreationTokens ?? 0));
  const inputCost = (nonCachedInput / 1_000_000) * info.inputPricePer1M;
  const cachedInputCost = isClaude
    ? ((cachedTokens ?? 0) / 1_000_000) * info.inputPricePer1M * 0.1
    : ((cachedTokens ?? 0) / 1_000_000) * info.inputPricePer1M * 0.5;
  const cacheCreationCost = isClaude
    ? ((cacheCreationTokens ?? 0) / 1_000_000) * info.inputPricePer1M * 1.25
    : 0;
  const outputCost = (completionTokens / 1_000_000) * info.outputPricePer1M;
  const fullInputCost = (promptTokens / 1_000_000) * info.inputPricePer1M;
  const cacheSavings = fullInputCost - (inputCost + cachedInputCost + cacheCreationCost);
  return { cost: inputCost + cachedInputCost + cacheCreationCost + outputCost, currency: info.currency, cacheSavings: Math.max(0, cacheSavings) };
}

export function formatCost(cost: number, currency: string): string {
  if (cost === 0) {
    return currency === "CNY" ? "¥0" : "$0";
  }
  if (currency === "CNY") {
    if (cost < 0.01) return "¥<0.01";
    return `¥${cost.toFixed(2)}`;
  }
  if (cost < 0.01) return "$<0.01";
  return `$${cost.toFixed(2)}`;
}
