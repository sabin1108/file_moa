import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { databasePoolConfig } from "../../src/server/database/config";

const url = "postgresql://moa_runtime.project:fixture-secret@db.example.invalid:5432/postgres";

describe("runtime database connection boundary", () => {
  it("keeps the bundled CA authoritative instead of pg URL TLS parameters", () => {
    const config = databasePoolConfig(`${url}?sslmode=verify-full&sslrootcert=ignored.crt&schema=moa_app`, "fixture-ca");

    expect(config.ssl).toEqual({ ca: "fixture-ca", rejectUnauthorized: true });
    expect(new URL(config.connectionString!).search).toBe("");
    expect(config.max).toBe(5);
    expect(config.connectionTimeoutMillis).toBe(10_000);
  });

  it.each([
    undefined,
    "fixture-secret-not-a-url",
    url.replace("postgresql:", "https:"),
    url.replace("moa_runtime.project", "postgres"),
    url.replace("moa_runtime.project", "moa_runtime_admin"),
    url.replace(":fixture-secret@", "@"),
    `${url}?sslmode=disable`,
    `${url}?sslmode=no-verify`,
    `${url}?sslaccept=accept_invalid_certs`,
    `${url}?schema=public`,
    `${url}?options=-c%20role%3Dpostgres`,
    `${url}?sslmode=verify-full&sslmode=disable`,
  ])("rejects unsafe configuration without echoing credentials (%#)", value => {
    expect(() => databasePoolConfig(value, "fixture-ca")).toThrow("DATABASE_URL must use the restricted runtime role and verified TLS.");
  });

  it("rejects an absent CA", () => {
    expect(() => databasePoolConfig(url, "")).toThrow();
  });
});
