import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const handler = vi.hoisted(() => vi.fn());
vi.mock("../../src/server/auth", () => ({ getAuth: () => ({ handler, options: { baseURL: "https://app.example.invalid" } }) }));

import { GET, POST } from "../../src/app/api/auth/[...all]/route";

beforeEach(() => { handler.mockReset(); });

describe("public authentication protocol boundary", () => {
  it("preserves a verification redirect even when its empty body has a JSON content type", async () => {
    handler.mockResolvedValue(new Response(null, { status: 302, headers: { location: "/login", "content-type": "application/json" } }));

    const response = await GET(new Request("https://app.example.invalid/api/auth/verify-email?token=fixture"));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/login");
    expect(await response.text()).toBe("");
  });

  it("removes bearer tokens and private session fields while preserving cookies", async () => {
    handler.mockResolvedValue(Response.json({
      token: "fixture-private-token",
      session: { id: "fixture-session", token: "fixture-private-token", ipAddress: "192.0.2.1", userAgent: "private-agent" },
      user: { id: "fixture-user" },
    }, { headers: { "set-cookie": "better-auth.session_token=fixture-cookie; HttpOnly; SameSite=Lax" } }));

    const response = await GET(new Request("https://app.example.invalid/api/auth/get-session"));

    expect(await response.json()).toEqual({ session: { id: "fixture-session" }, user: { id: "fixture-user" } });
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it.each(["/delete-user", "/change-email", "/link-social", "/callback/attacker"])("does not expose an unimplemented endpoint (%s)", async path => {
    const response = await POST(new Request(`https://app.example.invalid/api/auth${path}`, { method: "POST" }));

    expect(response.status).toBe(404);
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([{}, { provider: "attacker" }, { provider: "google", callbackURL: "https://attacker.example.invalid" }, { provider: "google", idToken: { token: "private-token" } }])("rejects an unapproved social payload before delegation", async body => {
    const response = await POST(new Request("https://app.example.invalid/api/auth/sign-in/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
    expect(response.status).toBe(400);
    expect(handler).not.toHaveBeenCalled();
  });

  it("uses fixed social callbacks and an explicit signup choice", async () => {
    handler.mockResolvedValue(Response.json({ url: "https://accounts.google.com/" }));
    await POST(new Request("https://app.example.invalid/api/auth/sign-in/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "google", intent: "signup" }) }));
    const request = handler.mock.calls[0][0] as Request;
    expect(await request.json()).toEqual({ provider: "google", requestSignUp: true, disableRedirect: true, callbackURL: "https://app.example.invalid/", newUserCallbackURL: "https://app.example.invalid/", errorCallbackURL: "https://app.example.invalid/login" });
  });

  it.each(["throw", "response"])("hides internal authentication failures (%s)", async failure => {
    if (failure === "throw") handler.mockRejectedValue(new Error("fixture-database-secret"));
    else handler.mockResolvedValue(Response.json({ message: "fixture-database-secret" }, { status: 500 }));

    const response = await GET(new Request("https://app.example.invalid/api/auth/get-session"));

    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("fixture-database-secret");
  });
});
