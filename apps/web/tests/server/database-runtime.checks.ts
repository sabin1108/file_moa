import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import { readChatSession } from "../../src/server/chat-session";

vi.mock("server-only", () => ({}));
vi.mock("../../src/server/database/client", () => ({ getDatabase: vi.fn() }));

import { getDatabase } from "../../src/server/database/client";
import { getAuth } from "../../src/server/auth";
import { getAuthenticatedWorkspace } from "../../src/server/workspace";
import { createAuthRateLimiter } from "../../src/server/auth-rate-limit";
import { startUsage, finishUsage, readUsage } from "../../src/server/ai-usage";
import { finishAccountDeletion } from "../../src/server/auth-account-deletion";

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

function deletionHeaders(token: string) {
  const headers = sessionHeaders(token);
  headers.set("origin", "http://127.0.0.1:3034");

  return headers;
}

function deletionFixtureToken() {
  const token = randomBytes(32).toString("base64url");
  const identifier = `moa-delete:${createHash("sha256").update(token).digest("hex")}`;

  return { token, identifier };
}

function deletionForm(token: string) {
  const form = new FormData();
  form.set("confirm", "on");
  form.set("token", token);

  return form;
}

async function addDeletionVerification(userId: string, sessionId: string, token: string, expiresAt = new Date(Date.now() + 1_800_000)) {
  await database.verification.create({
    data: {
      id: randomUUID(),
      identifier: `moa-delete:${createHash("sha256").update(token).digest("hex")}`,
      value: JSON.stringify({ userId, sessionId }),
      expiresAt,
    },
  });
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
  it("resolves a general chat owner from a fresh session and rejects an expired session", async () => {
    expect(await readChatSession(sessionHeaders(tokenA))).toMatchObject({ userId: userA, sessionUserId: userA, sessionToken: tokenA });
    expect(await readChatSession(sessionHeaders(expiredToken))).toBeNull();
  });

  it("admits exactly ten of eleven competing multi-rule reservations across two pools", async () => {
    const prefix = `multi-race:${randomUUID()}`;
    const stores = [createAuthRateLimiter(() => database, secret), createAuthRateLimiter(() => secondDatabase, secret)];
    const results = await Promise.all(Array.from({ length: 11 }, (_, index) => {
      const rules = [
        { key: `${prefix}:user`, max: 10, window: 3600 },
        { key: `${prefix}:workspace`, max: 10, window: 3600 },
        { key: `${prefix}:request:${index}`, max: 1, window: 3600 },
      ];
      return stores[index % 2].consumeAll(index % 2 ? rules.reverse() : rules);
    }));
    expect(results.filter(result => result.allowed)).toHaveLength(10);
    expect(results.filter(result => !result.allowed)).toHaveLength(1);
    expect(results.find(result => !result.allowed)?.retryAfter).toBeGreaterThan(0);
    expect(await database.rateLimit.findUnique({ where: { key: `${prefix}:user` } })).toBeNull();
    expect(JSON.stringify(results)).not.toContain(prefix);
  });

  it("accepts one duplicate request and rolls back all other concurrent reservations", async () => {
    const prefix = `multi-duplicate:${randomUUID()}`;
    const hash = (key: string) => createHmac("sha256", secret).update("moa-rate-limit-v1\0").update(key).digest("hex");
    const rules = [{ key: `${prefix}:a-shared`, max: 10, window: 3600 }, { key: `${prefix}:z-request`, max: 1, window: 3600 }];
    const stores = [createAuthRateLimiter(() => database, secret), createAuthRateLimiter(() => secondDatabase, secret)];
    const results = await Promise.all(Array.from({ length: 8 }, (_, index) => stores[index % 2].consumeAll(rules)));
    expect(results.filter(result => result.allowed)).toHaveLength(1);
    expect(await database.rateLimit.findUnique({ where: { key: hash(rules[0].key) } })).toMatchObject({ count: 1 });
  });

  it("rolls back earlier inserts and leaves denied count and lastRequest unchanged", async () => {
    const prefix = `multi-rollback:${randomUUID()}`;
    const hash = (key: string) => createHmac("sha256", secret).update("moa-rate-limit-v1\0").update(key).digest("hex");
    const store = createAuthRateLimiter(() => database, secret);
    const fullKey = `${prefix}:z-full`;
    await store.consume(fullKey, { max: 1, window: 3600 });
    const before = await database.rateLimit.findUniqueOrThrow({ where: { key: hash(fullKey) } });
    expect(await store.consumeAll([
      { key: `${prefix}:a-new`, max: 10, window: 3600 }, { key: fullKey, max: 1, window: 3600 },
    ])).toMatchObject({ allowed: false });
    expect(await database.rateLimit.findUnique({ where: { key: hash(`${prefix}:a-new`) } })).toBeNull();
    expect(await database.rateLimit.findUniqueOrThrow({ where: { key: hash(fullKey) } })).toEqual(before);
  });

  it("resets an expired multi-rule counter using the unchanged HMAC key", async () => {
    const key = `multi-expired:${randomUUID()}`;
    const hashed = createHmac("sha256", secret).update("moa-rate-limit-v1\0").update(key).digest("hex");
    await database.rateLimit.create({ data: { id: randomUUID(), key: hashed, count: 10, lastRequest: BigInt(Date.now() - 3_601_000) } });
    expect(await createAuthRateLimiter(() => database, secret).consumeAll([{ key, max: 10, window: 3600 }])).toMatchObject({ allowed: true });
    expect(await database.rateLimit.findUnique({ where: { key: hashed } })).toMatchObject({ count: 1 });
  });

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

    expect(owner).toEqual({ userId: userA, workspaceId: expect.any(String), sessionUserId: userA });
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

  it("usage reservations settle once and are isolated by workspace RLS", async () => {
    const owner = await getAuthenticatedWorkspace(sessionHeaders(tokenA));
    const other = await getAuthenticatedWorkspace(sessionHeaders(tokenB));
    const requestId = `usage-${randomUUID()}`;
    vi.stubEnv("AI_USAGE_LEDGER_ENABLED", "true");
    try {
      await startUsage(owner, requestId, "openai", "chat");
      await expect(startUsage(owner, requestId, "openai", "chat")).rejects.toThrow();
      expect(await database.aiUsageEvent.findMany()).toEqual([]);
      await database.$transaction(async tx => {
        await tx.$executeRaw`SELECT set_config('moa.user_id', ${other.sessionUserId}, true)`;
        expect(await tx.aiUsageEvent.findMany()).toEqual([]);
      });
      await expect(database.$transaction(async tx => {
        await tx.$executeRaw`SELECT set_config('moa.user_id', ${other.sessionUserId}, true)`;
        return tx.aiUsageEvent.create({ data: { id: randomUUID(), workspaceId: owner.workspaceId, requestId: randomUUID(), provider: "openai", operation: "chat", status: "reserved" } });
      })).rejects.toThrow();
      await finishUsage(owner, requestId, "fixture-model", { inputTokens: 7, outputTokens: 3, totalTokens: 10 });
      await finishUsage(owner, requestId, "overwritten", { inputTokens: 100, outputTokens: 1, totalTokens: 101 });
      await database.$transaction(async tx => {
        await tx.$executeRaw`SELECT set_config('moa.user_id', ${owner.sessionUserId}, true)`;
        expect(await tx.aiUsageEvent.findFirst({ where: { requestId } })).toMatchObject({ status: "completed", model: "fixture-model", totalTokens: 10 });
      });
    } finally { delete process.env.AI_USAGE_LEDGER_ENABLED; }
  });

  it("recovers only this workspace's old usage reservation and preserves fresh or foreign reservations", async () => {
    const owner = await getAuthenticatedWorkspace(sessionHeaders(tokenA));
    const other = await getAuthenticatedWorkspace(sessionHeaders(tokenB));
    const staleRequestId = `usage-stale-a-${randomUUID()}`;
    const freshRequestId = `usage-fresh-a-${randomUUID()}`;
    const foreignRequestId = `usage-stale-b-${randomUUID()}`;
    const staleAt = new Date(Date.now() - 600_001);

    vi.stubEnv("AI_USAGE_LEDGER_ENABLED", "true");
    try {
      await database.$transaction(async tx => {
        await tx.$executeRaw`SELECT set_config('moa.user_id', ${owner.sessionUserId}, true)`;
        await tx.aiUsageEvent.createMany({ data: [
          { id: randomUUID(), workspaceId: owner.workspaceId, requestId: staleRequestId, provider: "openai", operation: "chat", status: "reserved", createdAt: staleAt },
          { id: randomUUID(), workspaceId: owner.workspaceId, requestId: freshRequestId, provider: "openai", operation: "chat", status: "reserved" },
        ] });
      });
      await database.$transaction(async tx => {
        await tx.$executeRaw`SELECT set_config('moa.user_id', ${other.sessionUserId}, true)`;
        await tx.aiUsageEvent.create({ data: { id: randomUUID(), workspaceId: other.workspaceId, requestId: foreignRequestId, provider: "openai", operation: "chat", status: "reserved", createdAt: staleAt } });
      });

      const first = await readUsage(sessionHeaders(tokenA));
      expect(first?.entries).toEqual(expect.arrayContaining([
        expect.objectContaining({ requestId: staleRequestId, status: "unknown", inputTokens: null, outputTokens: null, totalTokens: null }),
        expect.objectContaining({ requestId: freshRequestId, status: "reserved" }),
      ]));
      const second = await readUsage(sessionHeaders(tokenA));
      expect(second?.entries.find(entry => entry.requestId === staleRequestId)).toMatchObject({ status: "unknown", inputTokens: null, outputTokens: null, totalTokens: null });
      await finishUsage(owner, staleRequestId, "late-model", { inputTokens: 9, outputTokens: 4, totalTokens: 13 });

      await database.$transaction(async tx => {
        await tx.$executeRaw`SELECT set_config('moa.user_id', ${owner.sessionUserId}, true)`;
        expect(await tx.aiUsageEvent.findFirst({ where: { workspaceId: owner.workspaceId, requestId: staleRequestId } })).toMatchObject({ status: "unknown", model: null, inputTokens: null, outputTokens: null, totalTokens: null });
        expect(await tx.aiUsageEvent.findFirst({ where: { workspaceId: owner.workspaceId, requestId: freshRequestId } })).toMatchObject({ status: "reserved" });
        await tx.$executeRaw`SELECT set_config('moa.user_id', ${other.sessionUserId}, true)`;
        expect(await tx.aiUsageEvent.findFirst({ where: { workspaceId: other.workspaceId, requestId: foreignRequestId } })).toMatchObject({ status: "reserved" });
      });
    } finally { delete process.env.AI_USAGE_LEDGER_ENABLED; }
  });

  it("deletes only the confirmed user and cascades that user's account, session, workspace, and usage rows", async () => {
    const prefix = `delete-cascade-${randomUUID()}`;
    const deletedUserId = `${prefix}-deleted`;
    const survivorUserId = `${prefix}-survivor`;
    const deletedSessionId = randomUUID();
    const deletedSessionToken = randomUUID();
    const survivorSessionToken = randomUUID();
    const deletedAccountId = randomUUID();
    const survivorAccountId = randomUUID();
    const { token, identifier } = deletionFixtureToken();

    await database.user.createMany({ data: [deletedUserId, survivorUserId].map(id => ({ id, name: id, email: `${id}@example.invalid`, emailVerified: true })) });
    await database.account.createMany({ data: [
      { id: deletedAccountId, userId: deletedUserId, accountId: deletedUserId, providerId: "google" },
      { id: survivorAccountId, userId: survivorUserId, accountId: survivorUserId, providerId: "naver" },
    ] });
    await database.session.createMany({ data: [
      { id: deletedSessionId, token: deletedSessionToken, userId: deletedUserId, expiresAt: new Date(Date.now() + 3_600_000) },
      { id: randomUUID(), token: survivorSessionToken, userId: survivorUserId, expiresAt: new Date(Date.now() + 3_600_000) },
    ] });
    const deletedOwner = await getAuthenticatedWorkspace(sessionHeaders(deletedSessionToken));
    const survivorOwner = await getAuthenticatedWorkspace(sessionHeaders(survivorSessionToken));
    vi.stubEnv("AI_USAGE_LEDGER_ENABLED", "true");
    try {
      await startUsage(deletedOwner, `delete-cascade-usage-${randomUUID()}`, "openai", "chat");
    } finally { delete process.env.AI_USAGE_LEDGER_ENABLED; }
    await addDeletionVerification(deletedUserId, deletedSessionId, token);

    expect(await finishAccountDeletion(deletionForm(token), deletionHeaders(deletedSessionToken))).toMatchObject({ status: "success" });
    expect(await database.user.findUnique({ where: { id: deletedUserId } })).toBeNull();
    expect(await database.account.findUnique({ where: { id: deletedAccountId } })).toBeNull();
    expect(await database.session.findUnique({ where: { token: deletedSessionToken } })).toBeNull();
    expect(await database.verification.findFirst({ where: { identifier } })).toBeNull();
    await database.$transaction(async tx => {
      await tx.$executeRaw`SELECT set_config('moa.user_id', ${deletedUserId}, true)`;
      expect(await tx.workspace.findUnique({ where: { id: deletedOwner.workspaceId } })).toBeNull();
      expect(await tx.aiUsageEvent.findFirst({ where: { workspaceId: deletedOwner.workspaceId } })).toBeNull();
      await tx.$executeRaw`SELECT set_config('moa.user_id', ${survivorUserId}, true)`;
      expect(await tx.workspace.findUnique({ where: { id: survivorOwner.workspaceId } })).toMatchObject({ ownerUserId: survivorUserId });
    });
    expect(await database.user.findUnique({ where: { id: survivorUserId } })).not.toBeNull();
    expect(await database.account.findUnique({ where: { id: survivorAccountId } })).not.toBeNull();
    expect(await database.session.findUnique({ where: { token: survivorSessionToken } })).not.toBeNull();
  });

  it("keeps deletion tokens when the session is stale, the token belongs to another user, or a connected primary identity exists", async () => {
    const staleUserId = `delete-stale-${randomUUID()}`;
    const staleSessionId = randomUUID();
    const staleSessionToken = randomUUID();
    const stale = deletionFixtureToken();
    await database.user.create({ data: { id: staleUserId, name: staleUserId, email: `${staleUserId}@example.invalid`, emailVerified: true } });
    await database.session.create({ data: { id: staleSessionId, token: staleSessionToken, userId: staleUserId, createdAt: new Date(Date.now() - 86_401_000), expiresAt: new Date(Date.now() + 3_600_000) } });
    await addDeletionVerification(staleUserId, staleSessionId, stale.token);
    expect((await finishAccountDeletion(deletionForm(stale.token), deletionHeaders(staleSessionToken))).status).toBe("error");
    expect(await database.verification.findFirst({ where: { identifier: stale.identifier } })).not.toBeNull();

    const foreignUserId = `delete-foreign-${randomUUID()}`;
    const ownerUserId = `delete-owner-${randomUUID()}`;
    const foreignSessionId = randomUUID();
    const foreignSessionToken = randomUUID();
    const ownerSessionId = randomUUID();
    const foreign = deletionFixtureToken();
    await database.user.createMany({ data: [foreignUserId, ownerUserId].map(id => ({ id, name: id, email: `${id}@example.invalid`, emailVerified: true })) });
    await database.session.createMany({ data: [
      { id: foreignSessionId, token: foreignSessionToken, userId: foreignUserId, expiresAt: new Date(Date.now() + 3_600_000) },
      { id: ownerSessionId, token: randomUUID(), userId: ownerUserId, expiresAt: new Date(Date.now() + 3_600_000) },
    ] });
    await addDeletionVerification(ownerUserId, ownerSessionId, foreign.token);
    expect((await finishAccountDeletion(deletionForm(foreign.token), deletionHeaders(foreignSessionToken))).status).toBe("error");
    expect(await database.verification.findFirst({ where: { identifier: foreign.identifier } })).not.toBeNull();

    const sourceUserId = `delete-connected-source-${randomUUID()}`;
    const peerUserId = `delete-connected-peer-${randomUUID()}`;
    const sourceSessionId = randomUUID();
    const sourceSessionToken = randomUUID();
    const peerSessionToken = randomUUID();
    const password = "fixture-delete-connection-password";
    const passwordHash = await hashPassword(password);
    await database.user.createMany({ data: [sourceUserId, peerUserId].map(id => ({ id, name: id, email: `${id}@example.invalid`, emailVerified: true })) });
    await database.account.createMany({ data: [
      { id: randomUUID(), userId: sourceUserId, accountId: sourceUserId, providerId: "google" },
      { id: randomUUID(), userId: peerUserId, accountId: peerUserId, providerId: "credential", password: passwordHash },
    ] });
    await database.session.createMany({ data: [
      { id: sourceSessionId, token: sourceSessionToken, userId: sourceUserId, expiresAt: new Date(Date.now() + 3_600_000) },
      { id: randomUUID(), token: peerSessionToken, userId: peerUserId, expiresAt: new Date(Date.now() + 3_600_000) },
    ] });
    await database.$transaction(async tx => {
      await tx.$executeRaw`SELECT set_config('moa.user_id', ${sourceUserId}, true)`;
      const [connected] = await tx.$queryRaw<{ connected: boolean }[]>`SELECT moa_auth.connect_login_accounts(${sourceSessionId}, ${peerSessionToken}, ${passwordHash}, true) AS connected`;
      expect(connected.connected).toBe(true);
    });
    const connectedSessionId = randomUUID();
    const connectedSessionToken = randomUUID();
    const connected = deletionFixtureToken();
    await database.session.create({ data: { id: connectedSessionId, token: connectedSessionToken, userId: sourceUserId, expiresAt: new Date(Date.now() + 3_600_000) } });
    await addDeletionVerification(sourceUserId, connectedSessionId, connected.token);
    expect((await finishAccountDeletion(deletionForm(connected.token), deletionHeaders(connectedSessionToken))).status).toBe("error");
    expect(await database.verification.findFirst({ where: { identifier: connected.identifier } })).not.toBeNull();
    expect(await database.user.findUnique({ where: { id: sourceUserId } })).not.toBeNull();
    expect(await database.loginConnection.findFirst({ where: { primaryOwnerUserId: sourceUserId } })).not.toBeNull();
  });

  it("serializes a deletion behind an uncommitted account connection and retains the connected primary identity", async () => {
    const sourceUserId = `delete-race-source-${randomUUID()}`;
    const peerUserId = `delete-race-peer-${randomUUID()}`;
    const sourceSessionId = randomUUID();
    const sourceSessionToken = randomUUID();
    const peerSessionToken = randomUUID();
    const password = "fixture-delete-race-password";
    const passwordHash = await hashPassword(password);
    const deletion = deletionFixtureToken();
    await database.user.createMany({ data: [sourceUserId, peerUserId].map(id => ({ id, name: id, email: `${id}@example.invalid`, emailVerified: true })) });
    await database.account.createMany({ data: [
      { id: randomUUID(), userId: sourceUserId, accountId: sourceUserId, providerId: "google" },
      { id: randomUUID(), userId: peerUserId, accountId: peerUserId, providerId: "credential", password: passwordHash },
    ] });
    await database.session.createMany({ data: [
      { id: sourceSessionId, token: sourceSessionToken, userId: sourceUserId, expiresAt: new Date(Date.now() + 3_600_000) },
      { id: randomUUID(), token: peerSessionToken, userId: peerUserId, expiresAt: new Date(Date.now() + 3_600_000) },
    ] });
    await addDeletionVerification(sourceUserId, sourceSessionId, deletion.token);

    let release!: () => void;
    let linked!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const connectionLinked = new Promise<void>(resolve => { linked = resolve; });
    const connecting = secondDatabase.$transaction(async tx => {
      await tx.$executeRaw`SELECT set_config('moa.user_id', ${sourceUserId}, true)`;
      const [connected] = await tx.$queryRaw<{ connected: boolean }[]>`SELECT moa_auth.connect_login_accounts(${sourceSessionId}, ${peerSessionToken}, ${passwordHash}, true) AS connected`;
      expect(connected.connected).toBe(true);
      await tx.session.create({ data: { id: sourceSessionId, token: sourceSessionToken, userId: sourceUserId, expiresAt: new Date(Date.now() + 3_600_000) } });
      linked();
      await gate;
    });
    await connectionLinked;
    const finishing = finishAccountDeletion(deletionForm(deletion.token), deletionHeaders(sourceSessionToken));
    const finishedWhileLocked = await Promise.race([
      finishing.then(() => true),
      new Promise<boolean>(resolve => setTimeout(() => resolve(false), 50)),
    ]);
    expect(finishedWhileLocked).toBe(false);
    release();
    await connecting;
    expect((await finishing).status).toBe("error");
    expect(await database.user.findUnique({ where: { id: sourceUserId } })).not.toBeNull();
    expect(await database.session.findUnique({ where: { token: sourceSessionToken } })).not.toBeNull();
    expect(await database.verification.findFirst({ where: { identifier: deletion.identifier } })).not.toBeNull();
    expect(await database.loginConnectionMember.findUnique({ where: { userId: sourceUserId } })).not.toBeNull();
    expect(await database.loginConnection.findFirst({ where: { primaryOwnerUserId: sourceUserId } })).not.toBeNull();
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
