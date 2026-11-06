import { defineConfig } from "prisma/config";

const migrationUrl = process.env.MIGRATION_DATABASE_URL ?? "";

if (migrationUrl) {
  let target: URL;

  try {
    target = new URL(migrationUrl);
  } catch {
    throw new Error("MIGRATION_DATABASE_URL must be a PostgreSQL URL with schema=moa_app");
  }

  if (!["postgres:", "postgresql:"].includes(target.protocol) || target.searchParams.get("schema") !== "moa_app") {
    throw new Error("MIGRATION_DATABASE_URL must use PostgreSQL and schema=moa_app for migration bookkeeping");
  }
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Offline validation/generation needs no URL. DDL uses an explicitly supplied migration credential.
  datasource: { url: migrationUrl },
});
