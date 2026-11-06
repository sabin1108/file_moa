import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";

vi.mock("server-only", () => ({}));
vi.mock("../../src/server/database/client", () => ({ getDatabase: vi.fn() }));

import { getDatabase } from "../../src/server/database/client";
import { getAuth } from "../../src/server/auth";
import { getAuthenticatedWorkspace } from "../../src/server/workspace";
import { createAuthRateLimiter } from "../../src/server/auth-rate-limit";

const secret = "fixture-auth-secret-" + randomUUID();
const userA = "runtime-a";
const userB = "runtime-b";
const tokenA = randomUUID();
const tokenB = randomUUID();
const expiredToken = randomUUID();
let database: PrismaClient;
let secondDatabase: PrismaClient;

function sessionHeaders(token: string, signingSecret = secret) {
  const signature = createHmac("sha256", signingSecret).update(token).digest("base64");

  return new Headers({ cookie: `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}` });
}

beforeAll(async () => {
  // Only the disposable container runner supplies this URL; no application env is loaded.
  const url = new URL(process.env.MOA_TEST_DATABASE_URL ?? "");

  expect(url.hostname).toBe("127.0.0.1");
  expect(url.username).toBe("moa_runtime");
  expect(url.pathname).toBe("/moa_auth_test");
  expect(process.env.MOA_TEST_DATABASE_RUN).toMatch(/^[a-f0-9-]{36}$/);

  const createDatabase = () => new PrismaClient({
    adapter: new PrismaPg({ connectionString: url.toString(), ssl: false, max: 1 }),
    log: [],
    errorFormat: "minimal",
  });

  database = createDatabase();
  secondDatabase = createDatabase();
  vi.mocked(getDatabase).mockReturnValue(database);
  process.env.BETTER_AUTH_SECRET = secret;
  process.env.BETTER_AUTH_URL = "http://127.0.0.1:3034";
  process.env.RESEND_API_KEY = "fixture-resend-key";
  process.env.EMAIL_FROM = "Moa <sender@example.invalid>";

  await database.user.createMany({
    data: [userA, userB, "runtime-race"].map(id => ({ id, name: id, email: `${id}@example.invalid`, emailVerified: true })),
  });
  await database.session.createMany({
    data: [
      { id: "runtime-session-a", token: tokenA, userId: userA, expiresAt: new Date(Date.now() + 3_600_000) },
      { id: "runtime-session-b", token: tokenB, userId: userB, expiresAt: new Date(Date.now() + 3_600_000) },
      { id: "runtime-expired", token: expiredToken, userId: userA, expiresAt: new Date(Date.now() - 60_000) },
    ],
  });
});

afterAll(async () => {
  await Promise.all([database?.$disconnect(), secondDatabase?.$disconnect()]);
});

