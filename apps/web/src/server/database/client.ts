import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../generated/prisma/client";
import { databasePoolConfig } from "./config";

const databaseGlobal = globalThis as typeof globalThis & { moaDatabase?: PrismaClient };

export function getDatabase(): PrismaClient {
  if (!databaseGlobal.moaDatabase) {
    const ca = readFileSync(join(process.cwd(), "prisma/certs/supabase-prod-ca-2021.crt"), "utf8");
    const config = databasePoolConfig(process.env.DATABASE_URL, ca);

    databaseGlobal.moaDatabase = new PrismaClient({
      adapter: new PrismaPg(config),
      errorFormat: "minimal",
      log: [],
    });
  }

  return databaseGlobal.moaDatabase;
}
