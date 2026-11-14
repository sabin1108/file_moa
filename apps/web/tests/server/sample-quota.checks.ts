import { createHmac, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { afterAll, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getDatabase } from "../../src/server/database/client";
import { createAuthRateLimiter } from "../../src/server/auth/auth-rate-limit";

if (process.env.MOA_RUN_SAMPLE_QUOTA_CHECKS !== "1") throw new Error("Explicit quota verification opt-in required.");

process.loadEnvFile(resolve("apps/web/.env.local"));
process.chdir(resolve("apps/web"));

const secret = `sample-verification-${randomUUID()}`;
const prefix = `sample-verification:${randomUUID()}`;
const keys = new Set<string>();
const key = (suffix: string) => {
  const name = `${prefix}:${suffix}`;

  keys.add(createHmac("sha256", secret).update("moa-rate-limit-v1\0").update(name).digest("hex"));

  return name;
};

afterAll(async () => {
  await getDatabase().rateLimit.deleteMany({ where: { key: { in: [...keys] } } });
  await getDatabase().$disconnect();
});

it("reserves atomically across independent stores and rolls back denied unique request IDs", async () => {
  try {
    const stores = [createAuthRateLimiter(getDatabase, secret), createAuthRateLimiter(getDatabase, secret)];
    const rules = (request: string) => [
      { key: key("a-global"), max: 2, window: 3600 },
      { key: key(`request-${request}`), max: 1, window: 3600 },
      { key: key("z-session"), max: 1, window: 3600 },
    ];

    expect(await stores[0].consumeAll(rules("first"))).toMatchObject({ allowed: true });

    for (let i = 0; i < 3; i++) expect(await stores[1].consumeAll(rules(`denied-${i}`))).toMatchObject({ allowed: false });

    const rows = await getDatabase().rateLimit.findMany({ where: { key: { in: [...keys] } }, select: { count: true } });

    expect(rows).toHaveLength(3);
    expect(rows.every(row => row.count === 1)).toBe(true);

    const results = await Promise.all(Array.from({ length: 4 }, (_, i) => stores[i % 2].consumeAll([
      { key: key("parallel-global"), max: 2, window: 3600 }, { key: key(`parallel-request-${i}`), max: 1, window: 3600 },
    ])));

    expect(results.filter(result => result.allowed)).toHaveLength(2);
    expect(await getDatabase().rateLimit.count({ where: { key: { in: [...keys] } } })).toBe(6);
  } catch {
    throw new Error("Synthetic quota transaction/concurrency verification failed; private database diagnostics suppressed.");
  }
});
