import { createHmac, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";

vi.mock("server-only", () => ({}));
vi.mock("../../src/server/database/client", () => ({ getDatabase: vi.fn() }));
vi.mock("next/server", () => ({ after: () => { } }));

import { getDatabase } from "../../src/server/database/client";
import { getAuth } from "../../src/server/auth/auth";
import { getAuthenticatedWorkspace } from "../../src/server/auth/workspace";
import {
  connectExistingAccount,
  readWorkspaceConnection,
  selectConnectedWorkspace,
  disconnectAccountConnection
} from "../../src/server/auth/auth-account-connection";

const base = "http://127.0.0.1:3034";
const password = "fixture-connection-password";
let database: PrismaClient;
let address = 100;

async function session(userId: string) {
  const token = randomUUID();
  const row = await database.session.create({ data: { id: randomUUID(), token, userId, expiresAt: new Date(Date.now() + 3_600_000) } });
  const signature = createHmac("sha256", process.env.BETTER_AUTH_SECRET!).update(token).digest("base64");

  return {
    row,
    headers: new Headers({
      origin: base,
      cookie: `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`,
      "x-vercel-forwarded-for": `192.0.2.${address++}`
    })
  };
}

async function fixture() {
  const prefix = `connect-${randomUUID()}`;
  const source = prefix + "-social", target = prefix + "-native", outsider = prefix + "-other";

  await database.user.createMany({
    data: [source, target, outsider].map(id => ({ id, name: id, email: id + "@example.invalid", emailVerified: id !== source }))
  });
  await database.account.createMany({
    data: [
      { id: source, userId: source, accountId: source, providerId: "google" },
      {
        id: target,
        userId: target,
        accountId: target,
        providerId: "credential",
        password: await hashPassword(password)
      },
    ]
  });

  const current = await session(source), existing = await session(target), other = await session(outsider);
  const sourceWorkspace = await getAuthenticatedWorkspace(current.headers), targetWorkspace = await getAuthenticatedWorkspace(existing.headers);

  return { source, target, outsider, current, existing, other, sourceWorkspace, targetWorkspace };
}

function form(email: string, primary = "existing", secret = password) {
  const data = new FormData();

  for (const [key, value] of Object.entries({ email, password: secret, primary, confirm: "on" })) data.set(key, value);

  return data;
}

async function connect(f: Awaited<ReturnType<typeof fixture>>, primary = "existing") {
  return connectExistingAccount(form(f.target + "@example.invalid", primary), f.current.headers);
}

async function visible(userId: string) {
  return database.$transaction(async tx => {
    await tx.$executeRaw`SELECT set_config('moa.user_id', ${userId}, true)`;

    return tx.workspace.findMany({ select: { id: true, ownerUserId: true } });
  });
}

async function auth(path: string, body: unknown) {
  return getAuth().handler(new Request(
    base + "/api/auth" + path,
    {
      method: "POST",
      headers: {
        origin: base,
        "content-type": "application/json",
        "x-vercel-forwarded-for": `192.0.2.${address++}`
      },
      body: JSON.stringify(body)
    }
  ));
}

beforeAll(() => {
  const url = new URL(process.env.MOA_TEST_DATABASE_URL ?? "");

  expect(url.hostname).toBe("127.0.0.1");
  expect(url.username).toBe("moa_runtime");
  expect(url.pathname).toBe("/moa_auth_test");
  expect(process.env.MOA_TEST_DATABASE_RUN).toMatch(/^[a-f0-9-]{36}$/);
  database = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url.href, ssl: false, max: 6 }),
    log: [],
    errorFormat: "minimal"
  });
  vi.mocked(getDatabase).mockReturnValue(database);

  for (const [key, value] of Object.entries({
    BETTER_AUTH_URL: base,
    BETTER_AUTH_SECRET: "fixture-connect-" + randomUUID(),
    RESEND_API_KEY: "fixture-resend",
    EMAIL_FROM: "Moa <sender@example.invalid>"
  })) vi.stubEnv(key, value);
});
afterAll(async () => {
  await database?.$disconnect();
  vi.unstubAllEnvs();
});

