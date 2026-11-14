import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const calls = vi.hoisted(() => ({ options: vi.fn(), user: vi.fn(), connections: vi.fn() }));

vi.mock(
  "better-auth",
  () => ({
    betterAuth: (options: unknown) => {
      calls.options(options);

      return options;
    }
  })
);
vi.mock("better-auth/adapters/prisma", () => ({ prismaAdapter: () => ({}) }));
vi.mock("../../../src/server/database/client", () => ({ getDatabase: () => ({}) }));
vi.mock(
  "../../../src/server/auth/auth-mail",
  () => ({ authenticationMailConfig: vi.fn(), sendAuthenticationEmail: vi.fn() })
);
vi.mock("../../../src/server/auth/social-providers", () => ({ socialProviderConfiguration: () => ({}) }));
vi.mock("../../../src/server/auth/auth-rate-limit", () => ({ createAuthRateLimiter: () => ({}) }));
vi.mock(
  "../../../src/server/settings/settings-cache-policy",
  () => ({ expireSettingsDisplay: calls.user, expireConnectedSettingsDisplay: calls.connections })
);

type HookOptions = {
  databaseHooks: {
    session: {
      create: { after: (value: { userId: string }) => Promise<void> };
      delete: { after: (value: { userId: string }) => Promise<void> }
    };
    account: Record<"create" | "update" | "delete", { after: (value: { userId: string }) => Promise<void> }>;
    user: { update: { after: () => Promise<void> } };
  };
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("authentication mutations expire settings display data", () => {
  it("refreshes a new login, logout, social binding and profile through SDK hooks", async () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://moa.example.invalid");
    vi.stubEnv("BETTER_AUTH_SECRET", "fixture-auth-secret-with-at-least-32-characters");

    try {
      const { getAuth } = await import("../../../src/server/auth/auth");

      getAuth();

      const { databaseHooks: hooks } = calls.options.mock.calls[0][0] as HookOptions;

      await hooks.session.create.after({ userId: "user-a" });
      await hooks.session.delete.after({ userId: "user-a" });

      for (const operation of ["create", "update", "delete"] as const) {
        await hooks.account[operation].after({ userId: "user-a" });
      }

      await hooks.user.update.after();
      expect(calls.user).toHaveBeenCalledTimes(5);
      expect(calls.user.mock.calls.every(([id]) => id === "user-a")).toBe(true);
      expect(calls.connections).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
