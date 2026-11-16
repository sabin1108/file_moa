import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const calls = vi.hoisted(() => ({ auth: vi.fn(), session: vi.fn(), social: vi.fn() }));

vi.mock(
  "../../../src/server/auth/auth",
  () => ({ getAuth: calls.auth })
);
vi.mock(
  "../../../src/server/database/client",
  () => ({ getDatabase: () => ({ account: { findFirst: calls.social } }) })
);

import { getAuthenticatedSession } from "../../../src/server/auth/authenticated-session";

const session = { user: { id: "user-a", emailVerified: false } };

beforeEach(() => {
  vi.resetAllMocks();
  calls.auth.mockReturnValue({ api: { getSession: calls.session } });
});
describe("server-authenticated identity", () => {
  it.each([undefined, "moa.sample-session=demo-only"])("does not initialize authentication for a request without a session credential (%s)", async cookie => {
    calls.auth.mockImplementation(() => { throw new Error("fixture-auth-unavailable"); });
    expect(await getAuthenticatedSession(new Headers(cookie ? { cookie } : undefined))).toBeNull();
    expect(calls.auth).not.toHaveBeenCalled();
    expect(calls.session).not.toHaveBeenCalled();
    expect(calls.social).not.toHaveBeenCalled();
  });
  it.each(["better-auth.session_token", "__Secure-better-auth.session_token", "better-auth-session_token", "__Secure-better-auth-session_token"])("still validates %s with the SDK and propagates an outage", async name => {
    calls.session.mockRejectedValue(new Error("fixture-sdk-unavailable"));
    await expect(getAuthenticatedSession(new Headers({ cookie: `${name}=untrusted-token` }))).rejects.toThrow("fixture-sdk-unavailable");
    expect(calls.session).toHaveBeenCalledOnce();
    expect(calls.social).not.toHaveBeenCalled();
  });
  it("requires a valid SDK session before considering a provider binding", async () => {
    calls.session.mockResolvedValue(null);
    expect(await getAuthenticatedSession(new Headers({ cookie: "better-auth.session_token=fixture" }))).toBeNull();
    expect(calls.social).not.toHaveBeenCalled();
  });
  it("accepts verified email without another account lookup", async () => {
    calls.session.mockResolvedValue({ user: { id: "user-a", emailVerified: true } });
    expect(await getAuthenticatedSession(new Headers({ cookie: "better-auth.session_token=fixture" }))).not.toBeNull();
    expect(calls.social).not.toHaveBeenCalled();
  });
  it("accepts unverified contact only with an allowed social binding belonging to the session user", async () => {
    calls.session.mockResolvedValue(session);
    calls.social.mockResolvedValue({ id: "account-a" });

    const headers = new Headers({ cookie: "better-auth.session_token=fixture" });

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
    expect(await getAuthenticatedSession(new Headers({ cookie: "better-auth.session_token=fixture" }))).toBeNull();
  });
  it("does not treat a failed ownership lookup as authorization", async () => {
    calls.session.mockResolvedValue(session);
    calls.social.mockRejectedValue(new Error("fixture-db-failed"));
    await expect(getAuthenticatedSession(new Headers({ cookie: "better-auth.session_token=fixture" }))).rejects.toThrow("fixture-db-failed");
  });
});
