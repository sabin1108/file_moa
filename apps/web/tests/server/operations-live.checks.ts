import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { getDatabase } from "../../src/server/database/client";

if (process.env.MOA_RUN_OPERATIONS_LIVE !== "1") throw Error("Explicit read-only operations check opt-in required.");
const output = resolve("docs/verification/completion-five/operations");
process.loadEnvFile(resolve("apps/web/.env.local"));
process.chdir(resolve("apps/web"));

it("checks the configured production DB connection with a read-only transaction", async () => {
  const started = performance.now();
  let passed = false;
  const database = getDatabase();
  try {
    const rows = await database.$transaction(async transaction => {
      await transaction.$executeRaw`SET TRANSACTION READ ONLY`;
      return transaction.$queryRaw<{ reachable: number }[]>`SELECT 1::integer AS reachable`;
    });
    expect(rows).toEqual([{ reachable: 1 }]); passed = true;
  } catch { throw Error("Read-only DB reachability check failed; no application data was read or changed."); }
  finally {
    await database.$disconnect();
    mkdirSync(output, { recursive: true });
    writeFileSync(resolve(output, "database.json"), JSON.stringify({ at: new Date().toISOString(), condition: "Configured production database adapter; read-only SELECT 1. No identity records, quota mutations, model requests or ownership test.", passed, elapsedMs: Math.round(performance.now() - started) }, null, 2) + "\n");
  }
});
