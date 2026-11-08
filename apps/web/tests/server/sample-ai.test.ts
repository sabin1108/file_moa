import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const consume = vi.hoisted(() => vi.fn());
const generate = vi.hoisted(() => vi.fn());
vi.mock("../../src/server/auth-rate-limit", () => ({ createAuthRateLimiter: () => ({ consumeAll: consume }) }));
vi.mock("../../src/server/database/client", () => ({ getDatabase: vi.fn() }));
vi.mock("../../src/server/ai-generation", async importOriginal => ({ ...await importOriginal<typeof import("../../src/server/ai-generation")>(), generateClassification: generate }));
import { createSampleSession } from "../../src/server/sample-session";
import { getSampleCatalog } from "../../src/server/sample-catalog";
import { classifySample } from "../../src/server/sample-ai";

const catalog = getSampleCatalog();
const selected = catalog.documents.slice(0, 2);
const input = () => ({ requestId: crypto.randomUUID(), documentIds: selected.map(document => document.id), consent: true });
const context = () => ({ token: createSampleSession().token, origin: "http://127.0.0.1:3034" });

beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "gemini");
  vi.stubEnv("GEMINI_API_KEY", "fixture-key");
  vi.stubEnv("BETTER_AUTH_SECRET", "fixture-sample-ai-secret-at-least-32-characters");
  vi.stubEnv("BETTER_AUTH_URL", "http://127.0.0.1:3034");
  vi.stubEnv("GEMINI_API_KEY", "fixture-key-never-returned");
  consume.mockReset().mockResolvedValue({ allowed: true, retryAfter: null });
  generate.mockReset().mockImplementation(async request => ({
    proposals: request.documents.map((document: { id: string }) => ({ documentId: document.id, folderId: "meeting", reason: "분류 근거", reviewRequired: false })),
    usage: { inputTokens: 100, outputTokens: 30, totalTokens: 130 }, model: "gemini-3.5-flash-lite",
  }));
});

describe("sample Gemini boundary", () => {
  it("rejects stale provider consent before reserving or calling the model", async () => {
    vi.stubEnv("AI_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "fixture-openai-key");
    expect(await classifySample(input(), context(), "gemini")).toMatchObject({ ok: false, code: "unavailable" });
    expect(consume).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("requires a signed unexpired sample, trusted Origin and explicit consent before quota/model work", async () => {
    expect(await classifySample(input(), { ...context(), token: undefined })).toMatchObject({ ok: false, code: "session" });
    expect(await classifySample(input(), { ...context(), token: createSampleSession(Date.now() - 3_600_001).token })).toMatchObject({ ok: false, code: "session" });
    expect(await classifySample(input(), { ...context(), origin: "https://evil.invalid" })).toMatchObject({ ok: false, code: "origin" });
    expect(await classifySample({ ...input(), consent: false }, context())).toMatchObject({ ok: false, code: "input" });
    expect(consume).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
  it.each([
    { documentIds: ["private-file"] },
    { documentIds: [selected[0].id, selected[0].id] },
    { excerpt: "client private data" },
    { workspaceId: "another-user" },
    { model: "paid-model" },
  ])("rejects client data/provider/scope injection (%j)", async extra => {
    expect(await classifySample({ ...input(), ...extra }, context())).toMatchObject({ ok: false, code: "input" });
    expect(generate).not.toHaveBeenCalled();
  });
  it("reserves shared global/session/idempotency caps then sends only registered excerpts and folders", async () => {
    const response = await classifySample(input(), context());
    expect(response).toMatchObject({ ok: true, model: "gemini-3.5-flash-lite", usage: { totalTokens: 130 } });
    expect(consume).toHaveBeenCalledTimes(1);
    expect(consume.mock.calls[0][0]).toHaveLength(4);
    expect(generate.mock.calls[0][0]).toEqual({ documents: selected.map(({ id, name, excerpt }) => ({ id, name, excerpt })), folders: catalog.folders });
    expect(JSON.stringify(generate.mock.calls)).not.toContain("assetBase64");
    expect(JSON.stringify(response)).not.toContain("fixture-key");
  });
  it("fails closed on a shared quota error, rejects a duplicate, and never retries automatically", async () => {
    consume.mockRejectedValueOnce(new Error("fixture-database-secret"));
    expect(await classifySample(input(), context())).toMatchObject({ ok: false, code: "unavailable" });
    consume.mockResolvedValue({ allowed: false, retryAfter: 55 });
    expect(await classifySample(input(), context())).toMatchObject({ ok: false, code: "limit", retryAfter: 55 });
    expect(generate).not.toHaveBeenCalled();
  });
  it("rejects an incomplete/unknown model result without any prepared fallback", async () => {
    generate.mockResolvedValue({ proposals: [{ documentId: "unselected", folderId: "meeting", reason: "x", reviewRequired: false }] });
    expect(await classifySample(input(), context())).toMatchObject({ ok: false, code: "unavailable" });
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
