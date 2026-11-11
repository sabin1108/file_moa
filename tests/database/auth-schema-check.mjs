import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const prisma = join(root, "apps/web/prisma");
const migrations = join(prisma, "migrations");
const roleFile = join(prisma, "setup-runtime-role.sql");
const image = "postgres:17-alpine@sha256:266d3c257594e195b309ae9d1805e54c788f1d7b375f56bf6c367aac6c917e7b";
const webRequire = createRequire(join(root, "apps/web/package.json"));
const prismaCli = join(dirname(webRequire.resolve("prisma/package.json")), "build/index.js");
const vitestCli = join(dirname(webRequire.resolve("vitest/package.json")), "vitest.mjs");

assert.ok(existsSync(roleFile), "Runtime role SQL must exist before database checks");
assert.ok(existsSync(migrations), "Migration files must exist before database checks");

const runId = randomUUID();
let containerId;
let passed = 0;
let tlsDirectory;
const withBrowser = process.argv.includes("--ui");
const withChatFixture = process.argv.includes("--chat-ledger-fixture");
const withChatLedger = process.argv.includes("--chat-ledger-live") || withChatFixture;

assert.ok(
  !(withChatFixture && process.argv.includes("--chat-ledger-live")),
  "Choose fixture or live verification, never both."
);

const fixtureCache = join(root, "apps/web/node_modules/.cache");

function prismaCommand(args, url) {
  const target = new URL(url);

  assert.equal(target.hostname, "127.0.0.1");
  assert.equal(target.username, "fixture_migrator");
  assert.equal(target.pathname, "/moa_auth_test");
  assert.equal(target.searchParams.get("schema"), "moa_app");

  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    cwd: join(root, "apps/web"),
    env: { ...process.env, MIGRATION_DATABASE_URL: url },
    encoding: "utf8",
    windowsHide: true,
    timeout: 60_000,
  });

  if (result.error) throw result.error;

  assert.equal(
    result.status,
    0,
    (result.stderr ?? "") + (result.stdout ?? "") || "Prisma command failed on the disposable database"
  );
}

function docker(args, input) {
  const result = spawnSync("docker", args, {
    cwd: root,
    encoding: "utf8",
    input,
    windowsHide: true,
    timeout: 60_000,
  });

  if (result.error) throw result.error;

  return result;
}

function requireSuccess(result) {
  assert.equal(result.status, 0, result.stderr || "Docker command failed");

  return result.stdout.trim();
}

