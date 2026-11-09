import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { getDatabase } from "../../src/server/database/client";

if (process.env.MOA_RUN_CHAT_NETWORK_READONLY !== "1") throw Error("Explicit read-only latency opt-in required.");
const output = resolve("docs/verification/recording-latency/performance");
process.loadEnvFile(resolve("apps/web/.env.local"));
process.chdir(resolve("apps/web"));

it("compares SELECT-only round trips without accessing application records", async () => {
  const database = getDatabase();
  const samples: { query: string; elapsedMs: number }[] = [];
  const measure = async (query: string, run: () => Promise<unknown>) => {
    const started = performance.now();
    expect(await run()).toEqual([{ reachable: 1 }]);
    samples.push({ query, elapsedMs: Math.round(performance.now() - started) });
  };
  try {
    await measure("cold SELECT 1", () => database.$queryRaw`SELECT 1::integer AS reachable`);
    for (let index = 0; index < 3; index++) {
      await measure("warm SELECT 1", () => database.$queryRaw`SELECT 1::integer AS reachable`);
      await measure("BEGIN + READ ONLY + SELECT 1 + COMMIT", () => database.$transaction(async tx => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        return tx.$queryRaw`SELECT 1::integer AS reachable`;
      }));
    }
    const paired: { mode: "sequential" | "parallel"; elapsedMs: number }[] = [];
    const readOnlyRoundTrip = () => database.$transaction(async tx => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      return tx.$queryRaw`SELECT 1::integer AS reachable`;
    });
    await Promise.all([readOnlyRoundTrip(), readOnlyRoundTrip()]);
    for (let index = 0; index < 3; index++) {
      for (const mode of ["sequential", "parallel"] as const) {
        const started = performance.now();
        const results = mode === "parallel" ? await Promise.all([readOnlyRoundTrip(), readOnlyRoundTrip()]) : [await readOnlyRoundTrip(), await readOnlyRoundTrip()];
        expect(results).toEqual([[{ reachable: 1 }], [{ reachable: 1 }]]);
        paired.push({ mode, elapsedMs: Math.round(performance.now() - started) });
      }
    }
    const region = new URL(process.env.DATABASE_URL!).hostname.match(/(?:ap|us|eu|sa|ca|me|af)-[a-z]+-\d/u)?.[0] ?? "unidentified";
    mkdirSync(output, { recursive: true });
    writeFileSync(resolve(output, "database-roundtrips.json"), JSON.stringify({
      at: new Date().toISOString(), region, samples,
      condition: "Configured runtime adapter/TLS; only SELECT 1 and explicit read-only transactions. No application records, quotas, models or writes. Small sequential diagnostic, not production load or user latency.",
    }, null, 2));
    expect(readFileSync(resolve(output, "database-roundtrips.json"), "utf8")).not.toContain(process.env.DATABASE_URL);
    writeFileSync(resolve(output, "paired-roundtrips.json"), JSON.stringify({
      at: new Date().toISOString(), region, samples: paired,
      condition: "Configured runtime adapter/TLS; warmed two connections, two SELECT-only transactions sequentially versus concurrently, three pairs. This isolates network overlap; it does not execute ledger writes, authorization, models or actual chat requests and cannot establish user-visible latency savings.",
    }, null, 2));
    expect(readFileSync(resolve(output, "paired-roundtrips.json"), "utf8")).not.toContain(process.env.DATABASE_URL);
  } finally { await database.$disconnect(); }
}, 30_000);
