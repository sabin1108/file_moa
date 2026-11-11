import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const calls = vi.hoisted(() => ({
  user: vi.fn(),
  methods: vi.fn(),
  membership: vi.fn(),
  transaction: vi.fn(),
  expired: vi.fn(),
  session: vi.fn(),
  consume: vi.fn()
}));

vi.mock(
  "../../src/server/auth-rate-limit",
  () => ({ createAuthRateLimiter: () => ({ consume: calls.consume }) })
);
vi.mock("../../src/server/database/client", () => ({
  getDatabase: () => ({
    user: { findUniqueOrThrow: calls.user },
    account: { findMany: calls.methods },
    loginConnectionMember: { findUnique: calls.membership },
    $transaction: calls.transaction,
  })
}));
vi.mock(
  "../../src/server/authenticated-session",
  () => ({ getAuthenticatedSession: calls.session })
);
vi.mock(
  "../../src/server/auth",
  () => ({ getAuth: () => ({ options: { baseURL: "https://moa.example.invalid" } }) })
);
vi.mock(
  "../../src/server/social-providers",
  () => ({ socialProviderConfiguration: () => ({ google: {} }) })
);
vi.mock(
  "../../src/server/settings-cache-policy",
  () => ({ expireSettingsDisplay: calls.expired, expireConnectedSettingsDisplay: vi.fn() })
);

import { manageSocialAccount, readAccountLoginSettingsForUser } from "../../src/server/auth-account";
import { readWorkspaceConnectionForUser } from "../../src/server/auth-account-connection";

beforeEach(() => {
  vi.resetAllMocks();
  calls.consume.mockResolvedValue({ allowed: true });
});

describe("token-free settings display data", () => {
  it("reads the profile by cache identity and returns booleans instead of credentials", async () => {
    calls.user.mockResolvedValue({ id: "user-a", name: "사용자", email: "fixture@example.invalid" });
    calls.methods.mockResolvedValue([{ providerId: "credential" }, { providerId: "google" }]);

    const value = await readAccountLoginSettingsForUser("user-a");

    expect(value).toMatchObject({ name: "사용자", hasPassword: true, providers: [{ id: "google", connected: true, available: true }] });
    expect(calls.user).toHaveBeenCalledWith({ where: { id: "user-a" }, select: { id: true, name: true, email: true } });
    expect(calls.methods.mock.calls[0][0].select).toEqual({ providerId: true });
    expect(JSON.stringify(value)).not.toMatch(/token|session|cookie|passwordHash/);
  });

  it("reads connection membership using the authorized identity", async () => {
    calls.membership.mockResolvedValue({
      connection: {
        primaryOwnerUserId: "user-b",
        members: [{ userId: "user-a", user: { name: "사용자", email: "fixture@example.invalid" } }],
      }
    });
    expect(await readWorkspaceConnectionForUser("user-a")).toEqual({
      primaryOwnerUserId: "user-b",
      members: [{ ownerUserId: "user-a", name: "사용자", email: "fixture@example.invalid" }],
    });
    expect(calls.membership.mock.calls[0][0].where).toEqual({ userId: "user-a" });
    expect(calls.membership.mock.calls[0][0].select.connection.select.members.select.user.select).toEqual({ name: true, email: true });
  });

  it("expires login-method display data only after a successful unlink", async () => {
    calls.session.mockResolvedValue({ user: { id: "user-a" }, session: { createdAt: new Date() } });

    const count = vi.fn().mockResolvedValue(1);

    calls.transaction.mockImplementation(async operation => operation({ $executeRaw: vi.fn(), account: { count, deleteMany: vi.fn() } }));

    const form = new FormData();

    form.set("provider", "google");
    form.set("operation", "unlink");

    const requestHeaders = new Headers({ origin: "https://moa.example.invalid" });

    expect((await manageSocialAccount(form, requestHeaders)).state.status).toBe("success");
    expect(calls.expired).toHaveBeenCalledWith("user-a");
    calls.expired.mockClear();
    count.mockResolvedValue(0);
    expect((await manageSocialAccount(form, requestHeaders)).state.status).toBe("error");
    expect(calls.expired).not.toHaveBeenCalled();
  });
});
