import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const handler = vi.hoisted(() => vi.fn());
const session = vi.hoisted(() => vi.fn());

vi.mock("../../../src/server/auth/authenticated-session", () => ({ getAuthenticatedSession: session }));
vi.mock(
  "../../../src/server/auth/auth",
  () => ({ getAuth: () => ({ handler, options: { baseURL: "https://app.example.invalid" } }) })
);

import { GET, POST } from "../../../src/app/api/auth/[...all]/route";

beforeEach(() => {
  handler.mockReset();
  session.mockReset();
  session.mockResolvedValue(null);
});

describe("public authentication protocol boundary", () => {
  it("allows only a valid name for the authenticated current user, with a trusted origin", async () => {
    const request = (body: unknown, origin = "https://app.example.invalid") => POST(new Request(
      "https://app.example.invalid/api/auth/update-user",
      {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(body)
      }
    ));

    expect((await request({ name: "이름" })).status).toBe(401);
    session.mockResolvedValue({ user: { id: "user-a" } });
    expect((await request({ name: "이름" }, "https://evil.example.invalid")).status).toBe(403);

    for (const body of [{ name: " " }, { name: "x".repeat(41) }, { name: "이름", userId: "user-b" }, { name: "이름", emailVerified: true }, { name: "이름", image: "https://example.invalid" }]) expect((await request(body)).status).toBe(400);

    expect(handler).not.toHaveBeenCalled();
    handler.mockResolvedValue(Response.json({ status: true }));
    expect((await request({ name: " 이름 " })).status).toBe(200);
    expect(await handler.mock.calls[0][0].json()).toEqual({ name: "이름" });
  });
  it("preserves a verification redirect even when its empty body has a JSON content type", async () => {
    handler.mockResolvedValue(new Response(
      null,
      { status: 302, headers: { location: "/login", "content-type": "application/json" } }
    ));

    const response = await GET(new Request("https://app.example.invalid/api/auth/verify-email?token=fixture"));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/login");
    expect(await response.text()).toBe("");
  });

  it("removes bearer tokens and private session fields while preserving cookies", async () => {
    handler.mockResolvedValue(Response.json({
      token: "fixture-private-token",
      session: {
        id: "fixture-session",
        token: "fixture-private-token",
        ipAddress: "192.0.2.1",
        userAgent: "private-agent"
      },
      user: { id: "fixture-user" },
    }, { headers: { "set-cookie": "better-auth.session_token=fixture-cookie; HttpOnly; SameSite=Lax" } }));

    const response = await GET(new Request("https://app.example.invalid/api/auth/get-session"));

    expect(await response.json()).toEqual({ session: { id: "fixture-session" }, user: { id: "fixture-user" } });
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it.each(["/delete-user", "/change-email", "/unlink-account", "/callback/attacker"])("does not expose an unimplemented endpoint (%s)", async path => {
    const response = await POST(new Request(`https://app.example.invalid/api/auth${path}`, { method: "POST" }));

    expect(response.status).toBe(404);
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not link a provider without an authenticated recent session", async () => {
    const request = () => new Request(
      "https://app.example.invalid/api/auth/link-social",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "naver" })
      }
    );

    expect((await POST(request())).status).toBe(401);
    session.mockResolvedValue({ session: { createdAt: new Date(0) } });
    expect((await POST(request())).status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it("fixes explicit link destinations and rejects arbitrary callback or idToken payloads", async () => {
    session.mockResolvedValue({ session: { createdAt: new Date() } });
    handler.mockResolvedValue(Response.json({ url: "https://nid.naver.com/" }));

    const start = (body: unknown) => POST(new Request(
      "https://app.example.invalid/api/auth/link-social",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
    ));

    expect((await start({ provider: "naver", idToken: "fixture" })).status).toBe(400);
    expect((await start({ provider: "naver", callbackURL: "https://evil.example.invalid" })).status).toBe(400);
    expect((await start({ provider: "naver" })).status).toBe(200);
    expect(await handler.mock.calls[0][0].json()).toEqual({
      provider: "naver",
      disableRedirect: true,
      callbackURL: "https://app.example.invalid/settings?tab=account",
      errorCallbackURL: "https://app.example.invalid/settings?tab=account"
    });
  });

  it.each([{}, { provider: "attacker" }, { provider: "google", callbackURL: "https://attacker.example.invalid" }, { provider: "google", idToken: { token: "private-token" } }])("rejects an unapproved social payload before delegation", async body => {
    const response = await POST(new Request(
      "https://app.example.invalid/api/auth/sign-in/social",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
    ));

    expect(response.status).toBe(400);
    expect(handler).not.toHaveBeenCalled();
  });

  it("uses fixed social callbacks and an explicit signup choice", async () => {
    handler.mockResolvedValue(Response.json({ url: "https://accounts.google.com/" }));
    await POST(new Request(
      "https://app.example.invalid/api/auth/sign-in/social",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "google", intent: "signup" })
      }
    ));

    const request = handler.mock.calls[0][0] as Request;

    expect(await request.json()).toEqual({
      provider: "google",
      requestSignUp: true,
      disableRedirect: true,
      callbackURL: "https://app.example.invalid/",
      newUserCallbackURL: "https://app.example.invalid/",
      errorCallbackURL: "https://app.example.invalid/login"
    });
  });

  it.each(["throw", "response"])("hides internal authentication failures (%s)", async failure => {
    if (failure === "throw") handler.mockRejectedValue(new Error("fixture-database-secret"));
    else handler.mockResolvedValue(Response.json({ message: "fixture-database-secret" }, { status: 500 }));

    const response = await GET(new Request("https://app.example.invalid/api/auth/get-session"));

    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("fixture-database-secret");
  });
});
