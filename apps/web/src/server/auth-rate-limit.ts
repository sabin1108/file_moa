import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import type { PrismaClient } from "../../generated/prisma/client";

type LimitRule = Readonly<{
  max: number;
  window: number
}>;

class ReservationDenied extends Error {
  constructor(readonly retryAfter: number) {
    super("rate-limit-denied");
  }
}

function validateRule(rule: LimitRule) {
  if (!Number.isSafeInteger(rule.max) || rule.max < 1 || rule.max > 2_147_483_647 || !Number.isSafeInteger(rule.window)
    || rule.window < 1
    || rule.window > 3600) throw new Error("Invalid authentication rate-limit rule.");
}

export function createAuthRateLimiter(database: () => PrismaClient, secret: string) {
  let lastCleanup = 0;
  const hashKey = (key: string) => createHmac("sha256", secret).update("moa-rate-limit-v1\0").update(key).digest("hex");

  async function reserve(db: Pick<PrismaClient, "$queryRaw">, requestKey: string, rule: LimitRule) {
    validateRule(rule);

    const key = hashKey(requestKey);
    const window = BigInt(rule.window * 1000);
    const rows = await db.$queryRaw<{ lastRequest: bigint }[]>`
        INSERT INTO moa_auth.rate_limit (id, key, count, "lastRequest")
        VALUES (${randomUUID()}, ${key}, 1, (extract(epoch FROM statement_timestamp()) * 1000)::bigint)
        ON CONFLICT (key) DO UPDATE SET
          count = CASE WHEN rate_limit."lastRequest" <= EXCLUDED."lastRequest" - ${window}
            THEN 1 ELSE rate_limit.count + 1 END,
          "lastRequest" = EXCLUDED."lastRequest"
        WHERE rate_limit."lastRequest" <= EXCLUDED."lastRequest" - ${window} OR rate_limit.count < ${rule.max}
        RETURNING "lastRequest"`;

    if (rows.length) return { allowed: true, retryAfter: null };

    const retry = await db.$queryRaw<{ retryAfter: number }[]>`
        SELECT greatest(1, ceil(("lastRequest" + ${window} - (extract(epoch FROM statement_timestamp()) * 1000)::bigint) / 1000.0))::int AS "retryAfter"
        FROM moa_auth.rate_limit WHERE key = ${key}`;

    return { allowed: false, retryAfter: retry[0]?.retryAfter ?? rule.window };
  }

  async function cleanup() {
    const now = Date.now();

    if (now - lastCleanup > 60_000) {
      lastCleanup = now;
      await database().rateLimit.deleteMany({ where: { lastRequest: { lt: BigInt(now - 86_400_000) } } });
    }
  }

  return {
    async consume(requestKey: string, rule: LimitRule) {
      const result = await reserve(database(), requestKey, rule);

      if (result.allowed) await cleanup();

      return result;
    },
    async consumeAll(rules: readonly (LimitRule & { key: string })[]) {
      if (!rules.length || rules.length > 8 || new Set(rules.map(rule => rule.key)).size !== rules.length) throw new Error("Invalid rate-limit reservations.");

      const prepared = [...rules].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0).map((rule, position) => {
        validateRule(rule);

        return {
          id: randomUUID(),
          key: hashKey(rule.key),
          maximum: rule.max,
          window_ms: rule.window * 1000,
          position
        };
      });

      if (new Set(prepared.map(rule => rule.key)).size !== prepared.length) throw new Error("Invalid rate-limit reservations.");

      try {
        await database().$transaction(async tx => {
          // Keep the existing lock order and rollback all rows if any reservation is denied.
          const reserved = await tx.$queryRaw<{ key: string }[]>`
            WITH rules AS (
              SELECT * FROM jsonb_to_recordset(${JSON.stringify(prepared)}::jsonb)
                AS rule(id text, key text, maximum integer, window_ms bigint, position integer)
            )
            INSERT INTO moa_auth.rate_limit (id, key, count, "lastRequest")
            SELECT id, key, 1, (extract(epoch FROM statement_timestamp()) * 1000)::bigint
            FROM rules ORDER BY position
            ON CONFLICT (key) DO UPDATE SET
              count = CASE WHEN rate_limit."lastRequest" <= EXCLUDED."lastRequest" -
                (SELECT window_ms FROM rules WHERE rules.key = EXCLUDED.key)
                THEN 1 ELSE rate_limit.count + 1 END,
              "lastRequest" = EXCLUDED."lastRequest"
            WHERE rate_limit."lastRequest" <= EXCLUDED."lastRequest" -
              (SELECT window_ms FROM rules WHERE rules.key = EXCLUDED.key)
              OR rate_limit.count < (SELECT maximum FROM rules WHERE rules.key = EXCLUDED.key)
            RETURNING key`;
          const accepted = new Set(reserved.map(row => row.key));
          const denied = prepared.find(rule => !accepted.has(rule.key));

          if (reserved.length !== prepared.length || accepted.size !== prepared.length || denied) {
            if (!denied) throw new Error("Invalid rate-limit reservation result.");

            const retry = await tx.$queryRaw<{ retryAfter: number }[]>`
              SELECT greatest(1, ceil(("lastRequest" + ${BigInt(denied.window_ms)} -
                (extract(epoch FROM statement_timestamp()) * 1000)::bigint) / 1000.0))::int AS "retryAfter"
              FROM moa_auth.rate_limit WHERE key = ${denied.key}`;

            throw new ReservationDenied(retry[0]?.retryAfter ?? denied.window_ms / 1000);
          }
        });
        await cleanup();

        return { allowed: true, retryAfter: null };
      } catch (error) {
        if (error instanceof ReservationDenied) return { allowed: false, retryAfter: error.retryAfter };

        throw error;
      }
    },
  };
}
