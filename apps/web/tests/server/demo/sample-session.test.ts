import { afterEach, describe, expect, it, vi } from "vitest";
import { createSampleSession, readSampleSession, readSampleAccess } from "../../../src/server/demo/sample-session";

vi.mock("server-only", () => ({}));
afterEach(() => vi.unstubAllEnvs());

const now = 1_800_000_000_000;

describe("sample-only signed sessions", () => {
  it("SAMPLE-001 creates independent, expiring identities without a production user", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "sample-fixture-secret-with-at-least-32-characters");

    const first = createSampleSession(now);
    const second = createSampleSession(now);

    expect(first.session.id).not.toBe(second.session.id);
    expect(readSampleSession(first.token, now)).toEqual(first.session);
    expect(readSampleSession(first.token, now - 30_000)).toEqual(first.session);
    expect(readSampleAccess(first.token, now + 10_000)?.remainingMs).toBe(3_590_000);
    expect(first.session.expiresAt).toBe(now + 3_600_000);
    expect(first.session).not.toHaveProperty("userId");
    expect(first.session).not.toHaveProperty("workspaceId");
  });

  it("SAMPLE-001 rejects tampering, expiry and changed signing keys", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "sample-fixture-secret-with-at-least-32-characters");

    const { token, session } = createSampleSession(now);

    expect(readSampleSession(token + "x", now)).toBeNull();
    expect(readSampleSession(token, session.expiresAt)).toBeNull();
    expect(readSampleSession("not-a-session", now)).toBeNull();
    expect(readSampleSession("x".repeat(2000), now)).toBeNull();
    vi.stubEnv("BETTER_AUTH_SECRET", "different-fixture-secret-with-at-least-32-characters");
    expect(readSampleSession(token, now)).toBeNull();
  });

  it("SAMPLE-001 fails closed without a configured signing secret", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "short");
    expect(() => createSampleSession(now)).toThrow("sample-session-unavailable");
    expect(readSampleSession("arbitrary", now)).toBeNull();
  });
});
