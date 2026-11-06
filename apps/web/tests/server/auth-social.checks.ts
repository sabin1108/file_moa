import { createHmac, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
vi.mock("server-only", () => ({}));
vi.mock("../../src/server/database/client", () => ({ getDatabase: vi.fn() }));
const background = vi.hoisted(() => ({ tasks: [] as Promise<unknown>[] }));
vi.mock("next/server", () => ({ after: (task: Promise<unknown>) => { background.tasks.push(task); } }));
import { getDatabase } from "../../src/server/database/client";
import { handleAuthRequest } from "../../src/server/auth-handler";
import { getAuth } from "../../src/server/auth";
import { getAuthenticatedWorkspace } from "../../src/server/workspace";
import { manageSocialAccount, readAccountLoginSettings } from "../../src/server/auth-account";

const base = "http://127.0.0.1:3034";
let database: PrismaClient;
let address = 30;
let profile: { id: number; kakao_account: Record<string, unknown> };
const mails: unknown[] = [];
const cookies = new Map<string, string>();
function mergeCookies(...values: string[]) {
  const entries = new Map<string, string>();
  for (const pair of values.join("; ").split(/;\s*/)) { const index = pair.indexOf("="); if (index > 0) entries.set(pair.slice(0, index), pair.slice(index + 1)); }
  return [...entries].map(([key, value]) => `${key}=${value}`).join("; ");
}
function accountHeaders(email: string) { return new Headers({ origin: base, cookie: cookies.get(email)! }); }
function accountForm(operation: "link" | "unlink", provider: string) { const form = new FormData(); form.set("operation", operation); form.set("provider", provider); return form; }
const accessToken = "fixture-oauth-access-token";
const googleKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
function googleToken() {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "fixture-key" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const claims = Buffer.from(JSON.stringify({ iss: "https://accounts.google.com", aud: "fixture-google", sub: String(profile.id), email: profile.kakao_account.email, email_verified: profile.kakao_account.is_email_verified, name: "OAuth Fixture", iat: now, exp: now + 3600 })).toString("base64url");
  return `${header}.${claims}.${sign("RSA-SHA256", Buffer.from(`${header}.${claims}`), googleKeys.privateKey).toString("base64url")}`;
}
const fetchMock = vi.fn(async (input: string | URL | Request, options?: RequestInit) => {
  const url = input instanceof Request ? input.url : String(input);
  if (url.startsWith("https://kauth.kakao.com/oauth/token")) return Response.json({ access_token: accessToken, refresh_token: "fixture-refresh-token", id_token: "fixture-id-token-not-for-storage", token_type: "bearer", expires_in: 3600 });
  if (url === "https://kapi.kakao.com/v2/user/me") return Response.json(profile);
  if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: accessToken, token_type: "bearer", expires_in: 3600, id_token: googleToken() });
  if (url === "https://www.googleapis.com/oauth2/v3/certs") return Response.json({ keys: [{ ...googleKeys.publicKey.export({ format: "jwk" }), kid: "fixture-key", alg: "RS256", use: "sig" }] });
  if (url.startsWith("https://nid.naver.com/oauth2.0/token")) return Response.json({ access_token: accessToken, token_type: "bearer", expires_in: 3600 });
  if (url === "https://openapi.naver.com/v1/nid/me") return Response.json({ resultcode: "00", response: { id: String(profile.id), email: profile.kakao_account.email, name: "OAuth Fixture" } });
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
    cookies.set("oauth-verified@example.invalid", response.headers.getSetCookie().map(value => value.split(";")[0]).join("; "));
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
  it.each(["google", "naver", "kakao"])("%s identity can sign up without app email verification or a password", async provider => {
    const email = `oauth-contact-${provider}@example.invalid`;
    identity(2000 + ["google", "naver", "kakao"].indexOf(provider), email, false);
    const before = mails.length;
    const flow = await start(provider);
    const response = await request(`/callback/${provider}?state=${encodeURIComponent(flow.state)}&code=fixture-code`, undefined, flow.cookie);
    expect(response.headers.get("location")).toBe(base + "/");
    const cookie = response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    expect(cookie).toContain("session_token=");
    cookies.set(email, cookie);
    expect((await database.user.findUniqueOrThrow({ where: { email } })).emailVerified).toBe(false);
    expect(await database.account.count({ where: { providerId: "credential", user: { email } } })).toBe(0);
    const workspace = await getAuthenticatedWorkspace(new Headers({ cookie }));
    expect(workspace.workspaceId.length).toBeGreaterThan(0);
    expect(mails.length).toBe(before);
  });

  it("links another provider explicitly without merging contact emails or moving a foreign account", async () => {
    const email = "oauth-contact-naver@example.invalid";
    const user = await database.user.findUniqueOrThrow({ where: { email } });
    const result = await manageSocialAccount(accountForm("link", "google"), accountHeaders(email));
    expect(result.url).toBeDefined();
    const state = new URL(result.url!).searchParams.get("state")!;
    const cookie = mergeCookies(cookies.get(email)!, result.response!.headers.getSetCookie().map(value => value.split(";")[0]).join("; "));
    identity(9001, "different-explicit-contact@example.invalid", true);
    const response = await request(`/callback/google?state=${encodeURIComponent(state)}&code=fixture-code`, undefined, cookie);
    expect(response.headers.get("location")).toBe(base + "/settings?tab=account");
    expect((await database.account.findFirstOrThrow({ where: { providerId: "google", accountId: "9001" } })).userId).toBe(user.id);
    expect((await database.user.findUniqueOrThrow({ where: { id: user.id } })).email).toBe(email);
    const settings = await readAccountLoginSettings(accountHeaders(email));
    expect(settings.providers.filter(provider => provider.connected)).toHaveLength(2);
    expect(JSON.stringify(settings)).not.toMatch(/accessToken|refreshToken|accountId|9001/);

    const other = "oauth-verified@example.invalid";
    const attempt = await manageSocialAccount(accountForm("link", "google"), accountHeaders(other));
    const otherState = new URL(attempt.url!).searchParams.get("state")!;
    const otherCookie = mergeCookies(cookies.get(other)!, attempt.response!.headers.getSetCookie().map(value => value.split(";")[0]).join("; "));
    const blocked = await request(`/callback/google?state=${encodeURIComponent(otherState)}&code=fixture-code`, undefined, otherCookie);
    expect(blocked.headers.get("location")).toContain("error=");
    expect((await database.account.findFirstOrThrow({ where: { providerId: "google", accountId: "9001" } })).userId).toBe(user.id);
  });

  it("serializes concurrent unlink requests and keeps one usable login method", async () => {
    const email = "oauth-contact-naver@example.invalid";
    const previousId = process.env.GOOGLE_CLIENT_ID;
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    try { expect((await manageSocialAccount(accountForm("unlink", "naver"), accountHeaders(email))).state.status).toBe("error"); }
    finally { vi.stubEnv("GOOGLE_CLIENT_ID", previousId); }
    const results = await Promise.all(["google", "naver"].map(provider => manageSocialAccount(accountForm("unlink", provider), accountHeaders(email))));
    expect(results.filter(result => result.state.status === "success")).toHaveLength(1);
    expect(results.filter(result => result.state.status === "error")).toHaveLength(1);
    expect(await database.account.count({ where: { user: { email } } })).toBe(1);
    expect(await getAuthenticatedWorkspace(accountHeaders(email))).toHaveProperty("workspaceId");
  });

  it("ignores a forged target user and rejects cross-origin account changes", async () => {
    const target = await database.user.findUniqueOrThrow({ where: { email: "oauth-contact-naver@example.invalid" } });
    const form = accountForm("unlink", "naver"); form.set("userId", target.id);
    await manageSocialAccount(form, accountHeaders("oauth-verified@example.invalid"));
    expect(await database.account.count({ where: { userId: target.id } })).toBe(1);
    const crossOrigin = accountHeaders("oauth-verified@example.invalid"); crossOrigin.set("origin", "https://attacker.example.invalid");
    expect((await manageSocialAccount(accountForm("unlink", "kakao"), crossOrigin)).state.status).toBe("error");
    expect(await database.account.count({ where: { user: { email: "oauth-verified@example.invalid" } } })).toBe(1);
  });
  it("password reset cannot add a credential to a social-only identity", async () => {
    const email = "oauth-contact-naver@example.invalid";
    const before = mails.length;
    const callback = getAuth().options.emailAndPassword!.sendResetPassword!;
    let token: string | undefined;
    const observer = vi.spyOn(getAuth().options.emailAndPassword!, "sendResetPassword").mockImplementation(async (...args) => {
      token = args[0].token;
      await callback(...args);
    });
    try {
      const response = await request("/request-password-reset", { email });
      const unknown = await request("/request-password-reset", { email: "unknown-social-contact@example.invalid" });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(await unknown.json());
      expect(mails.length).toBe(before);
      expect(token).toBeDefined();
      const reset = await request("/reset-password", { token, newPassword: "fixture-takeover-password" });
      expect(reset.ok).toBe(false);
      expect(await database.account.count({ where: { providerId: "credential", user: { email } } })).toBe(0);
    } finally { observer.mockRestore(); }
  });

  it("an email account can explicitly link Naver and Kakao without losing its password reset", async () => {
    const userId = "native-link-fixture";
    const email = "native-link-fixture@example.invalid";
    await database.user.create({ data: { id: userId, name: "Native Fixture", email, emailVerified: true } });
    await database.account.create({ data: { id: "native-link-credential", userId, accountId: userId, providerId: "credential", password: await hashPassword("fixture-native-password") } });
    const token = randomUUID();
    await database.session.create({ data: { id: "native-link-session", userId, token, expiresAt: new Date(Date.now() + 3_600_000) } });
    const signature = createHmac("sha256", process.env.BETTER_AUTH_SECRET!).update(token).digest("base64");
    cookies.set(email, `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`);
    for (const [index, provider] of ["naver", "kakao"].entries()) {
      const flow = await manageSocialAccount(accountForm("link", provider), accountHeaders(email));
      expect(flow.url).toBeDefined();
      const state = new URL(flow.url!).searchParams.get("state")!;
      const cookie = mergeCookies(cookies.get(email)!, flow.response!.headers.getSetCookie().map(value => value.split(";")[0]).join("; "));
      identity(9500 + index, `other-contact-${provider}@example.invalid`, false);
      const response = await request(`/callback/${provider}?state=${encodeURIComponent(state)}&code=fixture-code`, undefined, cookie);
      expect(response.headers.get("location")).toBe(base + "/settings?tab=account");
    }
    const settings = await readAccountLoginSettings(accountHeaders(email));
    expect(settings.hasPassword).toBe(true);
    expect(settings.providers.filter(provider => provider.connected)).toHaveLength(2);
    const before = mails.length;
    expect((await request("/request-password-reset", { email })).status).toBe(200);
    expect(mails.length).toBe(before + 1);
  });
});
