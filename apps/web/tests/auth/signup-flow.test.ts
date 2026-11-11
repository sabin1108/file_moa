import { describe, expect, it } from "vitest";
import { normalizeSignupStage, parseSignupDraft, serializeSignupDraft, signupFieldError, signupNextStage } from "../../src/features/auth/lib/signup-flow";

const now = 1_800_000_000_000;
const identity = { name: "이름", email: "fixture@example.invalid" };

describe("signup input progress and recovery", () => {
  it("clamps a forged later URL to the first incomplete identity field", () => {
    expect(normalizeSignupStage("password", { name: "", email: "" })).toBe("email");
    expect(normalizeSignupStage("password", { name: "이름", email: "partial@" })).toBe("email");
    expect(normalizeSignupStage("password", identity)).toBe("password");
    expect(normalizeSignupStage("complete", identity)).toBe("email");
    expect(normalizeSignupStage("name", identity)).toBe("email");
    expect(normalizeSignupStage("password", { name: "", email: identity.email })).toBe("password");
  });
  it("advances only valid identity fields and never marks server verification complete", () => {
    expect(signupNextStage("email", identity)).toBe("password");
    expect(signupNextStage("email", { name: "이름", email: "wrong" })).toBe("email");
    expect(signupNextStage("password", identity)).toBe("password");
  });
  it("validates the email without requiring a display name", () => {
    expect(signupFieldError("email", "bad")).toBeDefined();
    expect(signupFieldError("email", identity.email)).toBeUndefined();
  });
  it("restores the current step and identity until expiry without serializing secrets", () => {
    const raw = serializeSignupDraft(
      { ...identity, stage: "email", password: "private-password", token: "private-token" } as typeof identity & { stage: "email" },
      now
    );

    expect(raw).not.toMatch(/password|token|private|name/);
    expect(parseSignupDraft(raw, now + 1000)).toMatchObject({ name: "", email: identity.email, stage: "email" });
    expect(parseSignupDraft(raw, now + 86_400_001)).toBeUndefined();
  });
  it("migrates old name-step drafts while dropping the old name", () => {
    expect(parseSignupDraft(JSON.stringify({ ...identity, stage: "name", expiresAt: now + 1000 }), now)).toMatchObject({ name: "", email: identity.email, stage: "email" });
  });
  it.each(["null", "[]", "bad-json", "x".repeat(2049), JSON.stringify({ ...identity, stage: "complete", expiresAt: now + 1000 })])("does not restore a malformed or completion-claim draft", raw => {
    expect(parseSignupDraft(raw, now)).toBeUndefined();
  });
});
