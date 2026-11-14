import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const protocol = vi.hoisted(() => vi.fn());

vi.mock("../../../src/server/auth/auth-handler", () => ({ handleAuthRequest: protocol }));
vi.mock(
  "../../../src/server/auth/auth",
  () => ({ getAuth: () => ({ options: { baseURL: "http://127.0.0.1:3034" } }) })
);

import { submitAuthForm } from "../../../src/server/auth/auth-forms";

function fields(values: Record<string, string>) {
  const data = new FormData();

  Object.entries(values).forEach(([name, value]) => {
    data.set(name, value);
  });

  return data;
}

beforeEach(() => {
  protocol.mockReset();
});

describe("authentication form trust boundary", () => {
  it.each([7, 31])("rejects a new password with %i characters before the protocol", async length => {
    const password = "a".repeat(length);
    const result = await submitAuthForm("signup", fields({ email: "fixture@example.invalid", password, passwordConfirm: password }), new Headers());

    expect(result.state.fieldErrors?.password).toBeDefined();
    expect(protocol).not.toHaveBeenCalled();
  });

  it.each([8, 30])("accepts a new password with %i characters", async length => {
    protocol.mockResolvedValue(Response.json({ status: true }));
    const password = "a".repeat(length);
    const result = await submitAuthForm("signup", fields({ email: "fixture@example.invalid", password, passwordConfirm: password }), new Headers());

    expect(result.state.status).toBe("success");
    expect(protocol).toHaveBeenCalledOnce();
  });

  it("rejects a mismatched password before contacting the auth protocol", async () => {
    const result = await submitAuthForm(
      "signup",
      fields({
        name: "이름",
        email: "fixture@example.invalid",
        password: "long-fixture-password",
        passwordConfirm: "different"
      }),
      new Headers()
    );

    expect(result.state.status).toBe("error");
    expect(result.state.fieldErrors?.passwordConfirm).toBeDefined();
    expect(protocol).not.toHaveBeenCalled();
  });

  it("normalizes input and keeps the request's origin/IP for the same-process protocol", async () => {
    protocol.mockResolvedValue(Response.json({ user: { id: "fixture" } }));

    const input = fields({
      name: " 이름 ",
      email: " FIXTURE@EXAMPLE.INVALID ",
      password: "fixture-password-123",
      passwordConfirm: "fixture-password-123"
    });
    const headers = new Headers({ origin: "http://127.0.0.1:3034", "x-vercel-forwarded-for": "192.0.2.1" });
    const result = await submitAuthForm("signup", input, headers);
    const request = protocol.mock.calls[0][0] as Request;

    expect(result.state.status).toBe("success");
    expect(request.headers.get("origin")).toBe(headers.get("origin"));
    expect(request.headers.get("x-vercel-forwarded-for")).toBe("192.0.2.1");
    expect(await request.json()).toMatchObject({ name: "", email: "fixture@example.invalid", callbackURL: "http://127.0.0.1:3034/login" });
    expect(JSON.stringify(result.state)).not.toContain("fixture-password");
  });

  it("creates an email signup without collecting a name and only accepts a valid name after login", async () => {
    protocol.mockResolvedValue(Response.json({ status: true }));
    expect((await submitAuthForm(
      "signup",
      fields({
        email: "fixture@example.invalid",
        password: "fixture-password-123",
        passwordConfirm: "fixture-password-123"
      }),
      new Headers()
    )).state.status).toBe("success");
    expect(await protocol.mock.calls[0][0].json()).toMatchObject({ name: "" });
    protocol.mockClear();
    expect((await submitAuthForm("profile", fields({ name: "  " }), new Headers())).state.fieldErrors?.name).toBeDefined();
    expect(protocol).not.toHaveBeenCalled();
    expect((await submitAuthForm("profile", fields({ name: " 이름 ", userId: "other-user" }), new Headers())).state.status).toBe("success");
    expect(await protocol.mock.calls[0][0].json()).toEqual({ name: "이름" });
    expect(protocol.mock.calls[0][0].url).toContain("/update-user");
  });

  it("maps an unverified login to a Korean message without returning the response body", async () => {
    protocol.mockResolvedValue(Response.json({ code: "EMAIL_NOT_VERIFIED", token: "private-token" }, { status: 403 }));

    const result = await submitAuthForm(
      "login",
      fields({ email: "fixture@example.invalid", password: "fixture-password" }),
      new Headers()
    );

    expect(result.state).toMatchObject({ status: "error", message: expect.stringContaining("이메일 확인") });
    expect(JSON.stringify(result.state)).not.toContain("private-token");
  });

  it("never uses a client-provided reset destination", async () => {
    protocol.mockResolvedValue(Response.json({ status: true }));
    await submitAuthForm(
      "request-reset",
      fields({ email: "fixture@example.invalid", redirectTo: "https://attacker.example.invalid" }),
      new Headers()
    );

    const request = protocol.mock.calls[0][0] as Request;

    expect(await request.json()).toEqual({ email: "fixture@example.invalid", redirectTo: "http://127.0.0.1:3034/reset-password" });
  });

  it("does not echo internal errors or submitted secrets", async () => {
    protocol.mockRejectedValue(new Error("fixture-db-secret"));

    const result = await submitAuthForm(
      "reset",
      fields({ token: "fixture-token", password: "fixture-password", passwordConfirm: "fixture-password" }),
      new Headers()
    );

    expect(result.state.status).toBe("error");
    expect(JSON.stringify(result.state)).not.toMatch(/fixture-(db-secret|token|password)/);
  });

  it.each(["resend", "request-reset"] as const)("explains a failed mail request without echoing provider details (%s)", async operation => {
    protocol.mockResolvedValue(Response.json({ code: "AUTHENTICATION_UNAVAILABLE", detail: "private-provider-detail" }, { status: 503 }));
    const result = await submitAuthForm(operation, fields({ email: "fixture@example.invalid" }), new Headers());

    expect(result.state.message).toContain("메일을 보내지 못했습니다");
    expect(result.state.message).toContain("발신 설정");
    expect(JSON.stringify(result.state)).not.toContain("private-provider-detail");
  });
});
