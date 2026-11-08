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
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "CERT_HAS_EXPIRED",
  "INVALID_ORIGIN",
  "FAILED_TO_CREATE_USER",
  "FAILED_TO_CREATE_SESSION",
  "INTERNAL_SERVER_ERROR",
  "AUTHENTICATION_UNAVAILABLE",
]);

export function authenticationErrorCode(value: unknown, depth = 0): string {
  if (depth > 3) return "UNEXPECTED_FAILURE";
  if (typeof value === "string") return codes.has(value) ? value : "UNEXPECTED_FAILURE";
  if (Array.isArray(value)) {
    for (const item of value) {
      const code = authenticationErrorCode(item, depth + 1);
      if (code !== "UNEXPECTED_FAILURE") return code;
    }
  } else if (value && typeof value === "object") {
    try {
      if ("code" in value && typeof value.code === "string" && codes.has(value.code)) return value.code;
      if ("cause" in value) return authenticationErrorCode(value.cause, depth + 1);
    } catch { return "UNEXPECTED_FAILURE"; }
  }
  return "UNEXPECTED_FAILURE";
}

export function reportAuthenticationFailure(stage: "library" | "protocol" | "form", value: unknown) {
  console.error("Authentication operation failed.", { stage, code: authenticationErrorCode(value) });
}
