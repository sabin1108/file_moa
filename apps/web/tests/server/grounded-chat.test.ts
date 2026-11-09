import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = {
  userId: "user-a", workspaceId: "workspace-a", sessionUserId: "user-a",
  expiresAt: Date.now() + 60_000,
};
vi.mock("server-only", () => ({}));
const read = vi.fn(), revalidate = vi.fn();
const consumeAll = vi.fn();
const finish = vi.hoisted(() => vi.fn());
vi.mock("../../src/server/chat-session", () => ({ readChatSession: read, revalidateChatStream: revalidate }));
vi.mock("../../src/server/auth-rate-limit", () => ({ createAuthRateLimiter: () => ({ consumeAll }) }));
vi.mock("../../src/server/database/client", () => ({ getDatabase: vi.fn() }));
vi.mock("../../src/server/ai-usage", () => ({ startUsage: async () => {}, finishUsage: finish }));
vi.mock("../../src/server/ai-provider", () => ({ AI_LIMITS: { timeoutMs: 20000, inputTokens: 4096, outputTokens: 1600 }, requireAiProvider: (value: unknown) => value, SampleAiError: class SampleAiError extends Error {} }));
const generate = vi.fn();
vi.mock("../../src/server/ai-generation", () => ({ generateAiJson: generate }));

const excerpt = "검증된 자료의 본문입니다. 인용 가능한 문장입니다.";
const request = () => ({ requestId: `${Date.now()}:${crypto.randomUUID()}`, owner: { userId: "user-a", workspaceId: "workspace-a" }, question: "무엇인가요?", consent: true, documents: [{ id: "document-1", name: "자료.md", path: ["자료.md"], excerpt, excerptHash: createHash("sha256").update(excerpt).digest("hex"), sha256: "a".repeat(64), size: excerpt.length, lastModified: 1 }] });
const headers = () => new Headers({ origin: "http://localhost:3034" });

describe("grounded chat authorization and citation boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.BETTER_AUTH_URL = "http://localhost:3034";
    read.mockResolvedValue(session); revalidate.mockResolvedValue(true); consumeAll.mockResolvedValue({ allowed: true });
    generate.mockResolvedValue({ model: "fixture", usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 }, value: { answer: "답변", citations: [{ documentId: "document-1", quote: excerpt }] } });
  });
  it.each([
    ["wrong origin", new Headers({ origin: "http://evil.invalid" }), "origin"],
    ["no session", headers(), "session"],
  ])("rejects %s before provider work", async (_name, requestHeaders, code) => {
    if (code === "session") read.mockResolvedValue(null);
    const { answerGrounded } = await import("../../src/server/grounded-chat");
    expect(await answerGrounded(request(), requestHeaders, "openai")).toMatchObject({ ok: false, code });
    expect(consumeAll).not.toHaveBeenCalled();
  });
  it("rejects foreign owner, missing consent and hash mismatch before quota", async () => {
    const { answerGrounded } = await import("../../src/server/grounded-chat");
    expect(await answerGrounded({ ...request(), owner: { userId: "other", workspaceId: "workspace-a" } }, headers(), "openai")).toMatchObject({ code: "session" });
    expect(await answerGrounded({ ...request(), consent: false }, headers(), "openai")).toMatchObject({ code: "input" });
    expect(await answerGrounded({ ...request(), documents: [{ ...request().documents[0], excerptHash: "b".repeat(64) }] }, headers(), "openai")).toMatchObject({ code: "input" });
    expect(consumeAll).not.toHaveBeenCalled();
  });
  it("returns unavailable for unknown citation and provider zero for quota denial", async () => {
    const { answerGrounded } = await import("../../src/server/grounded-chat");
    generate.mockResolvedValueOnce({ model: "fixture", usage: {}, value: { answer: "답변", citations: [{ documentId: "fake", quote: excerpt }] } });
    expect(await answerGrounded(request(), headers(), "openai")).toMatchObject({ ok: false, code: "unavailable" });
    consumeAll.mockResolvedValue({ allowed: false });
    expect(await answerGrounded(request(), headers(), "openai")).toMatchObject({ ok: false, code: "limit" });
  });
  it("returns a valid grounded answer and detects revocation after generation", async () => {
    const { answerGrounded } = await import("../../src/server/grounded-chat");
    expect(await answerGrounded(request(), headers(), "openai")).toMatchObject({ ok: true, answer: { citations: [{ documentId: "document-1" }] } });
    revalidate.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const revoked = request();
    expect(await answerGrounded(revoked, headers(), "openai")).toMatchObject({ ok: false, code: "session" });
    expect(finish).toHaveBeenLastCalledWith(session, revoked.requestId, "fixture", { inputTokens: 1, outputTokens: 2, totalTokens: 3 });
  });
});
