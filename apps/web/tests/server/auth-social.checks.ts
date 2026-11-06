import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
vi.mock("server-only", () => ({}));
vi.mock("../../src/server/database/client", () => ({ getDatabase: vi.fn() }));
const background = vi.hoisted(() => ({ tasks: [] as Promise<unknown>[] }));
vi.mock("next/server", () => ({ after: (task: Promise<unknown>) => { background.tasks.push(task); } }));
import { getDatabase } from "../../src/server/database/client";
import { handleAuthRequest } from "../../src/server/auth-handler";

const base = "http://127.0.0.1:3034";
let database: PrismaClient;
let address = 30;
let profile: { id: number; kakao_account: Record<string, unknown> };
const mails: unknown[] = [];
const accessToken = "fixture-oauth-access-token";
const fetchMock = vi.fn(async (input: string | URL | Request, options?: RequestInit) => {
  const url = input instanceof Request ? input.url : String(input);
  if (url.startsWith("https://kauth.kakao.com/oauth/token")) return Response.json({ access_token: accessToken, refresh_token: "fixture-refresh-token", id_token: "fixture-id-token-not-for-storage", token_type: "bearer", expires_in: 3600 });
  if (url === "https://kapi.kakao.com/v2/user/me") return Response.json(profile);
  if (url === "https://api.resend.com/emails") { mails.push(JSON.parse(String(options?.body))); return Response.json({ id: randomUUID() }); }
  throw new Error("Unexpected external request in isolated OAuth test");
});

async function request(path: string, body?: unknown, cookie = "") {
  const response = await handleAuthRequest(new Request(base + "/api/auth" + path, {
    method: body ? "POST" : "GET", headers: { origin: base, cookie, "content-type": "application/json", "x-vercel-forwarded-for": `192.0.2.${address++}` },
    body: body ? JSON.stringify(body) : undefined,
  }));
  await Promise.all(background.tasks.splice(0));
  return response;
}
async function start(provider: string, intent = "signup") {
  const response = await request("/sign-in/social", { provider, intent });
  expect(response.status).toBe(200);
  const url = new URL((await response.json()).url);
  expect(url.searchParams.get("redirect_uri")).toBe(`${base}/api/auth/callback/${provider}`);
  const cookie = response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  return { state: url.searchParams.get("state")!, cookie, url };
}
function callback(state: string, cookie: string) { return request(`/callback/kakao?state=${encodeURIComponent(state)}&code=fixture-code`, undefined, cookie); }
function identity(id: number, email?: string, verified = true) {
  profile = { id, kakao_account: { email, is_email_valid: verified, is_email_verified: verified, profile: { nickname: "OAuth Fixture" } } };
}
function errorCode(response: Response) { return new URL(response.headers.get("location")!, base).searchParams.get("error"); }

