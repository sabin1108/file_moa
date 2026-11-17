import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { dailyAiRules } from "../../../src/server/ai/ai-quota";

vi.mock("server-only", () => ({}));

const calls = vi.hoisted(() => ({ database: vi.fn(), session: vi.fn() }));

vi.mock("../../../src/server/database/client", () => ({ getDatabase: calls.database }));
vi.mock("../../../src/server/chat/chat-session", () => ({ readChatSession: calls.session }));

import { finishUsage, readUsage, startUsage } from "../../../src/server/ai/ai-usage";

const owner = { workspaceId: "workspace-a", sessionUserId: "user-a" };
const requestId = "request-a";

function ledgerFixture(options?: {
  updateCounts?: number[];
  entries?: unknown[];
  failRead?: boolean
}) {
  const execute = vi.fn();
  const create = vi.fn().mockResolvedValue({});
  const updateMany = vi.fn();

  for (const count of options?.updateCounts ?? [1]) updateMany.mockResolvedValueOnce({ count });

  const findMany = vi.fn().mockResolvedValue(options?.entries ?? []);
  const transaction = vi.fn(async (operation: (tx: unknown) => Promise<unknown>) => {
    if (options?.failRead) throw new Error("fixture-ledger-unavailable");

    return operation({ $executeRaw: execute, aiUsageEvent: { create, updateMany, findMany } });
  });
  const rateLimitFind = vi.fn().mockResolvedValue([]);

  calls.database.mockReturnValue({ $transaction: transaction, rateLimit: { findMany: rateLimitFind } });

  return { execute, create, updateMany, findMany, transaction, rateLimitFind };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("AI_USAGE_LEDGER_ENABLED", "true");
  vi.stubEnv("BETTER_AUTH_SECRET", "fixture-usage-secret");
});

describe("AI usage ledger write boundaries", () => {
  it("reserves one usage event under the authenticated workspace context", async () => {
    const fixture = ledgerFixture();

    await startUsage(owner, requestId, "openai", "chat");

    expect(fixture.transaction).toHaveBeenCalledOnce();
    expect(fixture.execute).toHaveBeenCalledOnce();
    expect(fixture.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace-a",
        requestId,
        provider: "openai",
        operation: "chat",
        status: "reserved",
      })
    });
  });

  it("does not call the database while the migration ledger is disabled", async () => {
    vi.stubEnv("AI_USAGE_LEDGER_ENABLED", "false");

    await startUsage(owner, requestId, "openai", "chat");
    await finishUsage(owner, requestId, "gpt-fixture", { inputTokens: 2, outputTokens: 3, totalTokens: 5 });

    expect(calls.database).not.toHaveBeenCalled();
  });

  it("settles a reservation only with its workspace, request id, and reserved state", async () => {
    const fixture = ledgerFixture();

    await finishUsage(owner, requestId, "gpt-fixture", { inputTokens: 2, outputTokens: 3, totalTokens: 5 });

    expect(fixture.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: "workspace-a", requestId, status: "reserved" },
      data: expect.objectContaining({
        status: "completed",
        model: "gpt-fixture",
        inputTokens: 2,
        outputTokens: 3,
        totalTokens: 5,
      }),
    });
  });

  it("records an unknown terminal state when the provider returns no usage", async () => {
    const fixture = ledgerFixture();

    await finishUsage(owner, requestId, null, null);

    expect(fixture.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "unknown",
        model: null,
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
      }),
    }));
  });

  it("keeps known partial batch tokens without presenting them as complete usage", async () => {
    const fixture = ledgerFixture();
    await finishUsage(owner, requestId, "fixture", { inputTokens: 5, outputTokens: 7, totalTokens: 12 }, false);
    expect(fixture.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "unknown", inputTokens: 5, outputTokens: 7, totalTokens: 12 }) }));
  });

  it("does not overwrite an already terminal event on a duplicate final settlement", async () => {
    const fixture = ledgerFixture({ updateCounts: [1, 0] });

    await finishUsage(owner, requestId, "first-model", { inputTokens: 2, outputTokens: 3, totalTokens: 5 });
    await finishUsage(
      owner,
      requestId,
      "second-model",
      { inputTokens: 20, outputTokens: 30, totalTokens: 50 }
    );

    expect(fixture.updateMany).toHaveBeenCalledTimes(2);

    for (const [input] of fixture.updateMany.mock.calls) {
      expect(input.where).toEqual({ workspaceId: "workspace-a", requestId, status: "reserved" });
    }
  });
});

