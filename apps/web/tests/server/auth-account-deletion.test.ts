import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const calls = vi.hoisted(() => ({ session: vi.fn(), database: vi.fn(), consume: vi.fn(), sendMail: vi.fn() }));

vi.mock(
  "../../src/server/authenticated-session",
  () => ({ getAuthenticatedSession: calls.session })
);
vi.mock("../../src/server/database/client", () => ({ getDatabase: calls.database }));
vi.mock(
  "../../src/server/auth-rate-limit",
  () => ({ createAuthRateLimiter: () => ({ consume: calls.consume }) })
);
vi.mock(
  "../../src/server/auth",
  () => ({ getAuth: () => ({ options: { baseURL: "https://moa.example.invalid" } }) })
);
vi.mock("../../src/server/auth-mail", () => ({ sendAuthenticationEmail: calls.sendMail }));

import { finishAccountDeletion, requestAccountDeletion } from "../../src/server/auth-account-deletion";

const owner = () => ({
  user: { id: "user-a", email: "user@example.invalid" },
  session: { id: "session-a", createdAt: new Date() }
});
const originHeaders = () => new Headers({ origin: "https://moa.example.invalid" });
const requestForm = () => {
  const form = new FormData();

  form.set("confirm", "on");

  return form;
};
const finishForm = (token = "a".repeat(43)) => {
  const form = requestForm();

  form.set("token", token);

  return form;
};

function databaseFixture(options?: {
  membership?: unknown;
  primary?: unknown;
  verification?: unknown;
  currentSession?: unknown
}) {
  const execute = vi.fn();
  const create = vi.fn().mockResolvedValue({});
  const removeVerification = vi.fn().mockResolvedValue({});
  const removeUser = vi.fn().mockResolvedValue({});
  const transaction = vi.fn(async (operation: (tx: unknown) => Promise<unknown>) => operation({
    $executeRaw: execute,
    verification: {
      create,
      findFirst: vi.fn().mockResolvedValue(options?.verification ?? null),
      delete: removeVerification
    },
    session: { findFirst: vi.fn().mockResolvedValue(options?.currentSession ?? { id: "session-a" }) },
    loginConnectionMember: { findUnique: vi.fn().mockResolvedValue(options?.membership ?? null) },
    loginConnection: { findFirst: vi.fn().mockResolvedValue(options?.primary ?? null) },
    user: { delete: removeUser },
  }));
  const database = {
    $transaction: transaction,
    loginConnectionMember: { findUnique: vi.fn().mockResolvedValue(options?.membership ?? null) },
    loginConnection: { findFirst: vi.fn().mockResolvedValue(options?.primary ?? null) },
  };

  calls.database.mockReturnValue(database);

  return { database, execute, create, removeVerification, removeUser, transaction };
}

beforeEach(() => {
  vi.resetAllMocks();
  calls.consume.mockResolvedValue({ allowed: true });
  calls.session.mockResolvedValue(owner());
  calls.sendMail.mockResolvedValue({ id: "mail-a" });
  vi.stubEnv("BETTER_AUTH_SECRET", "fixture-auth-secret");
});

describe("account deletion request boundary", () => {
  it("rejects an absent confirmation and another origin before authentication", async () => {
    expect((await requestAccountDeletion(new FormData(), originHeaders())).status).toBe("error");
    expect(calls.session).not.toHaveBeenCalled();
    expect((await requestAccountDeletion(requestForm(), new Headers({ origin: "https://attacker.example.invalid" }))).status).toBe("error");
    expect(calls.session).not.toHaveBeenCalled();
  });

  it.each([new Date(0), new Date(Date.now() + 60_000), new Date(Number.NaN)])("fails closed for a non-fresh session timestamp", async createdAt => {
    calls.session.mockResolvedValue({ ...owner(), session: { id: "session-a", createdAt } });
    expect((await requestAccountDeletion(requestForm(), originHeaders())).status).toBe("error");
    expect(calls.database).not.toHaveBeenCalled();
  });

  it.each([
    { membership: { userId: "user-a" }, primary: null },
    { membership: null, primary: { id: "connection-a" } },
  ])("blocks every linked identity before creating a deletion token", async connection => {
    const fixture = databaseFixture(connection);

    expect((await requestAccountDeletion(requestForm(), originHeaders())).status).toBe("error");
    expect(fixture.create).not.toHaveBeenCalled();
    expect(calls.sendMail).not.toHaveBeenCalled();
  });

  it("stores only a hashed token identifier and sends a confirmation link", async () => {
    const fixture = databaseFixture();

    await expect(requestAccountDeletion(requestForm(), originHeaders())).resolves.toMatchObject({ status: "success" });
    expect(fixture.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        identifier: expect.stringMatching(/^moa-delete:[a-f0-9]{64}$/),
        value: JSON.stringify({ userId: "user-a", sessionId: "session-a" }),
      })
    });
    expect(calls.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: "user@example.invalid",
      text: expect.stringContaining("https://moa.example.invalid/delete-account?token="),
    }));
  });
});

describe("account deletion completion boundary", () => {
  it("holds the same advisory lock as account connection before consuming the token and deleting the user", async () => {
    const token = "a".repeat(43);
    const fixture = databaseFixture({
      verification: { id: "verification-a", value: JSON.stringify({ userId: "user-a", sessionId: "session-a" }) }
    });

    await expect(finishAccountDeletion(finishForm(token), originHeaders())).resolves.toMatchObject({ status: "success" });
    expect(fixture.execute).toHaveBeenCalledTimes(2);
    expect(fixture.removeVerification).toHaveBeenCalledWith({ where: { id: "verification-a" } });
    expect(fixture.removeUser).toHaveBeenCalledWith({ where: { id: "user-a" } });
  });

  it("preserves the token and user when the current session, token payload, or connection is invalid", async () => {
    const fixtures = [
      databaseFixture({ currentSession: null }),
      databaseFixture({
        verification: { id: "verification-a", value: JSON.stringify({ userId: "user-a", sessionId: "other-session" }) }
      }),
      databaseFixture({
        verification: { id: "verification-a", value: JSON.stringify({ userId: "user-a", sessionId: "session-a" }) },
        primary: { id: "connection-a" }
      }),
    ];

    for (const fixture of fixtures) {
      calls.database.mockReturnValueOnce(fixture.database);
      expect((await finishAccountDeletion(finishForm(), originHeaders())).status).toBe("error");
      expect(fixture.removeVerification).not.toHaveBeenCalled();
      expect(fixture.removeUser).not.toHaveBeenCalled();
    }
  });
});
