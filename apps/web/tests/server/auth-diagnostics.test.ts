import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { authenticationErrorCode, reportAuthenticationFailure } from "../../src/server/auth-diagnostics";

describe("authentication diagnostic privacy", () => {
  it("retains only allowlisted error codes", () => {
    expect(authenticationErrorCode(new Error("private-password-and-token"))).toBe("UNEXPECTED_FAILURE");
    expect(authenticationErrorCode({ code: "private-secret", message: "private-email@example.invalid" })).toBe("UNEXPECTED_FAILURE");
    expect(authenticationErrorCode(["Failed", { cause: { code: "P2028", secret: "private-secret" } }])).toBe("P2028");
  });
  it("keeps a concrete cause instead of a generic library wrapper", () => {
    expect(authenticationErrorCode(["INTERNAL_SERVER_ERROR", { cause: { code: "ECONNRESET" } }])).toBe("ECONNRESET");
    expect(authenticationErrorCode({ code: "INTERNAL_SERVER_ERROR", cause: { code: "P2028" } })).toBe("P2028");
  });
  it("does not log error messages, stack, request bodies or unknown properties", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      reportAuthenticationFailure("library", { code: "P2002", message: "private-token", body: { password: "private-password" } });
      expect(log).toHaveBeenCalledWith("Authentication operation failed.", { stage: "library", code: "P2002" });
      expect(JSON.stringify(log.mock.calls)).not.toMatch(/private|password|token/);
    } finally { log.mockRestore(); }
  });
  it("reports only known error kinds and never an arbitrary error name", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      reportAuthenticationFailure("protocol", new TypeError("private-token"));
      expect(log.mock.lastCall?.[1]).toEqual({ stage: "protocol", code: "UNEXPECTED_FAILURE", kind: "TypeError" });
      reportAuthenticationFailure("protocol", { name: "private-token" });
      expect(JSON.stringify(log.mock.calls)).not.toContain("private-token");
    } finally { log.mockRestore(); }
  });
});
