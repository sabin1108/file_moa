import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";

vi.mock("server-only", () => ({}));
vi.mock("../../src/server/database/client", () => ({ getDatabase: vi.fn() }));

const background = vi.hoisted(() => ({ tasks: [] as Promise<unknown>[] }));

vi.mock(
  "next/server",
  () => ({
    after: (task: Promise<unknown>) => {
      background.tasks.push(task);
    }
  })
);

import { getDatabase } from "../../src/server/database/client";
import { getAuthenticatedWorkspace } from "../../src/server/auth/workspace";
import { GET, POST } from "../../src/app/api/auth/[...all]/route";

type Mail = {
  to: string[];
  subject: string;
  text: string
};

const mails: Mail[] = [];
const baseURL = "http://127.0.0.1:3034";
const secret = "fixture-email-secret-" + randomUUID();
const email = "email-flow@example.invalid";
const password = "fixture-pass-" + randomUUID().slice(0, 12);
let database: PrismaClient;
let address = 1;
let sessionCookie = "";

async function request(path: string, body?: Record<string, unknown>, cookie = "", ip?: string) {
  const headers = new Headers({ origin: baseURL, "x-vercel-forwarded-for": ip ?? `192.0.2.${address++}` });

  if (cookie) headers.set("cookie", cookie);

  if (body) headers.set("content-type", "application/json");

  const req = new Request(`${baseURL}/api/auth${path}`, {
    method: body ? "POST" : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const response = await (body ? POST(req) : GET(req));

  await Promise.all(background.tasks.splice(0));

  return response;
}

function cookieFrom(response: Response) {
  return response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
}

function latestLink(recipient: string, subject: string) {
  const mail = mails.slice().reverse().find(value => value.to.includes(recipient) && value.subject.includes(subject));

  expect(mail).toBeDefined();

  return new URL(mail!.text.match(/https?:\/\/\S+/)![0]);
}

function signedVerification(claims: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");

  return `${header}.${payload}.${signature}`;
}

beforeAll(async () => {
  const url = new URL(process.env.MOA_TEST_DATABASE_URL ?? "");

  expect(url.hostname).toBe("127.0.0.1");
  expect(url.username).toBe("moa_runtime");
  expect(url.pathname).toBe("/moa_auth_test");
  expect(process.env.MOA_TEST_DATABASE_RUN).toMatch(/^[a-f0-9-]{36}$/);

  database = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url.toString(), ssl: false, max: 4 }),
    log: [],
    errorFormat: "minimal"
  });
  vi.mocked(getDatabase).mockReturnValue(database);
  vi.stubEnv("BETTER_AUTH_SECRET", secret);
  vi.stubEnv("BETTER_AUTH_URL", baseURL);
  vi.stubEnv("RESEND_API_KEY", "fixture-resend-key");
  vi.stubEnv("EMAIL_FROM", "Moa <sender@example.invalid>");
  // Substitute only Resend HTTP; all auth, hashing, cookies and SQL are real.
  vi.stubGlobal("fetch", vi.fn(async (_url: string, options: RequestInit) => {
    mails.push(JSON.parse(String(options.body)) as Mail);

    return Response.json({ id: randomUUID() });
  }));
});

