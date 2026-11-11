import type { AiProvider } from "./ai-provider";
import type { SampleAiUsage } from "./sample-ai";

export type UsageEntry = {
  requestId: string;
  provider: string;
  operation: string;
  status: string;
  model: string | null;
  createdAt: string;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null
};

export type UsageSummary = {
  ledger: "enabled" | "not-enabled" | "unavailable";
  entries: UsageEntry[];
  used: number;
  limit: number;
  retryAfter: number;
};

export type TokenPrice = {
  provider: AiProvider;
  model: string;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  checkedAt: string
};
// Standard text processing; cache discounts, regional fees and actual billing are excluded.

export const REVIEWED_TOKEN_PRICES: readonly TokenPrice[] = [{
  provider: "openai",
  model: "gpt-6-luna",
  inputUsdPerMillion: 0.10,
  outputUsdPerMillion: 0.50,
  checkedAt: "2026-11-09"
}];

/** Estimates only when an explicitly reviewed model price and complete usage are available. */

export function estimateUsageCost(provider: AiProvider, model: string, usage: SampleAiUsage | null, prices: readonly TokenPrice[]): number | null {
  const price = prices.find(item => item.provider === provider && item.model === model);

  if (!usage || !price) return null;

  if (![usage.inputTokens, usage.outputTokens, usage.totalTokens].every(value => Number.isSafeInteger(value) && value >= 0)) return null;

  if (![price.inputUsdPerMillion, price.outputUsdPerMillion].every(value => Number.isFinite(value) && value >= 0)) return null;

  return (usage.inputTokens * price.inputUsdPerMillion + usage.outputTokens * price.outputUsdPerMillion) / 1_000_000;
}
