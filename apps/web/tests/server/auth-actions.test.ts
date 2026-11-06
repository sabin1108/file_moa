import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const calls = vi.hoisted(() => ({ submit: vi.fn(), set: vi.fn(), redirect: vi.fn(), session: vi.fn(), account: vi.fn(), guest: vi.fn(), headers: new Headers({ origin: "https://app.example.invalid" }) }));
vi.mock("../../src/server/auth-forms", () => ({ submitAuthForm: calls.submit }));
vi.mock("next/headers", () => ({ headers: async () => calls.headers, cookies: async () => ({ set: calls.set }) }));
vi.mock("next/navigation", () => ({ redirect: calls.redirect }));
vi.mock("../../src/server/session-guards", () => ({ requireGuest: calls.guest, requireAccountSession: calls.account }));
vi.mock("../../src/server/auth", () => ({ getAuth: () => ({ api: { getSession: calls.session } }) }));

import { loginAction, profileAction, signoutAction, checkAuthSessionAction } from "../../src/app/actions/auth";

beforeEach(() => {
  calls.submit.mockReset(); calls.set.mockReset(); calls.redirect.mockReset(); calls.session.mockReset();
  calls.account.mockReset(); calls.guest.mockReset();
  calls.redirect.mockImplementation(() => { throw new Error("fixture-next-redirect"); });
});

describe("authentication Server Action cookies", () => {
  it("saves a profile only behind the authenticated account guard and preserves redirect cookies", async () => {
    calls.submit.mockResolvedValue({ state: { status: "success" }, response: Response.json({}, { headers: { "set-cookie": "session=fixture; Path=/; HttpOnly; SameSite=Lax" } }) });
    await expect(profileAction({ status: "idle" }, new FormData())).rejects.toThrow("fixture-next-redirect");
    expect(calls.account).toHaveBeenCalledOnce();
    expect(calls.guest).not.toHaveBeenCalled();
    expect(calls.submit.mock.calls[0][0]).toBe("profile");
    expect(calls.set).toHaveBeenCalledWith("session", "fixture", expect.objectContaining({ httpOnly: true }));
    expect(calls.redirect).toHaveBeenCalledWith("/");
  });
  it("returns only identity and expiry for scope checks without issuing a token", async () => {
    calls.session.mockResolvedValue({ user: { id: "user-a", emailVerified: true, email: "private@example.invalid" }, session: { userId: "user-a", expiresAt: new Date("2027-01-01"), token: "private-token", ipAddress: "192.0.2.1" } });
    const result = await checkAuthSessionAction();
    expect(result).toEqual({ available: true, session: { user: { id: "user-a", emailVerified: true }, session: { userId: "user-a", expiresAt: new Date("2027-01-01").toISOString() } } });
    expect(JSON.stringify(result)).not.toMatch(/private|token|ipAddress/);
    expect(calls.session).toHaveBeenCalledWith({ headers: calls.headers, query: { disableCookieCache: true, disableRefresh: true } });
  });

  it("reports an unavailable scope check without echoing its internal error", async () => {
    calls.session.mockRejectedValue(new Error("private-db-secret"));
    expect(await checkAuthSessionAction()).toEqual({ available: false, session: null });
  });
  it("applies HttpOnly/Secure cookie options then preserves Next redirect control flow", async () => {
    calls.submit.mockResolvedValue({ state: { status: "success" }, response: Response.json({}, { headers: { "set-cookie": "session=fixture; Path=/; Secure; HttpOnly; SameSite=Lax" } }) });

    await expect(loginAction({ status: "success" }, new FormData())).rejects.toThrow("fixture-next-redirect");
    expect(calls.submit.mock.calls[0][2].get("origin")).toBe("https://app.example.invalid");
    expect(calls.set).toHaveBeenCalledWith("session", "fixture", expect.objectContaining({ secure: true, httpOnly: true, sameSite: "lax", path: "/" }));
    expect(calls.redirect).toHaveBeenCalledWith("/");
  });

  it("does not redirect on invalid credentials regardless of a forged previous state", async () => {
    calls.submit.mockResolvedValue({ state: { status: "error", message: "로그인 실패" } });

    expect(await loginAction({ status: "success" }, new FormData())).toMatchObject({ status: "error" });
    expect(calls.redirect).not.toHaveBeenCalled();
    expect(calls.set).not.toHaveBeenCalled();
  });

  it("forwards an expired logout cookie", async () => {
    calls.submit.mockResolvedValue({ state: { status: "success" }, response: Response.json({}, { headers: { "set-cookie": "session=; Path=/; Max-Age=0; HttpOnly" } }) });

    await expect(signoutAction()).rejects.toThrow("fixture-next-redirect");
    expect(calls.set).toHaveBeenCalledWith("session", "", expect.objectContaining({ maxAge: 0 }));
    expect(calls.redirect).toHaveBeenCalledWith("/login");
  });
});
