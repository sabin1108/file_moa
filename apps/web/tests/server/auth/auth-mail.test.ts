import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { sendAuthenticationEmail } from "../../../src/server/auth/auth-mail";

const message = {
  to: "fixture@example.invalid",
  subject: "모아 이메일 확인",
  text: "https://app.example.invalid/verify?token=fixture-token"
};

beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "fixture-resend-secret");
  vi.stubEnv("EMAIL_FROM", "Moa <sender@example.invalid>");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("authentication email transport", () => {
  it("sends through Resend with a deterministic HMAC key without exposing the token in headers", async () => {
    const fetch = vi.fn().mockImplementation(async () => Response.json({ id: "fixture-mail-id" }));

    vi.stubGlobal("fetch", fetch);

    expect(await sendAuthenticationEmail(message)).toEqual({ id: "fixture-mail-id" });
    await sendAuthenticationEmail(message);
    await sendAuthenticationEmail({ ...message, text: "a-new-token" });

    const [url, request] = fetch.mock.calls[0];

    expect(url).toBe("https://api.resend.com/emails");
    expect(request.method).toBe("POST");
    expect(JSON.parse(request.body)).toEqual({
      from: "Moa <sender@example.invalid>",
      to: [message.to],
      subject: message.subject,
      text: message.text
    });
    expect(request.headers.Authorization).toBe("Bearer fixture-resend-secret");
    expect(request.headers["Idempotency-Key"]).toMatch(/^moa-auth-[a-f0-9]{64}$/);
    expect(request.headers["Idempotency-Key"]).not.toContain("fixture-token");
    expect(fetch.mock.calls[1][1].headers["Idempotency-Key"]).toBe(request.headers["Idempotency-Key"]);
    expect(fetch.mock.calls[2][1].headers["Idempotency-Key"]).not.toBe(request.headers["Idempotency-Key"]);
  });

  it.each(["rejected", "network", "invalid-response"])("reports a generic delivery failure (%s)", async failure => {
    const fetch = vi.fn();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    if (failure === "network") fetch.mockRejectedValue(new Error("fixture-resend-secret fixture-token"));
    else if (failure === "invalid-response") fetch.mockResolvedValue(Response.json({ unexpected: "fixture-resend-secret" }));
    else fetch.mockResolvedValue(new Response("fixture-resend-secret", { status: 403 }));

    vi.stubGlobal("fetch", fetch);

    await expect(sendAuthenticationEmail(message)).rejects.toThrow("Authentication email delivery failed.");
    expect(log).toHaveBeenCalledWith(
      "Authentication email delivery failed.",
      { providerStatus: failure === "rejected" ? 403 : failure === "invalid-response" ? 200 : null }
    );
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/fixture-resend-secret|fixture-token/);
  });

  it.each(["", "not-an-email", "Moa <sender@example.invalid>\r\nBcc: other@example.invalid"])("rejects an invalid sender before network access (%#)", async sender => {
    vi.stubEnv("EMAIL_FROM", sender);

    const fetch = vi.fn();

    vi.stubGlobal("fetch", fetch);

    await expect(sendAuthenticationEmail(message)).rejects.toThrow("Authentication email is not configured.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects an invalid recipient before network access", async () => {
    const fetch = vi.fn();

    vi.stubGlobal("fetch", fetch);

    await expect(sendAuthenticationEmail({ ...message, to: "not-an-email" })).rejects.toThrow("Invalid authentication email recipient.");
    expect(fetch).not.toHaveBeenCalled();
  });
});
