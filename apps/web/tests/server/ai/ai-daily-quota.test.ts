import { afterEach, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../../generated/prisma/client";
import { AI_DAILY_LIMITS, aiUsageDay } from "../../../src/shared/ai-daily-limits";
import { dailyAiRules, liveAiRules } from "../../../src/server/ai/ai-quota";
import { createAuthRateLimiter } from "../../../src/server/auth/auth-rate-limit";
vi.mock("server-only", () => ({}));
afterEach(() => vi.useRealTimers());

it("uses KST calendar boundaries and keeps one user's daily key across workspaces", () => {
  const before = Date.parse("2026-11-16T23:59:59+09:00");
  expect(aiUsageDay(before).date).toBe("2026-11-16");
  expect(aiUsageDay(before + 1000).date).toBe("2026-11-17");
  expect(liveAiRules({ workspaceId: "one", sessionUserId: "same-user" }, "request-one", before).slice(1))
    .toEqual(liveAiRules({ workspaceId: "two", sessionUserId: "same-user" }, "request-two", before).slice(1));
  expect(dailyAiRules("demo", "same-user", before).every(rule => !dailyAiRules("live", "same-user", before).some(other => other.key === rule.key))).toBe(true);
});

it.each([{ kind: "demo", global: false }, { kind: "live", global: false }, { kind: "demo", global: true }] as const)("reserves the daily boundary atomically and grants a new calendar day (%j)", async scenario => {
  const kind = scenario.kind;
  const counts = new Map<string, number>();
  const query = vi.fn(async (sql: TemplateStringsArray, json?: string) => {
    if (sql.join("").includes("SELECT greatest")) return [{ retryAfter: 86400 }];
    const rules = JSON.parse(json!) as { key: string; maximum: number }[];
    return rules.filter(rule => {
      if ((counts.get(rule.key) ?? 0) >= rule.maximum) return false;
      counts.set(rule.key, (counts.get(rule.key) ?? 0) + 1);
      return true;
    }).map(rule => ({ key: rule.key }));
  });
  const transaction = async (run: (tx: unknown) => Promise<unknown>) => {
    const before = new Map(counts);
    try { return await run({ $queryRaw: query }); }
    catch (error) { counts.clear(); before.forEach((value, key) => counts.set(key, value)); throw error; }
  };
  const db = { $transaction: transaction, rateLimit: { deleteMany: async () => ({ count: 0 }) } } as unknown as PrismaClient;
  const limiter = createAuthRateLimiter(() => db, "synthetic-daily-quota-secret");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-16T23:59:59+09:00"));
  const maximum = scenario.global ? AI_DAILY_LIMITS.global : AI_DAILY_LIMITS[kind];
  for (let n = 0; n < maximum; n++) {
    const identity = scenario.global ? `visitor-${Math.floor(n / AI_DAILY_LIMITS.demo)}` : "one-visitor";
    expect(await limiter.consumeAll(dailyAiRules(kind, identity, Date.now()))).toMatchObject({ allowed: true });
  }
  const before = new Map(counts);
  expect(await limiter.consumeAll(dailyAiRules(kind, scenario.global ? "extra-visitor" : "one-visitor", Date.now()))).toEqual({ allowed: false, retryAfter: 1 });
  expect(counts).toEqual(before);
  if (scenario.global) expect(await limiter.consumeAll(dailyAiRules("live", "one-visitor", Date.now()))).toMatchObject({ allowed: true });
  vi.setSystemTime(new Date("2026-11-17T00:00:00+09:00"));
  expect(await limiter.consumeAll(dailyAiRules(kind, "one-visitor", Date.now()))).toMatchObject({ allowed: true });
});
