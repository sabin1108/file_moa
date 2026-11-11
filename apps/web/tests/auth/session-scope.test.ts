import { describe, expect, it } from "vitest";
import { sessionScope } from "../../src/features/auth/lib/session-scope";

const now = Date.parse("2026-01-01T00:00:00Z");
const fixture = {
  user: { id: "user-a", emailVerified: true },
  session: { userId: "user-a", expiresAt: "2026-01-02T00:00:00Z" }
};

describe("browser session scope", () => {
  it("accepts the server-authenticated identity independently of contact email verification", () => {
    expect(sessionScope(fixture, "user-a", now)).toBe(Date.parse(fixture.session.expiresAt));
    expect(sessionScope(fixture, "user-b", now)).toBeNull();
    expect(sessionScope({ ...fixture, user: { ...fixture.user, emailVerified: false } }, "user-a", now)).toBe(Date.parse(fixture.session.expiresAt));
  });
  it.each([null, {}, { ...fixture, user: { ...fixture.user, emailVerified: "true" } }, { ...fixture, session: { ...fixture.session, userId: "user-b" } }, { ...fixture, session: { ...fixture.session, expiresAt: "invalid" } }])("rejects absent, invalid or mixed session data", value => {
    expect(sessionScope(value, "user-a", now)).toBeNull();
  });
  it("rejects an expired session", () => {
    expect(sessionScope(fixture, "user-a", Date.parse("2026-01-03"))).toBeNull();
  });
});
