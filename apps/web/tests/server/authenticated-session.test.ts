import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const calls = vi.hoisted(() => ({ session: vi.fn(), social: vi.fn() }));

vi.mock(
  "../../src/server/auth",
  () => ({ getAuth: () => ({ api: { getSession: calls.session } }) })
);
vi.mock(
  "../../src/server/database/client",
  () => ({ getDatabase: () => ({ account: { findFirst: calls.social } }) })
);

import { getAuthenticatedSession } from "../../src/server/authenticated-session";

const session = { user: { id: "user-a", emailVerified: false } };

beforeEach(() => {
  vi.resetAllMocks();
});
describe("server-authenticated identity", () => {
  it("requires a valid SDK session before considering a provider binding", async () => {
    calls.session.mockResolvedValue(null);
    expect(await getAuthenticatedSession(new Headers())).toBeNull();
    expect(calls.social).not.toHaveBeenCalled();
  });
  it("accepts verified email without another account lookup", async () => {
    calls.session.mockResolvedValue({ user: { id: "user-a", emailVerified: true } });
    expect(await getAuthenticatedSession(new Headers())).not.toBeNull();
    expect(calls.social).not.toHaveBeenCalled();
  });
  it("accepts unverified contact only with an allowed social binding belonging to the session user", async () => {
    calls.session.mockResolvedValue(session);
    calls.social.mockResolvedValue({ id: "account-a" });

    const headers = new Headers();

    expect(await getAuthenticatedSession(headers)).toBe(session);
    expect(calls.session).toHaveBeenCalledWith({ headers, query: { disableCookieCache: true, disableRefresh: true } });
    expect(calls.social).toHaveBeenCalledWith({
      where: { userId: "user-a", providerId: { in: ["google", "naver", "kakao"] } },
      select: { id: true }
    });
  });
  it("rejects an unverified session without a social binding", async () => {
    calls.session.mockResolvedValue(session);
    calls.social.mockResolvedValue(null);
    expect(await getAuthenticatedSession(new Headers())).toBeNull();
  });
  it("does not treat a failed ownership lookup as authorization", async () => {
    calls.session.mockResolvedValue(session);
    calls.social.mockRejectedValue(new Error("fixture-db-failed"));
    await expect(getAuthenticatedSession(new Headers())).rejects.toThrow("fixture-db-failed");
  });
});