beforeAll(() => {
  const url = new URL(process.env.MOA_TEST_DATABASE_URL ?? "");
  expect(url.hostname).toBe("127.0.0.1"); expect(url.username).toBe("moa_runtime"); expect(url.pathname).toBe("/moa_auth_test");
  expect(process.env.MOA_TEST_DATABASE_RUN).toMatch(/^[a-f0-9-]{36}$/);
  database = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.href, ssl: false, max: 4 }), log: [], errorFormat: "minimal" });
  vi.mocked(getDatabase).mockReturnValue(database);
  for (const [key, value] of Object.entries({ BETTER_AUTH_SECRET: "fixture-oauth-secret-" + randomUUID(), BETTER_AUTH_URL: base, EMAIL_FROM: "Moa <sender@example.invalid>", RESEND_API_KEY: "fixture-resend", GOOGLE_CLIENT_ID: "fixture-google", GOOGLE_CLIENT_SECRET: "fixture-google-secret", NAVER_CLIENT_ID: "fixture-naver", NAVER_CLIENT_SECRET: "fixture-naver-secret", KAKAO_CLIENT_ID: "fixture-kakao", KAKAO_CLIENT_SECRET: "fixture-kakao-secret" })) vi.stubEnv(key, value);
  vi.stubGlobal("fetch", fetchMock);
});
afterAll(async () => { await Promise.all(background.tasks.splice(0)); await database?.$disconnect(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("OAuth SDK and SQL integration with synthetic provider HTTP", () => {
  it.each(["google", "naver", "kakao"])("starts %s with signed state and a fixed callback", async provider => {
    const flow = await start(provider);
    expect(flow.state.length).toBeGreaterThan(10); expect(flow.cookie).not.toBe("");
    if (provider === "google") expect(flow.url.searchParams.get("code_challenge_method")).toBe("S256");
  });
  it("rejects changed state before any provider HTTP or account creation", async () => {
    const flow = await start("kakao"); const calls = fetchMock.mock.calls.length;
    const response = await callback(flow.state + "changed", flow.cookie);
    expect(response.status).toBe(302); expect(response.headers.get("location")).toContain("/login?");
    expect(fetchMock.mock.calls.length).toBe(calls);
  });
  it("does not implicitly register a new social identity from login", async () => {
    identity(1001, "oauth-unregistered@example.invalid");
    const flow = await start("kakao", "signin");
    expect(errorCode(await callback(flow.state, flow.cookie))).toBe("signup_disabled");
    expect(await database.user.findUnique({ where: { email: "oauth-unregistered@example.invalid" } })).toBeNull();
  });
  it("explicit signup creates a verified identity and encrypts tokens; replay fails", async () => {
    identity(1002, "oauth-verified@example.invalid");
    const flow = await start("kakao"); const response = await callback(flow.state, flow.cookie);
    expect(response.status).toBe(302); expect(response.headers.get("location")).toBe(base + "/");
    expect(response.headers.get("set-cookie")).toContain("session_token=");
    const account = await database.account.findFirstOrThrow({ where: { providerId: "kakao", user: { email: "oauth-verified@example.invalid" } } });
    expect(account.accessToken).not.toBe(accessToken); expect(account.accessToken?.length).toBeGreaterThan(accessToken.length);
    expect(account.idToken).toBeNull();
    const replay = await callback(flow.state, flow.cookie);
    expect(replay.headers.get("set-cookie") ?? "").not.toContain("session_token=");
    expect(await database.user.count({ where: { email: "oauth-verified@example.invalid" } })).toBe(1);
    const signin = await start("kakao", "signin");
    expect((await callback(signin.state, signin.cookie)).headers.get("location")).toBe(base + "/");
    expect((await database.account.findUniqueOrThrow({ where: { id: account.id } })).idToken).toBeNull();
  });
  it("never implicitly merges another provider identity with an existing email", async () => {
    identity(1003, "oauth-verified@example.invalid");
    const flow = await start("kakao"); const response = await callback(flow.state, flow.cookie);
    expect(errorCode(response)).toBe("account_not_linked");
    expect(await database.account.count({ where: { user: { email: "oauth-verified@example.invalid" } } })).toBe(1);
    expect(response.headers.get("set-cookie") ?? "").not.toContain("session_token=");
  });
  it("missing email fails without creating an account", async () => {
    identity(1004); const flow = await start("kakao");
    expect(errorCode(await callback(flow.state, flow.cookie))).toBe("email_not_found");
    expect(await database.account.count({ where: { providerId: "kakao", accountId: "1004" } })).toBe(0);
  });
  it("unverified email requires mail verification and creates no session", async () => {
    identity(1005, "oauth-unverified@example.invalid", false); const flow = await start("kakao");
    const response = await callback(flow.state, flow.cookie);
    expect(errorCode(response)).toBe("email_not_verified");
    expect(await database.session.count({ where: { user: { email: "oauth-unverified@example.invalid" } } })).toBe(0);
    expect(mails.length).toBeGreaterThan(0);
  });
});
