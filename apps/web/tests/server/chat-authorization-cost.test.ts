import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("server-only", () => ({}));

const database = vi.hoisted(() => ({ value: {} as object }));
const authentication = vi.hoisted(() => vi.fn());

vi.mock("../../src/server/database/client", () => ({ getDatabase: () => database.value }));
vi.mock(
  "../../src/server/authenticated-session",
  () => ({ getAuthenticatedSession: authentication })
);

import { readChatSession, revalidateChatStream } from "../../src/server/chat-session";

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] }));
afterEach(() => vi.useRealTimers());

it("removes workspace preparation and duplicate protocol reads from a fresh publication check", async () => {
  // Fixed I/O latency isolates application round trips; this is not a production latency estimate.
  const operation = <T,>(value: T) => vi.fn(async () => {
    await wait(80);

    return value;
  });
  const user = { id: "login-A", name: "이름", emailVerified: true };
  const session = { id: "session-A", token: "fixture-token", expiresAt: new Date(Date.now() + 60_000) };

  authentication.mockImplementation(async () => {
    await wait(80);

    return { user, session };
  });

  const create = operation({ count: 0 });
  const transaction = {
    $executeRaw: operation(1),
    $queryRaw: operation([{ name: "이름" }]),
    workspace: { createMany: create, findUniqueOrThrow: operation({ id: "workspace-A", ownerUserId: "owner-A" }) },
    loginConnectionMember: {
      findUnique: operation({ connection: { primaryOwnerUserId: "owner-A", members: [{ userId: "owner-A" }] } })
    },
  };

  database.value = {
    $transaction: async (callback: (value: typeof transaction) => Promise<unknown>) => {
      await wait(40);

      const result = await callback(transaction);

      await wait(40);

      return result;
    }
  };

  const beforeStart = performance.now();
  const beforeRequest = readChatSession(new Headers());

  await vi.runAllTimersAsync();

  const snapshot = await beforeRequest;
  const beforeMs = performance.now() - beforeStart;

  expect(snapshot).not.toBeNull();

  const previousAuthReads = authentication.mock.calls.length;
  const previousPreparations = create.mock.calls.length;

  const afterStart = performance.now();
  const afterRequest = revalidateChatStream(snapshot!);

  await vi.runAllTimersAsync();
  expect(await afterRequest).toBe(true);

  const afterMs = performance.now() - afterStart;

  expect(afterMs).toBeLessThan(beforeMs);
  expect(afterMs).toBeLessThanOrEqual(240);
  expect(authentication).toHaveBeenCalledTimes(previousAuthReads);
  expect(create).toHaveBeenCalledTimes(previousPreparations);

  if (process.env.MOA_RECORD_CHAT_PERFORMANCE === "1") {
    const output = resolve("docs/verification/chat-smoothness/performance");

    mkdirSync(output, { recursive: true });
    writeFileSync(resolve(output, "authorization-fixture.json"), JSON.stringify({
      condition: "Actual old full guard and new fresh guard/workspace code with fixed 80ms per mocked I/O and 40ms transaction boundaries. No production/user/model latency claim.",
      beforeMs,
      afterMs,
      previousAuthReads,
      previousPreparations,
    }, null, 2));
  }
});
