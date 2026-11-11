import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getDatabase } from "../../src/server/database/client";
import { revalidateChatStream } from "../../src/server/chat-session";

if (process.env.MOA_RUN_CHAT_SESSION_LIVE !== "1") throw Error("Explicit read-only session check opt-in required.");

const output = resolve("docs/verification/chat-smoothness/performance");

process.loadEnvFile(resolve("apps/web/.env.local"));
process.chdir(resolve("apps/web"));

it("executes the parameterized stream guard and denies a nonexistent synthetic session", async () => {
  const started = performance.now();
  let passed = false;

  try {
    expect(await revalidateChatStream({
      userId: "fixture-nonexistent-owner",
      workspaceId: "fixture-nonexistent-workspace",
      sessionUserId: "fixture-nonexistent-login",
      sessionId: "fixture-nonexistent-session",
      sessionToken: "fixture-nonexistent-token",
      expiresAt: Date.now() + 60_000,
    })).toBe(false);
    passed = true;
  } catch {
    throw Error("Read-only stream guard syntax/denial check failed; no model or data mutation was requested.");
  }
  finally {
    await getDatabase().$disconnect();
    mkdirSync(output, { recursive: true });
    writeFileSync(resolve(output, "database-denial.json"), JSON.stringify({
      at: new Date().toISOString(),
      passed,
      elapsedMs: Math.round(performance.now() - started),
      condition: "Actual configured runtime role/TLS; SELECT plus transaction-local caller context, synthetic nonexistent identities. No writes, private rows returned/logged, model calls, or live valid-session/cross-user proof.",
    }, null, 2) + "\n");
  }
}, 30_000);
