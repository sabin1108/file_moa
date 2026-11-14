import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const execute = vi.hoisted(() => vi.fn());
const query = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());

vi.mock(
  "../../../src/server/database/client",
  () => ({ getDatabase: () => ({ $transaction: transaction }) })
);

import { revalidateChatStream } from "../../../src/server/chat/chat-session";

const snapshot = () => ({
  userId: "owner-A",
  workspaceId: "workspace-A",
  sessionUserId: "login-A",
  sessionId: "session-A",
  sessionToken: "fixture-token",
  expiresAt: Date.now() + 60_000,
});

beforeEach(() => {
  execute.mockReset().mockResolvedValue(1);
  query.mockReset().mockResolvedValue([{ name: "이름" }]);
  transaction.mockReset().mockImplementation(async callback => callback({ $executeRaw: execute, $queryRaw: query }));
});

describe("fresh stream authorization without repeated workspace preparation", () => {
  it("sets caller context and makes one parameterized authorization read per check", async () => {
    expect(await revalidateChatStream(snapshot())).toBe(true);
    expect(transaction).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0].slice(1)).toEqual(["login-A"]);
    expect(execute.mock.invocationCallOrder[0]).toBeLessThan(query.mock.invocationCallOrder[0]);

    const parameters = query.mock.calls[0].slice(1);

    expect(parameters).toEqual(expect.arrayContaining(["session-A", "fixture-token", "login-A", "workspace-A", "owner-A"]));

    const sql = query.mock.calls[0][0].join("?");

    expect(sql).not.toMatch(/INSERT|UPDATE|DELETE/u);
    expect(sql).not.toContain("fixture-token");
    await revalidateChatStream(snapshot());
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("fails closed for an expired session, no authorized row, blank profile or a DB failure", async () => {
    expect(await revalidateChatStream({ ...snapshot(), expiresAt: Date.now() - 1 })).toBe(false);
    expect(query).not.toHaveBeenCalled();
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ name: " \t\n" }]);
    expect(await revalidateChatStream(snapshot())).toBe(false);
    expect(await revalidateChatStream(snapshot())).toBe(false);
    query.mockRejectedValueOnce(new Error("fixture-db-failure"));
    await expect(revalidateChatStream(snapshot())).rejects.toThrow("fixture-db-failure");
  });
});