describe("explicit two-account connection with real SDK, SQL and RLS", () => {
  it.each(["current", "existing"])("preserves both accounts and workspace ownership with %s as default", async primary => {
    const f = await fixture();
    const original = await database.account.findMany({ where: { userId: { in: [f.source, f.target] } }, orderBy: { id: "asc" } });

    expect(await connect(f, primary)).toMatchObject({ status: "success" });
    expect(await database.account.findMany({ where: { userId: { in: [f.source, f.target] } }, orderBy: { id: "asc" } })).toEqual(original);
    expect(await database.user.count({ where: { id: { in: [f.source, f.target] } } })).toBe(2);
    expect(await database.session.count({ where: { userId: { in: [f.source, f.target] } } })).toBe(0);
    await expect(getAuthenticatedWorkspace(f.current.headers)).rejects.toThrow("Authentication required");

    const again = await session(f.source), native = await session(f.target);
    const expected = primary === "current" ? f.sourceWorkspace : f.targetWorkspace;

    expect(await getAuthenticatedWorkspace(again.headers)).toEqual({ ...expected, sessionUserId: f.source });
    expect(await getAuthenticatedWorkspace(native.headers)).toEqual({ ...expected, sessionUserId: f.target });
    expect((await readWorkspaceConnection(again.headers))?.members).toHaveLength(2);
    expect(JSON.stringify(await readWorkspaceConnection(again.headers))).not.toMatch(/password|token|connectionId/);
  });
  it("uses the same error for wrong password, unknown email, unverified and social-only targets", async () => {
    const f = await fixture();
    const wrong = await connectExistingAccount(
      form(f.target + "@example.invalid", "existing", "wrong-password"),
      f.current.headers
    );
    const unknown = await connectExistingAccount(form("absent-connection@example.invalid"), f.current.headers);

    await database.user.update({ where: { id: f.target }, data: { emailVerified: false } });

    const unverified = await connect(f);

    expect(wrong.status).toBe("error");
    expect(unknown).toEqual(wrong);
    expect(unverified).toEqual(wrong);
    expect(await database.loginConnectionMember.count({ where: { userId: { in: [f.source, f.target] } } })).toBe(0);
  });
  it("rejects a credential-bearing source and leaves both session sets unchanged", async () => {
    const f = await fixture();

    await database.account.create({
      data: {
        id: randomUUID(),
        providerId: "credential",
        accountId: f.source,
        userId: f.source,
        password: await hashPassword(password)
      }
    });
    expect((await connect(f)).status).toBe("error");
    expect(await database.session.count({ where: { userId: { in: [f.source, f.target] } } })).toBe(2);
  });
  it("serializes duplicate concurrent requests and consumes no extra identity or proof session", async () => {
    const f = await fixture();
    const results = await Promise.all([connect(f), connect(f)]);

    expect(results.filter(result => result.status === "success")).toHaveLength(1);
    expect(await database.loginConnectionMember.count({ where: { userId: { in: [f.source, f.target] } } })).toBe(2);
    expect(await database.session.count({ where: { userId: { in: [f.source, f.target] } } })).toBe(0);
  });
  it("rolls back the connection and removes the proof session when persistence fails", async () => {
    const f = await fixture();
    const failing = database.$extends({
      query: {
        $queryRaw: async ({ args, query }) => {
          const result = await query(args);

          if (JSON.stringify(args, (_key, value) => typeof value === "bigint" ? String(value) : value).includes("connect_login_accounts")) throw new Error("fixture-storage-failure");

          return result;
        }
      }
    });

    vi.mocked(getDatabase).mockReturnValue(failing as unknown as PrismaClient);

    try {
      await expect(connect(f)).rejects.toThrow("fixture-storage-failure");
    }
    finally {
      vi.mocked(getDatabase).mockReturnValue(database);
    }

    expect(await database.loginConnectionMember.count({ where: { userId: { in: [f.source, f.target] } } })).toBe(0);
    expect(await database.session.count({ where: { userId: { in: [f.source, f.target] } } })).toBe(2);
    expect((await visible(f.source)).map(row => row.id)).toEqual([f.sourceWorkspace.workspaceId]);
    expect((await visible(f.target)).map(row => row.id)).toEqual([f.targetWorkspace.workspaceId]);
  });
  it("grants only connected read access; third-party access and owner updates stay denied", async () => {
    const f = await fixture();

    await connect(f);
    expect((await visible(f.source)).map(row => row.id).sort()).toEqual([f.sourceWorkspace.workspaceId, f.targetWorkspace.workspaceId].sort());
    expect((await visible(f.target)).map(row => row.id).sort()).toEqual([f.sourceWorkspace.workspaceId, f.targetWorkspace.workspaceId].sort());
    expect(await visible(f.outsider)).toEqual([]);

    const membership = await database.loginConnectionMember.findUniqueOrThrow({ where: { userId: f.source } });

    await expect(database.loginConnection.create({ data: { primaryOwnerUserId: f.outsider } })).rejects.toThrow();
    await expect(database.loginConnection.update({ where: { id: membership.connectionId }, data: { primaryOwnerUserId: f.outsider } })).rejects.toThrow();
    await expect(database.loginConnectionMember.create({ data: { userId: f.outsider, connectionId: membership.connectionId, slot: 3 } })).rejects.toThrow();
    await expect(database.loginConnectionMember.create({ data: { userId: f.outsider, connectionId: membership.connectionId, slot: 1 } })).rejects.toThrow();
    await database.$transaction(async tx => {
      await tx.$executeRaw`SELECT set_config('moa.user_id', ${f.source}, true)`;
      expect((await tx.workspace.updateMany({ where: { id: f.targetWorkspace.workspaceId }, data: { updatedAt: new Date() } })).count).toBe(0);
      expect((await tx.workspace.deleteMany({ where: { id: f.targetWorkspace.workspaceId } })).count).toBe(0);
    });
    await expect(database.$transaction(async tx => {
      await tx.$executeRaw`SELECT set_config('moa.user_id', ${f.outsider}, true)`;
      await tx.workspace.create({ data: { ownerUserId: f.source } });
    })).rejects.toThrow();
  });
  it("direct protected mutation functions require an actual fresh caller session and password proof", async () => {
    const f = await fixture();
    const [withoutContext] = await database.$queryRaw<{ connected: boolean }[]>`SELECT moa_auth.connect_login_accounts(${f.current.row.id}, ${f.existing.row.token}, ${"forged-hash"}, true) AS connected`;

    expect(withoutContext.connected).toBe(false);
    await database.$transaction(async tx => {
      await tx.$executeRaw`SELECT set_config('moa.user_id', ${f.source}, true)`;

      const [forged] = await tx.$queryRaw<{ connected: boolean }[]>`SELECT moa_auth.connect_login_accounts(${f.current.row.id}, ${"forged-token"}, ${"forged-hash"}, true) AS connected`;

      expect(forged.connected).toBe(false);

      const [wrongPassword] = await tx.$queryRaw<{ connected: boolean }[]>`SELECT moa_auth.connect_login_accounts(${f.current.row.id}, ${f.existing.row.token}, ${"forged-hash"}, true) AS connected`;

      expect(wrongPassword.connected).toBe(false);
    });
  });
  it("rejects a forged workspace selection and switches only to a preserved member workspace", async () => {
    const f = await fixture();

    await connect(f);

    const again = await session(f.source), peer = await session(f.target);
    const select = new FormData();

    select.set("ownerUserId", f.outsider);
    expect((await selectConnectedWorkspace(select, again.headers)).status).toBe("error");
    select.set("ownerUserId", f.source);
    expect((await selectConnectedWorkspace(select, again.headers)).status).toBe("success");
    expect(await database.session.count({ where: { userId: { in: [f.source, f.target] } } })).toBe(0);
    await expect(getAuthenticatedWorkspace(peer.headers)).rejects.toThrow();
    expect((await getAuthenticatedWorkspace((await session(f.target)).headers)).workspaceId).toBe(f.sourceWorkspace.workspaceId);
  });
  it("a native password reset atomically revokes both linked identities, preserving credentials and workspaces", async () => {
    const f = await fixture();

    await connect(f);
    await session(f.source);
    await session(f.target);

    let token = "";
    const observer = vi.spyOn(getAuth().options.emailAndPassword!, "sendResetPassword").mockImplementation(async args => {
      token = args.token;
    });

    try {
      expect((await auth("/request-password-reset", { email: f.target + "@example.invalid" })).ok).toBe(true);
      expect(token).not.toBe("");
      expect((await auth("/reset-password", { token, newPassword: "fixture-new-connection-password" })).ok).toBe(true);
      expect(await database.session.count({ where: { userId: { in: [f.source, f.target] } } })).toBe(0);
      expect(await database.account.count({ where: { userId: f.source, providerId: "credential" } })).toBe(0);
      expect((await auth(
        "/sign-in/email",
        { email: f.target + "@example.invalid", password: "fixture-new-connection-password" }
      )).ok).toBe(true);
      expect((await visible(f.target))).toHaveLength(2);
    } finally {
      observer.mockRestore();
    }
  });
  it("serializes a real SDK reset against an uncommitted link without an account/session deadlock", async () => {
    const f = await fixture();
    let token = "", release!: () => void, reached!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const entered = new Promise<void>(resolve => {
      reached = resolve;
    });
    const observer = vi.spyOn(getAuth().options.emailAndPassword!, "sendResetPassword").mockImplementation(async args => {
      token = args.token;
    });

    await auth("/request-password-reset", { email: f.target + "@example.invalid" });

    const paused = database.$extends({
      query: {
        $queryRaw: async ({ args, query }) => {
          const result = await query(args);

          if (JSON.stringify(args, (_key, value) => typeof value === "bigint" ? String(value) : value).includes("connect_login_accounts")) {
            reached();
            await gate;
          }

          return result;
        }
      }
    });

    vi.mocked(getDatabase).mockReturnValue(paused as unknown as PrismaClient);

    try {
      const connecting = connect(f);

      await entered;

      const resetting = auth("/reset-password", { token, newPassword: "fixture-concurrent-reset-password" });

      await new Promise(resolve => setTimeout(resolve, 50));
      release();

      const [linked, reset] = await Promise.all([connecting, resetting]);

      expect(linked.status).toBe("success");
      expect(reset.ok).toBe(true);
      expect(await database.session.count({ where: { userId: { in: [f.source, f.target] } } })).toBe(0);
      expect(await database.loginConnectionMember.count({ where: { userId: { in: [f.source, f.target] } } })).toBe(2);
    } finally {
      release();
      observer.mockRestore();
      vi.mocked(getDatabase).mockReturnValue(database);
    }
  });
  it("lets either owner revoke the connection while preserving both identities and original workspaces", async () => {
    const f = await fixture();

    await connect(f);

    const native = await session(f.target);

    await session(f.source);

    const data = new FormData();

    data.set("confirm", "on");
    expect((await disconnectAccountConnection(data, f.other.headers)).status).toBe("error");
    expect((await disconnectAccountConnection(data, native.headers)).status).toBe("success");
    expect(await database.loginConnectionMember.count({ where: { userId: { in: [f.source, f.target] } } })).toBe(0);
    expect(await database.session.count({ where: { userId: { in: [f.source, f.target] } } })).toBe(0);
    expect(await database.account.count({ where: { userId: { in: [f.source, f.target] } } })).toBe(2);
    expect(await getAuthenticatedWorkspace((await session(f.source)).headers)).toEqual(f.sourceWorkspace);
    expect(await getAuthenticatedWorkspace((await session(f.target)).headers)).toEqual(f.targetWorkspace);
    expect((await visible(f.target)).map(row => row.id)).toEqual([f.targetWorkspace.workspaceId]);
  });
});
