import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const destination = vi.hoisted(() => vi.fn<() => URL | null>());
vi.mock("../../src/server/canonical-origin", () => ({ configuredCanonicalDestination: destination }));
import { NextRequest } from "next/server";
import { proxy } from "../../src/proxy";

describe("canonical proxy request safety", () => {
  it("redirects navigation to the configured canonical URL", () => {
    destination.mockReturnValue(new URL("https://app.example.invalid/welcome?step=email"));
    const response = proxy(new NextRequest("https://deployment.example.invalid/welcome"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.example.invalid/welcome?step=email");
  });
  it("rejects a mutation without forwarding its body or issuing a redirect", async () => {
    destination.mockReturnValue(new URL("https://app.example.invalid/welcome"));
    const response = proxy(new NextRequest("https://deployment.example.invalid/welcome", { method: "POST", body: "fixture-private-password" }));
    expect(response.status).toBe(403);
    expect(response.headers.has("location")).toBe(false);
    expect(await response.text()).not.toContain("fixture-private-password");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("passes canonical requests through", () => {
    destination.mockReturnValue(null);
    expect(proxy(new NextRequest("https://app.example.invalid/login")).headers.get("x-middleware-next")).toBe("1");
  });
});
