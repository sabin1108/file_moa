import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const calls = vi.hoisted(() => ({ headers: vi.fn(), auth: vi.fn(), session: vi.fn(), redirect: vi.fn() }));

vi.mock("next/headers", () => ({ headers: calls.headers }));
vi.mock("next/navigation", () => ({ redirect: calls.redirect }));
vi.mock("../../src/server/auth", () => ({ getAuth: calls.auth }));
vi.mock("../../src/app/actions/auth", () => ({ signoutAction: vi.fn() }));
vi.mock("../../src/components/layout/AuthShell", () => ({ AuthShell: vi.fn() }));
vi.mock("../../src/features/auth/components/AuthScreen", () => ({ AuthScreen: vi.fn() }));

import AccountPage from "../../src/app/account/page";

beforeEach(() => {
  vi.resetAllMocks();
  calls.auth.mockReturnValue({ api: { getSession: calls.session } });
  calls.redirect.mockImplementation(() => {
    throw new Error("fixture-redirect");
  });
});

describe("account request boundary", () => {
  it("does not initialize authentication when request headers suspend prerendering", async () => {
    calls.headers.mockRejectedValue(new Error("fixture-request-required"));

    await expect(AccountPage()).rejects.toThrow("fixture-request-required");
    expect(calls.auth).not.toHaveBeenCalled();
    expect(calls.session).not.toHaveBeenCalled();
  });

  it("keeps runtime authentication configuration failures visible", async () => {
    calls.headers.mockResolvedValue(new Headers());
    calls.auth.mockImplementation(() => {
      throw new Error("fixture-configuration-error");
    });

    await expect(AccountPage()).rejects.toThrow("로그인 상태를 확인하지 못했습니다.");
    expect(calls.auth).toHaveBeenCalledOnce();
  });

  it("redirects a request without a session and disables cached or refreshed session writes", async () => {
    const requestHeaders = new Headers();

    calls.headers.mockResolvedValue(requestHeaders);
    calls.session.mockResolvedValue(null);

    await expect(AccountPage()).rejects.toThrow("fixture-redirect");
    expect(calls.session).toHaveBeenCalledWith({ headers: requestHeaders, query: { disableCookieCache: true, disableRefresh: true } });
    expect(calls.redirect).toHaveBeenCalledWith("/login");
  });
});