function readEnvValue(file, name) {
  const expression = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.*?)\\s*$`, "u");

  for (const line of readFileSync(file, "utf8").split(/\r?\n/u)) {
    const value = line.match(expression)?.[1];

    if (value === undefined) continue;

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);

    return value.replace(/\s+#.*$/u, "");
  }

  return undefined;
}

function chatLedgerEnvironment(runtimeUrl, provider, openAiKey) {
  const child = { ...process.env };

  for (const name of ["DATABASE_URL", "MIGRATION_DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "OPENAI_API_KEY", "GEMINI_API_KEY", "GOOGLE_CLIENT_SECRET", "NAVER_CLIENT_SECRET", "KAKAO_CLIENT_SECRET", "RESEND_API_KEY", "EMAIL_FROM"]) delete child[name];

  return {
    ...child,
    MOA_TEST_DATABASE_URL: runtimeUrl,
    MOA_TEST_DATABASE_RUN: runId,
    MOA_RUN_CHAT_LEDGER_LIVE: "1",
    AI_PROVIDER: provider,
    OPENAI_API_KEY: openAiKey
  };
}

function sqlArgs() {
  assert.match(containerId, /^[a-f0-9]{64}$/);

  return ["exec", "-i", containerId, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=sqlstate", "-U", "postgres", "-d", "moa_auth_test"];
}

function sql(statement) {
  return requireSuccess(docker(sqlArgs(), statement));
}

function denied(statement, sqlState) {
  const result = docker(sqlArgs(), statement);

  assert.notEqual(result.status, 0, "The invalid request unexpectedly succeeded");
  assert.match(result.stderr, new RegExp(`ERROR:\\s+${sqlState}\\b`));
}

function asUser(userId, statement) {
  assert.match(userId, /^fixture-[a-z-]+$/);

  return `BEGIN; SET LOCAL ROLE moa_runtime; SET LOCAL moa.user_id = '${userId}'; ${statement}; COMMIT;`;
}

async function test(name, check) {
  await check();
  passed++;
  console.log(`PASS ${name}`);
}

function sqlAsync(statement) {
  return new Promise((accept, reject) => {
    const child = spawn("docker", sqlArgs(), { cwd: root, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 30_000);

    child.stdout.on("data", chunk => {
      stdout += chunk;
    });
    child.stderr.on("data", chunk => {
      stderr += chunk;
    });
    child.on("error", error => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", status => {
      clearTimeout(timer);
      accept({ status, stdout, stderr });
    });
    child.stdin.end(statement);
  });
}

try {
  await test("migration URL configuration fails safely before database access", () => {
    for (const url of ["fixture-secret-not-a-url", "postgresql://fixture:fixture-secret@127.0.0.1:1/moa_auth_test?schema=public"]) {
      const result = spawnSync(process.execPath, [prismaCli, "validate"], {
        cwd: join(root, "apps/web"),
        env: { ...process.env, MIGRATION_DATABASE_URL: url },
        encoding: "utf8",
        windowsHide: true,
        timeout: 30_000,
      });

      if (result.error) throw result.error;

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /MIGRATION_DATABASE_URL must/);
      assert.ok(
        !result.stderr.includes("fixture-secret"),
        "Configuration errors must not echo credentials"
      );
    }
  });

  const databasePassword = randomUUID();
  const migrationPassword = randomUUID();

  containerId = requireSuccess(docker([
    "run", "--detach", "--name", `moa-auth-check-${runId}`,
    "--label", `moa.auth-check=${runId}`,
    "--tmpfs", "/var/lib/postgresql/data:rw,size=256m",
    "--publish", "127.0.0.1::5432",
    "--env", "POSTGRES_DB=moa_auth_test",
    "--env", `POSTGRES_PASSWORD=${databasePassword}`,
    image,
  ]));

  assert.match(containerId, /^[a-f0-9]{64}$/);

  let ready = false;

  for (let attempt = 0; attempt < 40; attempt++) {
    // Docker's init server uses only a Unix socket; wait for the final TCP listener.
    if (docker(["exec", containerId, "pg_isready", "-h", "127.0.0.1", "-U", "postgres", "-d", "moa_auth_test"]).status === 0) {
      ready = true;

      break;
    }

    await new Promise(accept => setTimeout(accept, 500));
  }

  assert.ok(ready, "The disposable PostgreSQL instance did not become ready");
  sql(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN; CREATE ROLE authenticator NOLOGIN;
    CREATE ROLE fixture_migrator LOGIN CREATEROLE PASSWORD '${migrationPassword}';
    GRANT CREATE ON DATABASE moa_auth_test TO fixture_migrator;
    ALTER DEFAULT PRIVILEGES FOR ROLE fixture_migrator GRANT SELECT ON TABLES TO PUBLIC, anon, authenticated, service_role, authenticator;`);

  const setupSql = `SET ROLE fixture_migrator; ${readFileSync(roleFile, "utf8")}`;

  sql(setupSql);

  const ports = JSON.parse(requireSuccess(docker(["inspect", "--format", "{{json .NetworkSettings.Ports}}", containerId])));
  const endpoints = ports["5432/tcp"];

  assert.equal(endpoints.length, 1);
  assert.equal(endpoints[0].HostIp, "127.0.0.1");
  assert.match(endpoints[0].HostPort, /^\d+$/);

  const localUrl = `postgresql://fixture_migrator:${migrationPassword}@127.0.0.1:${endpoints[0].HostPort}/moa_auth_test?schema=moa_app`;

  await test("Prisma deploy applies and records the migration exactly once", () => {
    prismaCommand(["migrate", "deploy"], localUrl);
    prismaCommand(["migrate", "deploy"], localUrl);
    assert.equal(
      sql('SELECT count(*) FROM moa_app._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL'),
      "4"
    );
  });

  await test("the migrated database has no model drift", () => {
    prismaCommand(
      ["migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code"],
      localUrl
    );
  });

  sql(`
    INSERT INTO moa_auth."user" (id, name, email, "updatedAt") VALUES
      ('fixture-a', 'Fixture A', 'a@example.invalid', now()),
      ('fixture-b', 'Fixture B', 'b@example.invalid', now()),
      ('fixture-c', 'Fixture C', 'c@example.invalid', now()),
      ('fixture-race', 'Fixture race', 'race@example.invalid', now());
    INSERT INTO moa_app.workspace (id, "ownerUserId", "updatedAt") VALUES
      ('workspace-a', 'fixture-a', now()), ('workspace-b', 'fixture-b', now());
    INSERT INTO moa_auth.account (id, "accountId", "providerId", "userId", "updatedAt") VALUES
      ('account-a', 'external-a', 'google', 'fixture-a', now());
    INSERT INTO moa_auth.session (id, "userId", token, "expiresAt", "updatedAt") VALUES
      ('session-a', 'fixture-a', 'fixture-token-a', now() + interval '1 hour', now());
  `);

  await test("runtime role is a non-owner without elevated privileges", () => {
    assert.equal(
      sql("SELECT (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication OR rolinherit)::int FROM pg_roles WHERE rolname='moa_runtime'"),
      "0"
    );
    assert.equal(
      sql("SELECT (c.relowner=r.oid)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN pg_roles r WHERE n.nspname='moa_app' AND c.relname='workspace' AND r.rolname='moa_runtime'"),
      "0"
    );
    assert.equal(
      sql("SELECT (relrowsecurity AND relforcerowsecurity)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='moa_app' AND c.relname='workspace'"),
      "1"
    );
  });

  await test("runtime setup is repeatable and rejects elevated existing roles", () => {
    sql(setupSql);
    sql("ALTER ROLE moa_runtime BYPASSRLS");

    try {
      denied(setupSql, "P0001");
    } finally {
      sql("ALTER ROLE moa_runtime NOBYPASSRLS");
    }
  });

  await test("a non-superuser migrator is the sole permitted runtime administrator", () => {
    assert.equal(sql("SELECT rolsuper::int FROM pg_roles WHERE rolname='fixture_migrator'"), "0");
    assert.equal(
      sql("SELECT count(*) FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid JOIN pg_roles a ON a.oid=m.member WHERE r.rolname='moa_runtime' AND a.rolname='fixture_migrator' AND m.admin_option"),
      "1"
    );
  });

  await test("unexpected reverse role membership is rejected by setup and migration", () => {
    sql("CREATE ROLE fixture_intruder LOGIN NOINHERIT; GRANT moa_runtime TO fixture_intruder");

    try {
      denied(setupSql, "P0001");

      const migration = readFileSync(join(migrations, "20261105000000_auth_workspace/migration.sql"), "utf8");

      denied(`SET ROLE fixture_migrator; ${migration}`, "P0001");
    } finally {
      sql("REVOKE moa_runtime FROM fixture_intruder; DROP ROLE fixture_intruder");
    }
  });

  await test("outgoing runtime membership is rejected by setup and migration", () => {
    sql("CREATE ROLE fixture_privilege NOLOGIN; GRANT fixture_privilege TO moa_runtime");

    try {
      denied(setupSql, "P0001");

      const migration = readFileSync(join(migrations, "20261105000000_auth_workspace/migration.sql"), "utf8");

      denied(`SET ROLE fixture_migrator; ${migration}`, "P0001");
    } finally {
      sql("REVOKE fixture_privilege FROM moa_runtime; DROP ROLE fixture_privilege");
    }
  });

  await test("runtime object ownership is rejected by setup and migration", () => {
    sql("CREATE SCHEMA fixture_runtime_owned AUTHORIZATION moa_runtime");

    try {
      denied(setupSql, "P0001");

      const migration = readFileSync(join(migrations, "20261105000000_auth_workspace/migration.sql"), "utf8");

      denied(`SET ROLE fixture_migrator; ${migration}`, "P0001");
    } finally {
      sql("DROP SCHEMA fixture_runtime_owned");
    }
  });

  await test("pre-authentication lookups do not require a user context", () => {
    assert.equal(sql('SET ROLE moa_runtime; SELECT count(*) FROM moa_auth."user"'), "4");
    assert.equal(
      sql("SET ROLE moa_runtime; SELECT count(*) FROM moa_auth.session WHERE token='fixture-token-a'"),
      "1"
    );
  });

  await test("runtime has no migration bookkeeping access", () => {
    denied("SET ROLE moa_runtime; SELECT * FROM moa_app._prisma_migrations", "42501");
  });

  await test("workspace reads fail closed without user context", () => {
    assert.equal(sql("SET ROLE moa_runtime; SELECT count(*) FROM moa_app.workspace"), "0");
  });

  await test("workspace writes fail closed without user context", () => {
    denied(
      "SET ROLE moa_runtime; INSERT INTO moa_app.workspace(id,\"ownerUserId\",\"updatedAt\") VALUES('missing-context','fixture-c',now())",
      "42501"
    );
  });

  await test("A sees A and cannot read B", () => {
    assert.equal(
      sql(asUser("fixture-a", 'SELECT string_agg(id,\',\') FROM moa_app.workspace')),
      "workspace-a"
    );
    assert.equal(
      sql(asUser("fixture-a", "SELECT count(*) FROM moa_app.workspace WHERE id='workspace-b'")),
      "0"
    );
  });

  await test("A cannot create, reassign, update or delete B's workspace", () => {
    denied(
      asUser(
        "fixture-a",
        `INSERT INTO moa_app.workspace(id,"ownerUserId","updatedAt") VALUES('forged','fixture-c',now())`
      ),
      "42501"
    );
    denied(
      asUser("fixture-a", `UPDATE moa_app.workspace SET "ownerUserId"='fixture-c' WHERE id='workspace-a'`),
      "42501"
    );
    assert.equal(
      sql(asUser(
        "fixture-a",
        "WITH changed AS (UPDATE moa_app.workspace SET \"updatedAt\"=now() WHERE id='workspace-b' RETURNING id) SELECT count(*) FROM changed"
      )),
      "0"
    );
    assert.equal(
      sql(asUser(
        "fixture-a",
        "WITH removed AS (DELETE FROM moa_app.workspace WHERE id='workspace-b' RETURNING id) SELECT count(*) FROM removed"
      )),
      "0"
    );
    assert.equal(sql("SELECT count(*) FROM moa_app.workspace WHERE id='workspace-b'"), "1");
  });

  await test("the rightful owner can update their workspace", () => {
    assert.equal(
      sql(asUser(
        "fixture-a",
        "WITH changed AS (UPDATE moa_app.workspace SET \"updatedAt\"=now() WHERE id='workspace-a' RETURNING id) SELECT count(*) FROM changed"
      )),
      "1"
    );
  });

  for (const finish of ["COMMIT", "ROLLBACK"]) {
    await test(`transaction user context is cleared after ${finish.toLowerCase()}`, () => {
      assert.equal(
        sql(`BEGIN; SET LOCAL ROLE moa_runtime; SET LOCAL moa.user_id='fixture-a'; SELECT count(*) FROM moa_app.workspace; ${finish}; BEGIN; SET LOCAL ROLE moa_runtime; SELECT count(*) FROM moa_app.workspace; COMMIT;`),
        "1\n0"
      );
    });
  }

  await test("public and Supabase API roles have no app table access", () => {
    for (const role of ["anon", "authenticated", "service_role", "authenticator"]) {
      assert.equal(
        sql(`SELECT has_table_privilege('${role}','moa_auth."user"','SELECT')::int + has_table_privilege('${role}','moa_app.workspace','SELECT')::int`),
        "0"
      );
      denied(`SET ROLE ${role}; SELECT id FROM moa_auth."user"`, "42501");
    }
  });

  await test("email and session token uniqueness are enforced", () => {
    denied(
      `INSERT INTO moa_auth."user"(id,name,email,"updatedAt") VALUES('duplicate-email','Duplicate','a@example.invalid',now())`,
      "23505"
    );
    denied(
      `INSERT INTO moa_auth.session(id,"userId",token,"expiresAt","updatedAt") VALUES('duplicate-token','fixture-b','fixture-token-a',now(),now())`,
      "23505"
    );
  });

  await test("one external identity cannot belong to two users", () => {
    denied(
      `INSERT INTO moa_auth.account(id,"accountId","providerId","userId","updatedAt") VALUES('duplicate-provider','external-a','google','fixture-b',now())`,
      "23505"
    );
    sql(`INSERT INTO moa_auth.account(id,"accountId","providerId","userId","updatedAt") VALUES('other-provider','external-a','naver','fixture-b',now())`);
  });

  await test("foreign keys and one personal workspace per user are enforced", () => {
    denied(
      `INSERT INTO moa_auth.account(id,"accountId","providerId","userId","updatedAt") VALUES('missing-user','missing','google','no-user',now())`,
      "23503"
    );
    denied(
      `INSERT INTO moa_app.workspace(id,"ownerUserId","updatedAt") VALUES('second-workspace','fixture-a',now())`,
      "23505"
    );
  });

  await test("concurrent initialization creates only one personal workspace", async () => {
    const insert = id => asUser(
      "fixture-race",
      `INSERT INTO moa_app.workspace(id,"ownerUserId","updatedAt") VALUES('${id}','fixture-race',now()); SELECT pg_sleep(0.2)`
    );
    const results = await Promise.all([sqlAsync(insert("race-one")), sqlAsync(insert("race-two"))]);

    assert.equal(results.filter(result => result.status === 0).length, 1);

    const failure = results.find(result => result.status !== 0);

    assert.match(failure.stderr, /ERROR:\s+23505\b/);
    assert.equal(
      sql("SELECT count(*) FROM moa_app.workspace WHERE \"ownerUserId\"='fixture-race'"),
      "1"
    );
  });

  await test("deleting a user cascades only their database records", () => {
    sql(`INSERT INTO moa_app.workspace(id,"ownerUserId","updatedAt") VALUES('workspace-c','fixture-c',now());
      INSERT INTO moa_auth.account(id,"accountId","providerId","userId","updatedAt") VALUES('account-c','external-c','google','fixture-c',now());
      INSERT INTO moa_auth.session(id,"userId",token,"expiresAt","updatedAt") VALUES('session-c','fixture-c','fixture-token-c',now(),now());
      DELETE FROM moa_auth."user" WHERE id='fixture-c';`);
    assert.equal(
      sql(`SELECT (SELECT count(*) FROM moa_auth.account WHERE "userId"='fixture-c') + (SELECT count(*) FROM moa_auth.session WHERE "userId"='fixture-c') + (SELECT count(*) FROM moa_app.workspace WHERE "ownerUserId"='fixture-c')`),
      "0"
    );
    assert.equal(
      sql("SELECT count(*) FROM moa_app.workspace WHERE id='workspace-a' OR id='workspace-b'"),
      "2"
    );
  });

  await test("server database and email authentication integration contracts", async () => {
    const runtimePassword = randomUUID();

    sql(`ALTER ROLE moa_runtime PASSWORD '${runtimePassword}'`);

    const runtimeUrl = `postgresql://moa_runtime:${runtimePassword}@127.0.0.1:${endpoints[0].HostPort}/moa_auth_test`;
    const result = spawnSync(process.execPath, [vitestCli, "run", "--config", "tests/database/vitest.runtime.config.mts"], {
      cwd: root,
      env: { ...process.env, MOA_TEST_DATABASE_URL: runtimeUrl, MOA_TEST_DATABASE_RUN: runId },
      encoding: "utf8",
      windowsHide: true,
      timeout: 90_000,
    });

    if (result.error) throw result.error;

    process.stdout.write(result.stdout);
    assert.equal(result.status, 0, result.stderr || "Runtime adapter integration failed");

    if (withBrowser) {
      mkdirSync(fixtureCache, { recursive: true });
      tlsDirectory = mkdtempSync(join(fixtureCache, "moa-auth-tls-"));

      const openssl = process.env.OPENSSL_PATH || (existsSync("E:/Git/usr/bin/openssl.exe") ? "E:/Git/usr/bin/openssl.exe" : "openssl");
      const certificate = join(tlsDirectory, "fixture.crt");
      const privateKey = join(tlsDirectory, "fixture.key");
      const generated = spawnSync(
        openssl,
        ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2", "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1,DNS:localhost", "-keyout", privateKey, "-out", certificate],
        { encoding: "utf8", windowsHide: true, timeout: 30_000 }
      );

      assert.equal(
        generated.status,
        0,
        "OpenSSL is required to generate the disposable browser DB certificate"
      );
      requireSuccess(docker(["cp", certificate, `${containerId}:/tmp/moa-fixture.crt`]));
      requireSuccess(docker(["cp", privateKey, `${containerId}:/tmp/moa-fixture.key`]));
      requireSuccess(docker(["exec", "--user", "root", containerId, "sh", "-c", "chown postgres:postgres /tmp/moa-fixture.key /tmp/moa-fixture.crt && chmod 600 /tmp/moa-fixture.key"]));
      sql("ALTER SYSTEM SET ssl='on'; ALTER SYSTEM SET ssl_cert_file='/tmp/moa-fixture.crt'; ALTER SYSTEM SET ssl_key_file='/tmp/moa-fixture.key'; SELECT pg_reload_conf()");

      let sslReady = false;

      for (let attempt = 0; attempt < 20; attempt++) {
        if (sql("SHOW ssl") === "on") {
          sslReady = true;

          break;
        }

        await new Promise(accept => setTimeout(accept, 200));
      }

      assert.ok(sslReady, "The disposable database did not enable TLS");

      const browser = spawnSync(process.execPath, [join(root, "tests/browser/check-auth-ui.mjs")], {
        cwd: root,
        env: {
          ...process.env,
          MOA_TEST_DATABASE_URL: runtimeUrl,
          MOA_TEST_DATABASE_RUN: runId,
          MOA_TEST_TLS_CERT: certificate
        },
        stdio: "inherit",
        windowsHide: true,
        timeout: 240_000,
      });

      if (browser.error) throw browser.error;

      assert.equal(browser.status, 0, "Authentication browser checks failed");
    }

    if (withChatLedger) {
      const envPath = join(root, "apps/web/.env.local");

      assert.ok(
        withChatFixture || existsSync(envPath),
        "The local provider configuration is required for the explicit chat ledger check"
      );

      const openAiKey = withChatFixture ? "fixture-only-no-provider-key" : readEnvValue(envPath, "OPENAI_API_KEY");
      const provider = withChatFixture ? "openai" : (readEnvValue(envPath, "AI_PROVIDER")?.trim() || (openAiKey?.trim() ? "openai" : "gemini"));

      assert.equal(
        provider,
        "openai",
        "The explicit chat ledger check currently covers the configured OpenAI stream"
      );
      assert.ok(openAiKey?.trim(), "OPENAI_API_KEY is required for the explicit chat ledger check");

      const live = spawnSync(process.execPath, [vitestCli, "run", "--config", "tests/database/vitest.chat-ledger-live.config.mts"], {
        cwd: root,
        env: {
          ...chatLedgerEnvironment(runtimeUrl, provider, openAiKey),
          MOA_CHAT_PROVIDER_FIXTURE: withChatFixture ? "1" : "0"
        },
        encoding: "utf8",
        windowsHide: true,
        timeout: 75_000,
      });

      if (live.error) throw live.error;

      process.stdout.write(live.stdout);
      assert.equal(live.status, 0, live.stderr || "Synthetic chat ledger verification failed");
    }
  });

  console.log(`Database contract: ${passed} checks passed on disposable PostgreSQL; no user folders accessed.${withChatLedger && !withChatFixture
    ? " Provider settings read for the explicitly enabled synthetic live check."
    : " No application env files accessed."}`);
} finally {
  if (containerId) {
    assert.match(containerId, /^[a-f0-9]{64}$/);

    const label = execFileSync(
      "docker",
      ["inspect", "--format", '{{index .Config.Labels "moa.auth-check"}}', containerId],
      { encoding: "utf8", windowsHide: true }
    ).trim();

    assert.equal(label, runId, "Refusing cleanup of a container not owned by this test");
    requireSuccess(docker(["rm", "--force", "--volumes", containerId]));
  }

  if (tlsDirectory) {
    assert.ok(resolve(tlsDirectory).startsWith(resolve(fixtureCache) + sep));
    assert.ok(tlsDirectory.includes("moa-auth-tls-"));
    rmSync(tlsDirectory, { recursive: true, force: true });
  }
}