describe("real PrismaPg and Better Auth adapter", () => {
  it("shares an atomic authentication limit across independent app instances without storing IP text", async () => {
    const key = `192.0.2.30:/fixture/${randomUUID()}`;
    const stores = [createAuthRateLimiter(() => database, secret), createAuthRateLimiter(() => secondDatabase, secret)];
    const results = await Promise.all(Array.from({ length: 12 }, (_, index) => stores[index % 2].consume(key, { max: 5, window: 60 })));
    expect(results.filter(result => result.allowed)).toHaveLength(5);
    expect(results.filter(result => !result.allowed).every(result => result.retryAfter && result.retryAfter > 0 && result.retryAfter <= 60)).toBe(true);
    expect(await database.rateLimit.findUnique({ where: { key } })).toBeNull();
    const hashedKey = createHmac("sha256", secret).update("moa-rate-limit-v1\0").update(key).digest("hex");
    expect((await database.rateLimit.findUniqueOrThrow({ where: { key: hashedKey } })).count).toBe(5);
  });
  it("AUTHDB-004 resolves a signed session without a workspace user context", async () => {
    expect(await database.workspace.findMany()).toEqual([]);

    const session = await getAuth().api.getSession({ headers: sessionHeaders(tokenA) });

    expect(session?.user.id).toBe(userA);
  });

  it("AUTHDB-005 uses the session user, ignores forged owner headers, and returns only owner IDs", async () => {
    const headers = sessionHeaders(tokenA);
    headers.set("x-user-id", userB);
    headers.set("x-workspace-id", "workspace-b");

    const owner = await getAuthenticatedWorkspace(headers);

    expect(owner).toEqual({ userId: userA, workspaceId: expect.any(String) });
    expect(await getAuthenticatedWorkspace(sessionHeaders(tokenA))).toEqual(owner);
    expect(await database.workspace.findMany()).toEqual([]);
  });

  it("AUTHDB-005 alternates A/B on one pool connection without sharing a workspace", async () => {
    const a = await getAuthenticatedWorkspace(sessionHeaders(tokenA));
    const b = await getAuthenticatedWorkspace(sessionHeaders(tokenB));

    expect(a.workspaceId).not.toBe(b.workspaceId);
    expect(b.userId).toBe(userB);
    expect(await getAuthenticatedWorkspace(sessionHeaders(tokenA))).toEqual(a);

    await database.$transaction(async transaction => {
      await transaction.$executeRaw`SELECT set_config('moa.user_id', ${userA}, true)`;

      expect(await transaction.workspace.findUnique({ where: { id: b.workspaceId } })).toBeNull();
      expect((await transaction.workspace.updateMany({ where: { id: b.workspaceId }, data: { updatedAt: new Date() } })).count).toBe(0);
      expect((await transaction.workspace.deleteMany({ where: { id: b.workspaceId } })).count).toBe(0);
    });
  });

  it("AUTHDB-006 rolls back a rejected ownership change and clears context on the reused connection", async () => {
    const a = await getAuthenticatedWorkspace(sessionHeaders(tokenA));
    const [before] = await database.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;

    await expect(database.$transaction(async transaction => {
      await transaction.$executeRaw`SELECT set_config('moa.user_id', ${userA}, true)`;
      await transaction.workspace.update({ where: { id: a.workspaceId }, data: { ownerUserId: userB } });
    })).rejects.toThrow();

    const [after] = await database.$queryRaw<{ pid: number; owner: string | null }[]>`
      SELECT pg_backend_pid() AS pid, current_setting('moa.user_id', true) AS owner`;

    expect(after.pid).toBe(before.pid);
    expect(after.owner || null).toBeNull();
    expect(await database.workspace.findMany()).toEqual([]);
    expect(await getAuthenticatedWorkspace(sessionHeaders(tokenA))).toEqual(a);
  });

  it("AUTHDB-007 concurrent initialization through separate pools returns one workspace", async () => {
    const token = randomUUID();
    await database.session.create({ data: { id: "runtime-race-session", token, userId: "runtime-race", expiresAt: new Date(Date.now() + 3_600_000) } });
    let calls = 0;
    vi.mocked(getDatabase).mockImplementation(() => calls++ % 2 === 0 ? database : secondDatabase);

    try {
      const owners = await Promise.all(Array.from({ length: 8 }, () => getAuthenticatedWorkspace(sessionHeaders(token))));

      expect(new Set(owners.map(owner => owner.workspaceId)).size).toBe(1);
      expect(owners.every(owner => owner.userId === "runtime-race")).toBe(true);
    } finally {
      vi.mocked(getDatabase).mockReturnValue(database);
    }
  });

  it("rejects missing, forged, unsigned and expired cookies before creating workspaces", async () => {
    const cases = [
      new Headers(),
      sessionHeaders(tokenA, "forged-secret"),
      new Headers({ cookie: `better-auth.session_token=${tokenA}` }),
      sessionHeaders(expiredToken),
      sessionHeaders(randomUUID()),
    ];

    for (const headers of cases) {
      await expect(getAuthenticatedWorkspace(headers)).rejects.toThrow("Authentication required.");
    }
  });

  it("revoked sessions immediately lose access without cookie-cache fallback", async () => {
    await database.session.delete({ where: { token: tokenB } });

    await expect(getAuthenticatedWorkspace(sessionHeaders(tokenB))).rejects.toThrow("Authentication required.");
  });

  it("an unverified account cannot initialize a workspace even with a stored session", async () => {
    const userId = "runtime-unverified";
    const token = randomUUID();
    await database.user.create({ data: { id: userId, name: "Unverified", email: "runtime-unverified@example.invalid" } });
    await database.session.create({ data: { id: "runtime-unverified-session", userId, token, expiresAt: new Date(Date.now() + 3_600_000) } });

    await expect(getAuthenticatedWorkspace(sessionHeaders(token))).rejects.toThrow("Authentication required.");
    await database.$transaction(async transaction => {
      await transaction.$executeRaw`SELECT set_config('moa.user_id', ${userId}, true)`;
      expect(await transaction.workspace.count()).toBe(0);
    });
  });

  it("unimplemented social endpoints remain closed in this unit", async () => {
    const { POST } = await import("../../src/app/api/auth/[...all]/route");
    const response = await POST(new Request("http://127.0.0.1:3034/api/auth/sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://127.0.0.1:3034" },
      body: JSON.stringify({ provider: "google" }),
    }));

    expect(response.status).toBe(404);
  });
});
