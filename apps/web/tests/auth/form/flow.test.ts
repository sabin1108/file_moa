import { describe, expect, it } from "vitest";
import { authProgress, signupOperation } from "../../../src/features/auth/form/form-config";
import { parseAuthDraft, serializeAuthDraft } from "../../../src/features/auth/form/draft";

describe("reused authentication workflow display", () => {
  it("does not accept a URL completion claim as verified progress", () => {
    expect(signupOperation("verification")).toBe("resend");
    expect(signupOperation("complete")).toBe("signup");
    expect(signupOperation(["verification"])).toBe("signup");
    expect(authProgress("verify", false)?.current).toBe("verification");
    expect(authProgress("verify", true)?.current).toBe("complete");
    expect(authProgress("reset", false)?.current).toBe("password");
  });

  it("keeps only editable identity fields in a draft", () => {
    const raw = JSON.stringify({
      name: "이름",
      email: "fixture@example.invalid",
      token: "private-token",
      password: "private-password"
    });
    const draft = parseAuthDraft(raw);

    expect(draft).toEqual({ name: "이름", email: "fixture@example.invalid" });
    expect(serializeAuthDraft(draft)).not.toMatch(/private|token|password/);
  });

  it.each(["invalid-json", "null", "[]", JSON.stringify({ name: "x".repeat(41), email: "" }), "x".repeat(2049)])("rejects a malformed draft (%#)", raw => {
    expect(parseAuthDraft(raw)).toEqual({ name: "", email: "" });
  });
});
