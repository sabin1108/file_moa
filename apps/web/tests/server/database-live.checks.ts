import { resolve } from "node:path";
import { afterAll, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getDatabase } from "../../src/server/database/client";
import { getAuth } from "../../src/server/auth";

// Explicit opt-in configuration only: ordinary tests never load real credentials.

process.loadEnvFile(resolve(process.cwd(), ".env.local"));

afterAll(async () => {
  await getDatabase().$disconnect();
});

it("connects with the bundled CA and restricted role without reading user records or writing", async () => {
  try {
    await getDatabase().$transaction(async transaction => {
      await transaction.$executeRaw`SET TRANSACTION READ ONLY`;

      const [role] = await transaction.$queryRaw<{
        runtime: boolean;
        elevated: boolean;
        rls: boolean
      }[]>`
        SELECT current_user = 'moa_runtime' AS runtime,
          (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole) AS elevated,
          (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
            WHERE oid = 'moa_app.workspace'::regclass) AS rls
        FROM pg_roles WHERE rolname = current_user`;

      expect(role).toEqual({ runtime: true, elevated: false, rls: true });
      expect(await transaction.workspace.count()).toBe(0);
    });

    expect(await getAuth().api.getSession({ headers: new Headers() })).toBeNull();
  } catch {
    throw new Error("Read-only runtime connection or authentication boundary verification failed.");
  }
});
