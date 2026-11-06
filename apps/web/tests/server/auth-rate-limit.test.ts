import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/prisma/client";
vi.mock("server-only", () => ({}));
import { createAuthRateLimiter } from "../../src/server/auth-rate-limit";

function fixture(rows: unknown[][]) {
  const query = vi.fn(); rows.forEach(value => query.mockResolvedValueOnce(value));
  const cleanup = vi.fn().mockResolvedValue({ count: 0 });
  const database = { $queryRaw: query, rateLimit: { deleteMany: cleanup } } as unknown as PrismaClient;
  return { query, cleanup, store: createAuthRateLimiter(() => database, "fixture-auth-secret") };
}
describe("shared authentication limiter", () => {
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
});
