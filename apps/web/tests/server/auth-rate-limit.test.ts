import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/prisma/client";

vi.mock("server-only", () => ({}));

import { createAuthRateLimiter } from "../../src/server/auth-rate-limit";

function fixture(rows: unknown[][]) {
  const query = vi.fn();

  rows.forEach(value => query.mockResolvedValueOnce(value));

  const cleanup = vi.fn().mockResolvedValue({ count: 0 });
  const database = { $queryRaw: query, rateLimit: { deleteMany: cleanup } } as unknown as PrismaClient;

  return { query, cleanup, store: createAuthRateLimiter(() => database, "fixture-auth-secret") };
}

describe("shared authentication limiter", () => {
  it("reserves five rules with one bound SQL statement and hashed keys only", async () => {
    const query = vi.fn(async (_sql: TemplateStringsArray, json: string) => {
      return (JSON.parse(json) as { key: string }[]).map(rule => ({ key: rule.key }));
    });
    const cleanup = vi.fn().mockResolvedValue({ count: 0 });
    const transaction = vi.fn(async (run: (value: { $queryRaw: typeof query }) => Promise<unknown>) => run({ $queryRaw: query }));
    const database = { $transaction: transaction, rateLimit: { deleteMany: cleanup } } as unknown as PrismaClient;
    const rules = Array.from(
      { length: 5 },
      (_, index) => ({ key: `private-fixture-${index}`, max: 10, window: 3600 })
    );

    expect(await createAuthRateLimiter(() => database, "fixture-auth-secret").consumeAll(rules)).toMatchObject({ allowed: true });
    expect(query).toHaveBeenCalledOnce();
    expect(transaction).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(query.mock.calls[0][1]).not.toContain("private-fixture");
  });

  it("uses an atomic database operation and never stores the raw request key", async () => {
    const { store, query } = fixture([[{ lastRequest: 1n }]]);

    expect(await store.consume("192.0.2.1:/sign-in/email", { max: 5, window: 60 })).toEqual({ allowed: true, retryAfter: null });

    const values = query.mock.calls[0].slice(1);

    expect(values.some(value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value))).toBe(true);
    expect(values.map(String).join(" ")).not.toContain("192.0.2.1");
  });
  it("denies a full window and returns only its retry interval", async () => {
    const { store } = fixture([[], [{ retryAfter: 12 }]]);

    expect(await store.consume("fixture-key", { max: 5, window: 60 })).toEqual({ allowed: false, retryAfter: 12 });
  });
  it("fails closed for invalid rules", async () => {
    const { store, query } = fixture([]);

    await expect(store.consume("fixture", { max: 0, window: 60 })).rejects.toThrow("Invalid authentication rate-limit rule.");
    expect(query).not.toHaveBeenCalled();
  });

  it("rolls back every reservation on a later denial, including new request IDs", async () => {
    const records = new Map<string, number>();
    const cleanup = vi.fn().mockResolvedValue({ count: 0 });
    const query = vi.fn(async (_strings: TemplateStringsArray, ...values: unknown[]) => {
      if (_strings.join("").includes("SELECT greatest")) return [{ retryAfter: 60 }];

      if (_strings.join("").includes("jsonb_to_recordset")) {
        const rules = JSON.parse(String(values[0])) as {
          key: string;
          maximum: number
        }[];

        return rules.flatMap(rule => {
          const count = records.get(rule.key) ?? 0;

          if (count >= rule.maximum) return [];

          records.set(rule.key, count + 1);

          return [{ key: rule.key }];
        });
      }

      const key = String(values[1]);
      const maximum = Number(values.at(-1));
      const count = records.get(key) ?? 0;

      if (count >= maximum) return [];

      records.set(key, count + 1);

      return [{ lastRequest: 1n }];
    });
    const transaction = vi.fn(async (run: (tx: { $queryRaw: typeof query }) => Promise<unknown>) => {
      const before = new Map(records);

      try {
        return await run({ $queryRaw: query });
      }
      catch (error) {
        records.clear();
        before.forEach((value, key) => records.set(key, value));

        throw error;
      }
    });
    const database = { $queryRaw: query, $transaction: transaction, rateLimit: { deleteMany: cleanup } } as unknown as PrismaClient;
    const store = createAuthRateLimiter(() => database, "fixture-auth-secret");
    const rules = (id: string) => [{ key: "a-global", max: 10, window: 60 }, { key: id, max: 1, window: 3600 }, { key: "z-session", max: 1, window: 3600 }];

    expect(await store.consumeAll(rules("request-first"))).toMatchObject({ allowed: true });

    const before = new Map(records);

    for (let i = 0; i < 5; i++) expect(await store.consumeAll(rules(`request-new-${i}`))).toMatchObject({ allowed: false });

    expect(records).toEqual(before);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
