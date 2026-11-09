import { describe, expect, it } from "vitest";
import { estimateUsageCost, type TokenPrice } from "../../src/shared/ai-usage";

const prices: TokenPrice[] = [{
  provider: "openai", model: "gpt-fixture", inputUsdPerMillion: 2.5, outputUsdPerMillion: 10, checkedAt: "2026-11-09",
}];

describe("usage cost estimates", () => {
  it("calculates from reviewed per-million input and output prices", () => {
    expect(estimateUsageCost("openai", "gpt-fixture", { inputTokens: 2_000_000, outputTokens: 500_000, totalTokens: 2_500_000 }, prices)).toBe(10);
  });

  it("does not estimate without complete usage or an exact reviewed model price", () => {
    expect(estimateUsageCost("openai", "gpt-fixture", null, prices)).toBeNull();
    expect(estimateUsageCost("openai", "other-model", { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, prices)).toBeNull();
  });

  it("rejects negative and non-finite reviewed prices", () => {
    const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };
    expect(estimateUsageCost("openai", "gpt-fixture", usage, [{ ...prices[0], inputUsdPerMillion: -1 }])).toBeNull();
    expect(estimateUsageCost("openai", "gpt-fixture", usage, [{ ...prices[0], outputUsdPerMillion: Number.NaN }])).toBeNull();
  });
});
