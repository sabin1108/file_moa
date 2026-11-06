import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const calls = vi.hoisted(() => ({ submit: vi.fn(), set: vi.fn(), redirect: vi.fn(), headers: new Headers({ origin: "https://app.example.invalid" }) }));
vi.mock("../../src/server/auth-forms", () => ({ submitAuthForm: calls.submit }));
vi.mock("next/headers", () => ({ headers: async () => calls.headers, cookies: async () => ({ set: calls.set }) }));
vi.mock("next/navigation", () => ({ redirect: calls.redirect }));

import { loginAction, signoutAction } from "../../src/app/actions/auth";

beforeEach(() => {
  calls.submit.mockReset(); calls.set.mockReset(); calls.redirect.mockReset();
  calls.redirect.mockImplementation(() => { throw new Error("fixture-next-redirect"); });
});

describe("authentication Server Action cookies", () => {
  it("applies HttpOnly/Secure cookie options then preserves Next redirect control flow", async () => {
    calls.submit.mockResolvedValue({ state: { status: "success" }, response: Response.json({}, { headers: { "set-cookie": "session=fixture; Path=/; Secure; HttpOnly; SameSite=Lax" } }) });

    await expect(loginAction({ status: "success" }, new FormData())).rejects.toThrow("fixture-next-redirect");
    expect(calls.submit.mock.calls[0][2].get("origin")).toBe("https://app.example.invalid");
    expect(calls.set).toHaveBeenCalledWith("session", "fixture", expect.objectContaining({ secure: true, httpOnly: true, sameSite: "lax", path: "/" }));
    expect(calls.redirect).toHaveBeenCalledWith("/account");
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
