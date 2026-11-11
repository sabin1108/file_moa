import { afterEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { reportLiveAi } from "../../src/server/live-ai-diagnostics";

afterEach(() => vi.restoreAllMocks());

it("writes only operational fields, never extra identities, prompts or provider responses", () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => { });
  const value = {
    stage: "response" as const,
    provider: "openai" as const,
    outcome: "unavailable" as const,
    elapsedMs: 52,
    usage: { inputTokens: 120, outputTokens: 40, totalTokens: 160, secret: "private-token" },
    request: "private text",
    path: "private path",
    email: "private email",
    key: "private-token"
  };

  reportLiveAi(value);
  expect(log).toHaveBeenCalledWith(
    "Live AI operation.",
    {
      stage: "response",
      provider: "openai",
      outcome: "unavailable",
      elapsedMs: 52,
      inputTokens: 120,
      outputTokens: 40,
      totalTokens: 160
    }
  );
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/private|secret|email|request|path/);
});
