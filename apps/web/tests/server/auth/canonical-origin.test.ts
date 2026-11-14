import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { canonicalDestination } from "../../../src/server/auth/canonical-origin";

const origin = "https://app.example.invalid";

describe("canonical authentication origin", () => {
  it("keeps local and preview environments unchanged", () => {
    expect(canonicalDestination("http://127.0.0.1/welcome", origin, false)).toBeNull();
  });
  it("keeps an already canonical request unchanged", () => {
    expect(canonicalDestination(origin + "/welcome?step=email", origin, true)).toBeNull();
  });
  it("moves a deployment URL to the configured origin without accepting a return destination", () => {
    const destination = canonicalDestination(
      "https://deployment.example.invalid/welcome?step=email&next=https://evil.example.invalid",
      origin,
      true
    );

    expect(destination?.origin).toBe(origin);
    expect(destination?.pathname).toBe("/welcome");
    expect(destination?.searchParams.get("step")).toBe("email");
  });
  it("does not turn a double slash path into an external redirect", () => {
    expect(canonicalDestination("https://deployment.example.invalid//evil.example.invalid/path", origin, true)?.origin).toBe(origin);
  });
  it.each([undefined, "invalid", "http://app.example.invalid", "https://user:password@app.example.invalid", origin + "/path", origin + "?token=private"])("does not redirect using an unsafe configuration", value => {
    expect(canonicalDestination("https://deployment.example.invalid/", value, true)).toBeNull();
  });
});
