import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const reserve = vi.hoisted(() => vi.fn());
const generate = vi.hoisted(() => vi.fn());

vi.mock(
  "../../src/server/auth-rate-limit",
  () => ({ createAuthRateLimiter: () => ({ consumeAll: reserve }) })
);
vi.mock("../../src/server/database/client", () => ({ getDatabase: vi.fn() }));
vi.mock(
  "../../src/server/ai-generation",
  () => ({ generateAiJson: generate, generateClassification: generate })
);

import { getAiProvider, getSampleAiProvider } from "../../src/server/ai-provider";
import { classifySample } from "../../src/server/sample-ai";
import { organizeSample } from "../../src/server/sample-organization";
import { createSampleSession } from "../../src/server/sample-session";

beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "openai");
  vi.stubEnv("OPENAI_API_KEY", "fixture-openai-key");
  vi.stubEnv("BETTER_AUTH_SECRET", "fixture-sample-secret-at-least-32-characters");
  vi.stubEnv("BETTER_AUTH_URL", "https://workspace.example.invalid");
  vi.stubEnv("ENABLE_PUBLIC_SAMPLE_AI", "");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("VERCEL_ENV", "");
  reserve.mockReset();
  generate.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("public sample cost boundary", () => {
  it("keeps the authenticated provider available while public samples default to disabled", () => {
    expect(getAiProvider()).toBe("openai");
    expect(getSampleAiProvider()).toBeNull();
  });

  it("rejects both direct sample actions before quota or provider access", async () => {
    const context = { token: createSampleSession().token, origin: "https://workspace.example.invalid" };
    const input = { requestId: crypto.randomUUID(), documentIds: ["report-1014"], consent: true };

    expect(await classifySample(input, context, "openai")).toMatchObject({ ok: false, code: "unavailable" });
    expect(await organizeSample({ ...input, instruction: "보고서를 정리해줘" }, context, "openai")).toMatchObject({ ok: false, code: "unavailable" });
    expect(reserve).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it.each([["VERCEL", "1"], ["VERCEL_ENV", "production"], ["VERCEL_ENV", "preview"]])("does not infer public permission from a local URL on %s=%s", (name, value) => {
    vi.stubEnv("BETTER_AUTH_URL", "http://127.0.0.1:3034");
    vi.stubEnv(name, value);
    expect(getSampleAiProvider()).toBeNull();
  });

  it("allows explicit public opt-in and fails closed for invalid flags", () => {
    vi.stubEnv("ENABLE_PUBLIC_SAMPLE_AI", "true");
    expect(getSampleAiProvider()).toBe("openai");
    vi.stubEnv("ENABLE_PUBLIC_SAMPLE_AI", "yes");
    expect(getSampleAiProvider()).toBeNull();
    vi.stubEnv("ENABLE_PUBLIC_SAMPLE_AI", "false");
    expect(getSampleAiProvider()).toBeNull();
  });

  it("preserves local testing unless explicitly disabled", () => {
    vi.stubEnv("BETTER_AUTH_URL", "http://127.0.0.1:3034");
    expect(getSampleAiProvider()).toBe("openai");
    vi.stubEnv("ENABLE_PUBLIC_SAMPLE_AI", "false");
    expect(getSampleAiProvider()).toBeNull();
  });
});