describe("AI usage ledger reads", () => {
  it("reads the account's KST daily counter across workspaces and resets the displayed day at midnight", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-11-16T23:59:59+09:00"));
      vi.stubEnv("AI_USAGE_LEDGER_ENABLED", "false");
      const fixture = ledgerFixture();
      const key = dailyAiRules("live", owner.sessionUserId, Date.now())[0].key;
      const hashed = createHmac("sha256", "fixture-usage-secret").update("moa-rate-limit-v1\0").update(key).digest("hex");
      fixture.rateLimitFind.mockResolvedValue([{ key: hashed, count: 100, lastRequest: BigInt(Date.now()) }]);
      calls.session.mockResolvedValue(owner);
      expect(await readUsage(new Headers())).toMatchObject({ used: 100, limit: 100, retryAfter: 1 });
      calls.session.mockResolvedValue({ ...owner, workspaceId: "other-workspace" });
      expect(await readUsage(new Headers())).toMatchObject({ used: 100, limit: 100, retryAfter: 1 });
      vi.setSystemTime(new Date("2026-11-17T00:00:00+09:00"));
      expect(await readUsage(new Headers())).toMatchObject({ used: 0, limit: 100, retryAfter: 0 });
    } finally { vi.useRealTimers(); }
  });
  it("marks only this workspace's reservations older than ten minutes as unknown before listing", async () => {
    const fixture = ledgerFixture();

    calls.session.mockResolvedValue({ ...owner, userId: owner.sessionUserId });

    const before = Date.now();

    await readUsage(new Headers());
    expect(fixture.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: owner.workspaceId, status: "reserved", createdAt: { lt: expect.any(Date) } },
      data: { status: "unknown", completedAt: expect.any(Date) },
    });

    const cutoff = fixture.updateMany.mock.calls[0][0].where.createdAt.lt.getTime();

    expect(cutoff).toBeGreaterThanOrEqual(before - 600000);
    expect(cutoff).toBeLessThanOrEqual(Date.now() - 600000);
  });
  it("reads only the current session workspace and serializes entries", async () => {
    const createdAt = new Date("2026-11-09T01:02:03.000Z");
    const fixture = ledgerFixture({
      entries: [{
        requestId,
        provider: "openai",
        operation: "chat",
        status: "completed",
        model: "gpt-fixture",
        createdAt,
        inputTokens: 2,
        outputTokens: 3,
        totalTokens: 5,
      }]
    });

    calls.session.mockResolvedValue(owner);

    await expect(readUsage(new Headers())).resolves.toMatchObject({
      ledger: "enabled",
      entries: [expect.objectContaining({ requestId, createdAt: createdAt.toISOString() })],
    });
    expect(fixture.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { workspaceId: "workspace-a" },
      orderBy: { createdAt: "desc" },
      take: 50,
    }));
    expect(fixture.execute).toHaveBeenCalledOnce();
  });

  it("does not read rate limits or ledger rows without an owner session", async () => {
    calls.session.mockResolvedValue(null);

    await expect(readUsage(new Headers())).resolves.toBeNull();
    expect(calls.database).not.toHaveBeenCalled();
  });

  it("does not expose ledger failure details to the caller", async () => {
    const fixture = ledgerFixture({ failRead: true });

    calls.session.mockResolvedValue(owner);

    await expect(readUsage(new Headers())).resolves.toMatchObject({ ledger: "unavailable", entries: [] });
    expect(fixture.rateLimitFind).toHaveBeenCalledOnce();
  });
});
