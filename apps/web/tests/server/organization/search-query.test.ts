import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ read: vi.fn(), revalidate: vi.fn(), consume: vi.fn(), start: vi.fn(), finish: vi.fn(), generate: vi.fn() }));
vi.mock("../../../src/server/chat/chat-session", () => ({ readChatSession: mocks.read, revalidateChatStream: mocks.revalidate }));
vi.mock("../../../src/server/auth/auth-rate-limit", () => ({ createAuthRateLimiter: () => ({ consumeAll: mocks.consume }) }));
vi.mock("../../../src/server/database/client", () => ({ getDatabase: vi.fn() }));
vi.mock("../../../src/server/ai/ai-usage", () => ({ startUsage: mocks.start, finishUsage: mocks.finish }));
vi.mock("../../../src/server/ai/ai-generation", () => ({ generateAiJson: mocks.generate }));
vi.mock("../../../src/server/ai/ai-provider", () => ({ AI_LIMITS: { timeoutMs: 1000, inputTokens: 4096, outputTokens: 1600 }, requireAiProvider: () => "openai", SampleAiError: class extends Error {} }));
const owner = { userId: "user-a", workspaceId: "workspace-a" };
const question = "가온센터 이력서 찾아줘";
const input = () => ({ requestId: `${Date.now()}:${crypto.randomUUID()}`, owner, consent: true, question });
const headers = () => new Headers({ origin: "http://localhost:3034" });

describe("RAG-S08: opt-in question-only interpretation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.BETTER_AUTH_URL = "http://localhost:3034";
    process.env.ENABLE_REMOTE_QUERY_PLAN = "true";
    mocks.read.mockResolvedValue({ ...owner, sessionUserId: owner.userId, expiresAt: Date.now() + 60_000 });
    mocks.revalidate.mockResolvedValue(true);
    mocks.consume.mockResolvedValue({ allowed: true });
    mocks.start.mockResolvedValue(undefined);
    mocks.finish.mockResolvedValue(undefined);
    mocks.generate.mockResolvedValue({ value: { required: ["가온센터"], preferred: ["이력서"], phrases: [], excluded: [] }, model: "synthetic", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } });
  });

  it("rejects missing consent, extra document payload, foreign owner and wrong Origin before quota", async () => {
    const { interpretSearchQuery } = await import("../../../src/server/organization/search-query");
    for (const [value, requestHeaders, code] of [
      [{ ...input(), consent: false }, headers(), "input"],
      [{ ...input(), documents: [{ text: "private" }] }, headers(), "input"],
      [{ ...input(), owner: { ...owner, userId: "other" } }, headers(), "session"],
      [input(), new Headers({ origin: "https://evil.invalid" }), "origin"],
    ] as const) expect(await interpretSearchQuery(value, requestHeaders, "openai")).toMatchObject({ ok: false, code });
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("sends only the previewed question and settles usage even when model invents a target", async () => {
    const { interpretSearchQuery } = await import("../../../src/server/organization/search-query");
    const result = await interpretSearchQuery(input(), headers(), "openai");

    expect(result).toMatchObject({ ok: true, question });
    expect(JSON.parse(mocks.generate.mock.calls[0][0].input)).toEqual({ question });
    expect(mocks.start).toHaveBeenCalledWith(expect.objectContaining(owner), expect.any(String), "openai", "query");
    expect(mocks.finish).toHaveBeenCalledOnce();

    mocks.generate.mockResolvedValueOnce({ value: { required: ["다른기업"], preferred: [], phrases: [], excluded: [] }, model: "synthetic", usage: null });
    expect(await interpretSearchQuery(input(), headers(), "openai")).toMatchObject({ ok: false });
    expect(mocks.finish).toHaveBeenCalledTimes(2);
  });

  it("keeps the feature disabled by default and refuses expired or revoked sessions", async () => {
    const { interpretSearchQuery } = await import("../../../src/server/organization/search-query");
    delete process.env.ENABLE_REMOTE_QUERY_PLAN;
    expect(await interpretSearchQuery(input(), headers(), "openai")).toMatchObject({ ok: false, code: "unavailable" });
    expect(mocks.generate).not.toHaveBeenCalled();
    process.env.ENABLE_REMOTE_QUERY_PLAN = "true";
    mocks.revalidate.mockResolvedValue(false);
    expect(await interpretSearchQuery(input(), headers(), "openai")).toMatchObject({ ok: false, code: "session" });
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
