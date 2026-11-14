import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("better-auth", () => ({ betterAuth: vi.fn() }));
vi.mock("better-auth/adapters/prisma", () => ({ prismaAdapter: vi.fn() }));
vi.mock("../../../src/server/database/client", () => ({ getDatabase: vi.fn() }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("server authentication configuration", () => {
  it.each([
    undefined,
    "invalid-secret-in-url",
    "http://app.example.invalid",
    "https://name:fixture-secret@app.example.invalid",
    "https://app.example.invalid?token=fixture-secret",
    "https://app.example.invalid/path",
  ])("rejects an invalid trusted origin without echoing values (%#)", async origin => {
    vi.stubEnv("BETTER_AUTH_URL", origin);
    vi.stubEnv("BETTER_AUTH_SECRET", "fixture-secret-that-is-long-enough-for-tests");

    const { getAuth } = await import("../../../src/server/auth/auth");
    const { betterAuth } = await import("better-auth");
    const { getDatabase } = await import("../../../src/server/database/client");

    expect(() => getAuth()).toThrow("BETTER_AUTH_URL must be a trusted application origin.");
    expect(betterAuth).not.toHaveBeenCalled();
    expect(getDatabase).not.toHaveBeenCalled();
  });

  it("rejects a missing or short secret before accessing the database", async () => {
    vi.stubEnv("BETTER_AUTH_URL", "http://127.0.0.1:3034");
    vi.stubEnv("BETTER_AUTH_SECRET", "fixture-secret");

    const { getAuth } = await import("../../../src/server/auth/auth");
    const { betterAuth } = await import("better-auth");
    const { getDatabase } = await import("../../../src/server/database/client");

    expect(() => getAuth()).toThrow("BETTER_AUTH_SECRET must contain at least 32 characters.");
    expect(betterAuth).not.toHaveBeenCalled();
    expect(getDatabase).not.toHaveBeenCalled();
  });
});
