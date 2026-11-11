import "server-only";

const codes = new Set([
  "P2002",
  "P2003",
  "P2024",
  "P2028",
  "P2034",
  "P6008",
  "23505",
  "42501",
  "28P01",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EACCES",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "CERT_HAS_EXPIRED",
  "INVALID_ORIGIN",
  "FAILED_TO_CREATE_USER",
  "FAILED_TO_CREATE_SESSION",
  "INTERNAL_SERVER_ERROR",
  "AUTHENTICATION_UNAVAILABLE",
]);
const wrappers = new Set(["INTERNAL_SERVER_ERROR", "AUTHENTICATION_UNAVAILABLE", "FAILED_TO_CREATE_USER", "FAILED_TO_CREATE_SESSION"]);
const errorKinds = new Set(["TypeError", "PrismaClientValidationError", "PrismaClientInitializationError", "PrismaClientKnownRequestError", "PrismaClientUnknownRequestError", "DriverAdapterError"]);

function authenticationErrorKind(value: unknown, depth = 0): string | undefined {
  if (depth > 3 || !value || typeof value !== "object") return;

  try {
    if (Array.isArray(value)) {
      for (const item of value) {
        const kind = authenticationErrorKind(item, depth + 1);

        if (kind) return kind;
      }
    } else {
      if ("name" in value && typeof value.name === "string" && errorKinds.has(value.name)) return value.name;

      if ("cause" in value) return authenticationErrorKind(value.cause, depth + 1);
    }
  } catch {
    return;
  }
}

export function authenticationErrorCode(value: unknown, depth = 0): string {
  if (depth > 3) return "UNEXPECTED_FAILURE";

  if (typeof value === "string") return codes.has(value) ? value : "UNEXPECTED_FAILURE";

  if (Array.isArray(value)) {
    let fallback = "UNEXPECTED_FAILURE";

    for (const item of value) {
      const code = authenticationErrorCode(item, depth + 1);

      if (code !== "UNEXPECTED_FAILURE" && !wrappers.has(code)) return code;

      if (code !== "UNEXPECTED_FAILURE") fallback = code;
    }

    return fallback;
  } else if (value && typeof value === "object") {
    try {
      const own = "code" in value && typeof value.code === "string" && codes.has(value.code) ? value.code : "UNEXPECTED_FAILURE";

      if (own !== "UNEXPECTED_FAILURE" && !wrappers.has(own)) return own;

      const cause = "cause" in value ? authenticationErrorCode(value.cause, depth + 1) : "UNEXPECTED_FAILURE";

      return cause !== "UNEXPECTED_FAILURE" ? cause : own;
    } catch {
      return "UNEXPECTED_FAILURE";
    }
  }

  return "UNEXPECTED_FAILURE";
}

export function reportAuthenticationFailure(stage: "library" | "protocol" | "form", value: unknown) {
  const kind = authenticationErrorKind(value);

  console.error(
    "Authentication operation failed.",
    { stage, code: authenticationErrorCode(value), ...(kind ? { kind } : {}) }
  );
}
