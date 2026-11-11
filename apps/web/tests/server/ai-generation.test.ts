import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const openai = vi.hoisted(() => vi.fn());
const gemini = vi.hoisted(() => vi.fn());

vi.mock("../../src/server/openai-generation", () => ({ generateOpenAiJson: openai }));
vi.mock("../../src/server/gemini-generation", () => ({ generateGeminiJson: gemini }));

import { generateClassification } from "../../src/server/ai-generation";

const request = {
  documents: [{ id: "note", name: "회의.md", excerpt: "회의 일정" }],
  folders: [{ id: "meeting", label: "업무/회의" }]
};
const proposal = { documentId: "note", folderId: "meeting", reason: "회의 일정", reviewRequired: false };

beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "openai");
  vi.stubEnv("OPENAI_API_KEY", "fixture-key");
  vi.stubEnv("GEMINI_API_KEY", "fixture-gemini-key");
  openai.mockReset().mockResolvedValue({
    value: { proposals: [proposal] },
    model: "fixture",
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }
  });
  gemini.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("shared classification policy", () => {
  it("uses the selected adapter and still checks the returned IDs", async () => {
    expect(await generateClassification(request, AbortSignal.timeout(1000))).toMatchObject({ proposals: [proposal] });

    const prompt = openai.mock.calls[0][0];

    expect(JSON.parse(prompt.input)).toEqual(request);
    expect(prompt.schema.properties.proposals.items.properties.documentId.enum).toEqual(["note"]);
    expect(gemini).not.toHaveBeenCalled();
    openai.mockResolvedValue({ value: { proposals: [{ ...proposal, documentId: "not-selected" }] } });
    await expect(generateClassification(request, AbortSignal.timeout(1000))).rejects.toBeDefined();
  });

  it("does not switch providers after a failed call", async () => {
    openai.mockRejectedValue(new Error("provider unavailable"));
    await expect(generateClassification(request, AbortSignal.timeout(1000))).rejects.toBeDefined();
    expect(openai).toHaveBeenCalledOnce();
    expect(gemini).not.toHaveBeenCalled();
  });
});