afterAll(async () => {
  await Promise.all(background.tasks.splice(0));
  await database?.$disconnect();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("email authentication through the real route and PostgreSQL", () => {
  it("AUTHMAIL-001 rejects weak passwords and requires verification before a session", async () => {
    expect((await request("/sign-up/email", { email, name: "Fixture", password: "short" })).status).toBe(400);
    expect(await database.user.findUnique({ where: { email } })).toBeNull();

    const response = await request("/sign-up/email", { email, name: "", password });

    expect(response.status).toBe(200);
    expect(await response.json()).not.toHaveProperty("token");
    expect(response.headers.get("set-cookie") ?? "").not.toContain("session_token");
    expect(await database.session.count({ where: { user: { email } } })).toBe(0);
    expect((await database.user.findUniqueOrThrow({ where: { email } })).name).toBe("");

    const account = await database.account.findFirstOrThrow({ where: { user: { email }, providerId: "credential" } });

    expect(account.password).not.toBe(password);
    expect(account.password!.length).toBeGreaterThan(30);

    const blocked = await request("/sign-in/email", { email, password });

    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
    expect(latestLink(email, "이메일 주소 확인").pathname).toBe("/verify-email");
  });

  it("AUTHMAIL-001 duplicate signup preserves the credential and does not reveal existing membership", async () => {
    const before = await database.account.findFirstOrThrow({ where: { user: { email }, providerId: "credential" } });
    const sentBefore = mails.length;
    const response = await request("/sign-up/email", { email, name: "Other", password: "different-fixture-password" });

    expect(response.status).toBe(200);
    expect(await response.json()).not.toHaveProperty("token");
    expect(await database.user.count({ where: { email } })).toBe(1);
    expect((await database.account.findUniqueOrThrow({ where: { id: before.id } })).password).toBe(before.password);
    expect(mails.length).toBe(sentBefore);
  });

  it("AUTHMAIL-002 rejects expired and altered verification links without changing the user", async () => {
    const expired = signedVerification({ email, exp: Math.floor(Date.now() / 1000) - 1 });
    const expiredResponse = await request(`/verify-email?token=${expired}`);

    expect(expiredResponse.status).toBe(401);
    expect(await expiredResponse.json()).toMatchObject({ code: "TOKEN_EXPIRED" });

    const actual = latestLink(email, "이메일 주소 확인").searchParams.get("token")!;
    const parts = actual.split(".");

    parts[1] = Buffer.from(JSON.stringify({ email: "forged@example.invalid" })).toString("base64url");
    expect((await request(`/verify-email?token=${parts.join(".")}`)).status).toBe(401);
    expect((await database.user.findUniqueOrThrow({ where: { email } })).emailVerified).toBe(false);
  });

  it("AUTHMAIL-002 verifies once and permits a harmless re-click without creating a login session", async () => {
    const link = latestLink(email, "이메일 주소 확인");
    const path = link.pathname.replace("/api/auth", "") + link.search;

    for (let click = 0; click < 2; click++) {
      const response = await request(path);

      expect(response.status).toBe(200);
      expect(response.headers.get("set-cookie") ?? "").not.toContain("session_token");
    }

    expect((await database.user.findUniqueOrThrow({ where: { email } })).emailVerified).toBe(true);
    expect(await database.session.count({ where: { user: { email } } })).toBe(0);
  });

  it("AUTHMAIL-003 signs in with HttpOnly cookies and exposes no JSON session token or stored IP", async () => {
    expect((await request("/sign-in/email", { email, password: "wrong-fixture-password" })).status).toBe(401);

    const response = await request("/sign-in/email", { email, password });

    expect(response.status).toBe(200);
    expect(await response.json()).not.toHaveProperty("token");
    expect(response.headers.get("set-cookie")).toMatch(/httponly/i);
    expect(response.headers.get("set-cookie")).toMatch(/samesite=lax/i);
    sessionCookie = cookieFrom(response);

    const current = await request("/get-session", undefined, sessionCookie);

    expect(current.status).toBe(200);

    const payload = await current.json();

    expect(payload.user.email).toBe(email);
    expect(payload.session).not.toHaveProperty("token");
    expect(await getAuthenticatedWorkspace(new Headers({ cookie: sessionCookie }))).toMatchObject({ userId: payload.user.id });

    const saved = await database.session.findFirstOrThrow({ where: { user: { email } } });

    expect(saved.ipAddress).toBeNull();
    expect(saved.userAgent).toBeNull();
  });

  it("AUTHPROFILE-001 saves a name only for the verified session owner and preserves another user", async () => {
    const user = await database.user.findUniqueOrThrow({ where: { email } });

    expect(user.name).toBe("");

    const other = await database.user.create({
      data: { id: randomUUID(), name: "Other", email: "profile-other@example.invalid", emailVerified: true }
    });

    expect((await request("/update-user", { name: "Owner" })).status).toBe(401);
    expect((await request("/update-user", { name: "Owner" }, "better-auth.session_token=forged")).status).toBe(401);

    for (const body of [{ name: " " }, { name: "x".repeat(41) }, { name: "Owner", userId: other.id }, { name: "Owner", emailVerified: true }]) expect((await request("/update-user", body, sessionCookie)).status).toBe(400);

    expect((await POST(new Request(
      `${baseURL}/api/auth/update-user`,
      {
        method: "POST",
        headers: {
          origin: "https://evil.example.invalid",
          cookie: sessionCookie,
          "content-type": "application/json"
        },
        body: JSON.stringify({ name: "Owner" })
      }
    ))).status).toBe(403);
    expect((await database.user.findUniqueOrThrow({ where: { id: user.id } })).name).toBe("");
    expect((await request("/update-user", { name: " 이름 설정 " }, sessionCookie)).status).toBe(200);
    expect((await database.user.findUniqueOrThrow({ where: { id: user.id } })).name).toBe("이름 설정");
    expect((await database.user.findUniqueOrThrow({ where: { id: other.id } })).name).toBe("Other");
    expect((await (await request("/get-session", undefined, sessionCookie)).json()).user.name).toBe("이름 설정");
  });

  it("AUTHMAIL-005 blocks cross-site requests and external redirects before sending mail", async () => {
    const before = mails.length;
    const response = await POST(new Request(`${baseURL}/api/auth/sign-out`, {
      method: "POST",
      headers: {
        origin: "https://attacker.example.invalid",
        cookie: sessionCookie,
        "content-type": "application/json"
      },
      body: "{}",
    }));

    expect(response.status).toBe(403);
    expect((await request("/request-password-reset", { email, redirectTo: "https://attacker.example.invalid" })).status).toBe(403);
    expect(mails.length).toBe(before);
    expect(await (await request("/get-session", undefined, sessionCookie)).json()).not.toBeNull();
  });

  it("AUTHMAIL-003 signout invalidates the old cookie", async () => {
    expect((await request("/sign-out", {}, sessionCookie)).status).toBe(200);
    expect(await (await request("/get-session", undefined, sessionCookie)).json()).toBeNull();

    const login = await request("/sign-in/email", { email, password });

    expect(login.status).toBe(200);
    sessionCookie = cookieFrom(login);
  });

  it("AUTHMAIL-004 reset requests hide unknown emails and reject expired tokens", async () => {
    const sentBefore = mails.length;
    const unknown = await request(
      "/request-password-reset",
      { email: "missing@example.invalid", redirectTo: `${baseURL}/login` }
    );

    expect(unknown.status).toBe(200);
    expect(mails.length).toBe(sentBefore);

    const known = await request("/request-password-reset", { email, redirectTo: `${baseURL}/login` });

    expect(known.status).toBe(200);
    expect(await known.json()).toEqual(await unknown.json());

    const expired = latestLink(email, "비밀번호").pathname.split("/").at(-1)!;
    const user = await database.user.findUniqueOrThrow({ where: { email } });
    const records = await database.verification.findMany({ where: { value: user.id } });

    expect(records).toHaveLength(1);
    expect(records[0].identifier).not.toContain(expired);
    await database.verification.updateMany({ where: { value: user.id }, data: { expiresAt: new Date(0) } });

    const response = await request("/reset-password", { token: expired, newPassword: "new-fixture-password-123" });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("AUTHMAIL-004 concurrent reset consumes one token, changes the password and revokes existing sessions", async () => {
    expect((await request("/request-password-reset", { email, redirectTo: `${baseURL}/login` })).status).toBe(200);

    const token = latestLink(email, "비밀번호").pathname.split("/").at(-1)!;
    const choices = ["new-fixture-password-one", "new-fixture-password-two"];
    const results = await Promise.all(choices.map(newPassword => request("/reset-password", { token, newPassword })));

    expect(results.filter(result => result.status === 200)).toHaveLength(1);
    expect(results.filter(result => result.status === 400)).toHaveLength(1);

    const winner = choices[results.findIndex(result => result.status === 200)];

    expect((await request("/reset-password", { token, newPassword: "replay-fixture-password" })).status).toBe(400);
    expect(await (await request("/get-session", undefined, sessionCookie)).json()).toBeNull();
    expect((await request("/sign-in/email", { email, password })).status).toBe(401);
    expect((await request("/sign-in/email", { email, password: winner })).status).toBe(200);
  });

  it("AUTHMAIL-005 limits repeated reset requests even without storing IP on sessions", async () => {
    const ip = "198.51.100.200";
    const responses = [];

    for (let count = 0; count < 4; count++) {
      responses.push(await request("/request-password-reset", { email: "missing@example.invalid" }, "", ip));
    }

    expect(responses.map(response => response.status)).toEqual([200, 200, 200, 429]);
  });

  it("AUTHMAIL-006 a background delivery failure keeps the account unverified and logs no secrets", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("fixture-secret-and-token"));
    const previousFetch = globalThis.fetch;
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    vi.stubGlobal("fetch", fetch);

    try {
      const failedEmail = "delivery-failure@example.invalid";
      const response = await request("/sign-up/email", { email: failedEmail, name: "Fixture", password });

      expect(response.status).toBe(200);
      expect((await database.user.findUniqueOrThrow({ where: { email: failedEmail } })).emailVerified).toBe(false);
      expect(await database.session.count({ where: { user: { email: failedEmail } } })).toBe(0);
      expect(log).toHaveBeenCalledWith("Authentication email delivery failed.", { providerStatus: null });
      expect(JSON.stringify(log.mock.calls)).not.toContain("fixture-secret-and-token");
    } finally {
      vi.stubGlobal("fetch", previousFetch);
      log.mockRestore();
    }
  });
});
