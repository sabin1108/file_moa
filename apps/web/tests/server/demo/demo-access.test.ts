import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../../../src/proxy";
import { createDemoVisitor, readDemoVisitor, DEMO_VISITOR_COOKIE } from "../../../src/server/demo/demo-access";
import { GET } from "../../../src/app/demo/access/[token]/route";

vi.mock("server-only", () => ({}));
const invite = "synthetic-invitation-" + "a".repeat(43);
beforeEach(() => {
  vi.stubEnv("DEMO_ACCESS_TOKEN", invite);
  vi.stubEnv("BETTER_AUTH_SECRET", "synthetic-demo-access-secret-at-least-32-characters");
  vi.stubEnv("BETTER_AUTH_URL", "https://fixture.invalid");
});
afterEach(() => vi.unstubAllEnvs());

it.each(["/demo", "/demo/start", "/demo/intro", "/demo/assets/sample-pdf"])("rejects predictable direct access to %s without a visitor credential", path => {
  const response = proxy(new NextRequest(`https://fixture.invalid${path}`));
  expect(response.status).toBe(404);
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it("consumes only a valid invitation into an HttpOnly credential and a clean destination", async () => {
  const response = await GET(new NextRequest(`https://fixture.invalid/demo/access/${invite}`), { params: Promise.resolve({ token: invite }) });
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("/demo/intro");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("set-cookie")).toMatch(/HttpOnly/);
  expect(response.headers.get("set-cookie")).toMatch(/Secure/);
  expect(response.headers.get("set-cookie")).not.toContain(invite);
  const bad = await GET(new NextRequest("https://fixture.invalid/demo/access/bad"), { params: Promise.resolve({ token: "bad" }) });
  expect(bad.status).toBe(404);
  expect(bad.headers.get("set-cookie")).toBeNull();
});
it("keeps the visitor identity stable and rejects tampering, expiry and invitation rotation", async () => {
  const { visitor, token } = createDemoVisitor();
  expect(readDemoVisitor(token)?.id).toBe(visitor.id);
  expect(readDemoVisitor(token + "x")).toBeNull();
  expect(readDemoVisitor(token, visitor.expiresAt)).toBeNull();
  const request = new NextRequest(`https://fixture.invalid/demo/access/${invite}`, { headers: { cookie: `${DEMO_VISITOR_COOKIE}=${token}` } });
  expect((await GET(request, { params: Promise.resolve({ token: invite }) })).headers.get("set-cookie")).toBeNull();
  vi.stubEnv("DEMO_ACCESS_TOKEN", "b".repeat(64));
  expect(readDemoVisitor(token)).toBeNull();
});
