import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import type { PrismaClient } from "../../generated/prisma/client";

export function createAuthRateLimiter(database: () => PrismaClient, secret: string) {
  let lastCleanup = 0;
  return {
    async consume(requestKey: string, rule: { max: number; window: number }) {
      if (!Number.isSafeInteger(rule.max) || rule.max < 1 || !Number.isSafeInteger(rule.window) || rule.window < 1 || rule.window > 3600) throw new Error("Invalid authentication rate-limit rule.");
      const key = createHmac("sha256", secret).update("moa-rate-limit-v1\0").update(requestKey).digest("hex");
      const window = BigInt(rule.window * 1000);
      const rows = await database().$queryRaw<{ lastRequest: bigint }[]>`
        INSERT INTO moa_auth.rate_limit (id, key, count, "lastRequest")
        VALUES (${randomUUID()}, ${key}, 1, (extract(epoch FROM statement_timestamp()) * 1000)::bigint)
        ON CONFLICT (key) DO UPDATE SET
          count = CASE WHEN rate_limit."lastRequest" <= EXCLUDED."lastRequest" - ${window}
            THEN 1 ELSE rate_limit.count + 1 END,
          "lastRequest" = EXCLUDED."lastRequest"
        WHERE rate_limit."lastRequest" <= EXCLUDED."lastRequest" - ${window} OR rate_limit.count < ${rule.max}
        RETURNING "lastRequest"`;
      if (rows.length) {
        const now = Date.now();
        if (now - lastCleanup > 60_000) {
          lastCleanup = now;
          await database().rateLimit.deleteMany({ where: { lastRequest: { lt: BigInt(now - 86_400_000) } } });
        }
        return { allowed: true, retryAfter: null };
      }
      const retry = await database().$queryRaw<{ retryAfter: number }[]>`
        SELECT greatest(1, ceil(("lastRequest" + ${window} - (extract(epoch FROM statement_timestamp()) * 1000)::bigint) / 1000.0))::int AS "retryAfter"
        FROM moa_auth.rate_limit WHERE key = ${key}`;
      return { allowed: false, retryAfter: retry[0]?.retryAfter ?? rule.window };
    },
  };
}
