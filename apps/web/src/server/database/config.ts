import "server-only";

import type { PoolConfig } from "pg";

const configurationError = "DATABASE_URL must use the restricted runtime role and verified TLS.";

export function databasePoolConfig(databaseUrl: string | undefined, ca: string): PoolConfig {
  let url: URL;

  try {
    url = new URL(databaseUrl ?? "");
  } catch {
    throw new Error(configurationError);
  }

  const allowedParameters: Record<string, (value: string) => boolean> = {
    sslmode: value => value === "verify-full" || value === "require",
    sslrootcert: value => value.length > 0,
    sslaccept: value => value === "strict",
    schema: value => value === "moa_app",
  };

  const parameterNames = [...url.searchParams.keys()];
  const validParameters = parameterNames.every(name =>
    Object.hasOwn(allowedParameters, name)
    && url.searchParams.getAll(name).length === 1
    && allowedParameters[name](url.searchParams.get(name)!));

  if (!["postgres:", "postgresql:"].includes(url.protocol)
    || !/^moa_runtime(?:\.[a-z0-9-]+)?$/.test(url.username)
    || !url.password || !url.hostname || url.pathname.length <= 1
    || url.hash || !ca.trim() || !validParameters) {
    throw new Error(configurationError);
  }

  // pg URL TLS parameters replace the ssl object, including its trusted CA.
  url.search = "";

  return {
    connectionString: url.toString(),
    ssl: { ca, rejectUnauthorized: true },
    max: 5,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  };
}
