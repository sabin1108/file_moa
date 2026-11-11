import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { generateClassification } from "../../src/server/ai-generation";

const request = {
  documents: [{ id: "note", name: "회의.md", excerpt: "회의 일정" }],
  folders: [{ id: "meeting", label: "업무/회의" }]
};
const proposal = { documentId: "note", folderId: "meeting", reason: "회의 일정입니다.", reviewRequired: false };
const fetchMock = vi.fn();
const completed = (text = JSON.stringify({ proposals: [proposal] }), finishReason = "STOP") => Response.json({
  candidates: [{ finishReason, content: { parts: [{ text }] } }],
  usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 30, totalTokenCount: 130 }
});

beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "gemini");
  vi.stubEnv("GEMINI_API_KEY", "fixture-private-key");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset().mockResolvedValueOnce(Response.json({ totalTokens: 100 })).mockResolvedValueOnce(completed());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Gemini REST adapter", () => {
  it("counts before generating, uses structured bounded output and sends credentials only in a header", async () => {
    expect(await generateClassification(request, AbortSignal.timeout(1000))).toMatchObject({ proposals: [proposal], usage: { inputTokens: 100, outputTokens: 30, totalTokens: 130 } });
    expect(fetchMock.mock.calls.map(call => String(call[0]))).toEqual([
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:countTokens",
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
    ]);

    const options = fetchMock.mock.calls[1][1];
    const body = JSON.parse(options.body);

    expect(options.headers["x-goog-api-key"]).toBe("fixture-private-key");
    expect(options.body).not.toContain("fixture-private-key");
    expect(body.generationConfig).toMatchObject({
      responseMimeType: "application/json",
      maxOutputTokens: 1600,
      thinkingConfig: { thinkingLevel: "minimal" }
    });
    expect(body.tools).toBeUndefined();
  });
  it("rejects an oversized input before a generation call", async () => {
    fetchMock.mockReset().mockResolvedValue(Response.json({ totalTokens: 4097 }));
    await expect(generateClassification(request, AbortSignal.timeout(1000))).rejects.toMatchObject({ code: "input" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([429, 401, 500])("sanitizes provider status %s without a retry or another model", async status => {
    fetchMock.mockReset().mockResolvedValue(new Response("fixture-private-provider-error", { status }));
    await expect(generateClassification(request, AbortSignal.timeout(1000))).rejects.toMatchObject({ code: status === 429 ? "limit" : "unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([completed("bad-json"), completed(undefined, "MAX_TOKENS"), Response.json({ promptFeedback: { blockReason: "SAFETY" } }), completed("x".repeat(70_000))])("rejects malformed, truncated, blocked and oversized responses", async response => {
    fetchMock.mockReset().mockResolvedValueOnce(Response.json({ totalTokens: 100 })).mockResolvedValueOnce(response);
    await expect(generateClassification(request, AbortSignal.timeout(1000))).rejects.toBeDefined();
  });
  it("honors cancellation and does not generate after a canceled count", async () => {
    const abort = new AbortController();

    abort.abort();
    await expect(generateClassification(request, abort.signal)).rejects.toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
