import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const reserve = vi.hoisted(() => vi.fn());
const generate = vi.hoisted(() => vi.fn());

vi.mock(
  "../../../src/server/demo/sample-ai",
  async original => ({ ...await original<typeof import("../../../src/server/demo/sample-ai")>(), reserveSampleAi: reserve })
);
vi.mock(
  "../../../src/server/ai/ai-generation",
  async original => ({ ...await original<typeof import("../../../src/server/ai/ai-generation")>(), generateAiJson: generate })
);

import { organizeSample } from "../../../src/server/demo/sample-organization";
import { createSampleSession } from "../../../src/server/demo/sample-session";
import { createDemoVisitor } from "../../../src/server/demo/demo-access";
import { getSampleCatalog } from "../../../src/server/demo/sample-catalog";
import { SampleAiError } from "../../../src/server/ai/ai-provider";
import { organizationIntentCases } from "./organization-intent-cases";

const input = () => ({
  requestId: crypto.randomUUID(),
  documentIds: ["report-1014", "perf-lcp"],
  instruction: "10월 보고서 날짜별로 정리",
  consent: true
});
const context = () => ({ token: createSampleSession().token, visitorToken: createDemoVisitor().token, origin: "http://127.0.0.1:3034" });

beforeEach(() => {
  vi.stubEnv("DEMO_ACCESS_TOKEN", "a".repeat(64));
  vi.stubEnv("AI_PROVIDER", "gemini");
  vi.stubEnv("GEMINI_API_KEY", "fixture-key");
  vi.stubEnv("BETTER_AUTH_SECRET", "fixture-organization-secret-at-least-32-characters");
  vi.stubEnv("BETTER_AUTH_URL", "http://127.0.0.1:3034");
  reserve.mockReset().mockResolvedValue({ allowed: true, signal: AbortSignal.timeout(1000) });
  generate.mockReset().mockResolvedValue({
    value: {
      summary: "본문 작성일로 정리해요.",
      matches: [{
        documentId: "report-1014",
        destination: ["보고서", "2026-10-14"],
        evidence: "2026년 10월 14일 업무 보고서.",
        date: "2026-10-14"
      }],
      held: []
    },
    model: "gemini-3.5-flash-lite",
    usage: { inputTokens: 20, outputTokens: 30, totalTokens: 50 }
  });
});
describe("sample content intent boundary", () => {
  it.each(organizationIntentCases)("forwards the owned semantic evaluation case without narrowing it: $id", async ({ instruction, documentIds }) => {
    generate.mockResolvedValueOnce({ value: { summary: "어떤 기준으로 나눌까요?", matches: [], held: [], questions: [] }, model: "fixture", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } });
    expect(await organizeSample({ ...input(), instruction, documentIds: [...documentIds] }, context())).toMatchObject({ ok: true });
    expect(generate).toHaveBeenCalledOnce();
    const payload = JSON.parse(generate.mock.calls[0][0].input);
    expect(payload.instruction).toBe(instruction);
    expect(payload.documents.map((document: { id: string }) => document.id)).toEqual(documentIds);
  });
  it.each([
    "보고서는 제외하고 주제별로 나눠줘",
    "성능 테스트 자료는 빼고 학습 노트만 모아줘",
    "회사별로 나누고 각 회사 안에서는 중요도 5단계로 정리해줘",
    "내용 언어별로, 제목 언어는 무시해줘",
    "중요도가 높은 자료만 위험 검토 폴더로",
    "알아서 보기 편하게 해줘",
  ])("passes arbitrary instructions unchanged without keyword-imposed restrictions: %s", async instruction => {
    await organizeSample({ ...input(), instruction }, context());
    const request = generate.mock.calls[0][0];
    expect(JSON.parse(request.input).instruction).toBe(instruction);
    expect(request.instructions).not.toContain("The user asked for REPORTS");
    expect(request.instructions).not.toContain("The user requests importance grouping");
    expect(request.instructions).toContain("Only if the user positively requests");
    expect(request.schema.properties.matches.items.properties.destination.items.enum).toBeUndefined();
  });
  it("continues a malformed plan as explicit material questions without inventing an AI proposal", async () => {
    generate.mockRejectedValueOnce(new SampleAiError("unavailable", "invalid-json"));
    const result = await organizeSample({ ...input(), instruction: "내용별 중요성 별로 정리해줄래" }, context());
    expect(result).toMatchObject({ ok: false, reason: "invalid-json", questions: [
      { documentId: "report-1014", kind: "destination" }, { documentId: "perf-lcp", kind: "destination" },
    ] });
    expect(result).not.toHaveProperty("organization");
    expect(generate).toHaveBeenCalledOnce();
    expect(generate.mock.calls[0][4]).toBe("demo");
    expect(generate.mock.calls[0][0].instructions).toContain("Default importance rubric");
  });
  it("keeps provider and session failures closed without recovery questions or retries", async () => {
    generate.mockRejectedValueOnce(new SampleAiError("unavailable", "authorization"));
    expect(await organizeSample(input(), context())).toEqual({ ok: false, code: "unavailable", reason: "authorization" });
    const active = context();
    generate.mockImplementationOnce(async () => { active.token = "revoked"; throw new SampleAiError("unavailable", "invalid-json"); });
    expect(await organizeSample(input(), active)).toEqual({ ok: false, code: "session" });
    expect(generate).toHaveBeenCalledTimes(2);
  });
  it("does not ask recovery questions for explicitly excluded materials", async () => {
    generate.mockRejectedValueOnce(new SampleAiError("unavailable", "invalid-json"));
    expect(await organizeSample({ ...input(), context: { reference: null, destination: null, answers: [{ documentId: "perf-lcp", exclude: true }] } }, context()))
      .toMatchObject({ ok: false, questions: [{ documentId: "report-1014" }] });
    expect(generate).toHaveBeenCalledOnce();
  });
  it("keeps a verified match while isolating only the document with a changed quote", async () => {
    const document = getSampleCatalog().documents.find(document => document.id === "perf-lcp")!;
    generate.mockResolvedValueOnce({ value: { summary: "검토할 제안", matches: [
      { documentId: "report-1014", destination: ["보고서"], evidence: "본문과 다른 문장입니다.", date: null },
      { documentId: document.id, destination: ["성능"], evidence: document.excerpt.slice(0, 25), date: null },
    ], held: [], questions: [] }, model: "fixture", usage: { inputTokens: 2, outputTokens: 2, totalTokens: 4 } });
    const result = await organizeSample(input(), context());
    expect(result).toMatchObject({ ok: true, organization: { matches: [{ documentId: "perf-lcp" }], held: [{ documentId: "report-1014" }] } });
    expect(generate).toHaveBeenCalledOnce();
  });
  it("processes all 84 provided excerpts in bounded batches with the common importance contract", async () => {
    generate.mockImplementation(async (request: { input: string }) => {
      const payload = JSON.parse(request.input);
      return { value: { summary: "중요도 제안", matches: payload.documents.filter((document: { excerpt: string }) => document.excerpt.length >= 8).map((document: { id: string; excerpt: string }) => ({
        documentId: document.id, destination: ["상"], evidence: document.excerpt.slice(0, 30), date: null,
      })), held: payload.documents.filter((document: { excerpt: string }) => !document.excerpt).map((document: { id: string }) => ({ documentId: document.id, reason: "빈 자료여서 분류 근거가 없어요" })),
      questions: payload.documents.filter((document: { excerpt: string }) => !document.excerpt).map((document: { id: string }) => ({ documentId: document.id, kind: "destination" })) }, model: "fixture", usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 } };
    });
    const result = await organizeSample({ ...input(), documentIds: getSampleCatalog().documents.map(document => document.id), instruction: "중요도에 따라 상 중 하로 분류해줘" }, context());
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw Error("expected proposal");
    expect(result.organization.matches).toHaveLength(83);
    expect(result.organization.held.map(item => item.documentId)).toEqual(["empty-note"]);
    expect(reserve).toHaveBeenCalledOnce();
    expect(generate).toHaveBeenCalledTimes(5);
    expect(result.usage.totalTokens).toBe(150);
    expect(generate.mock.calls[0][0].instructions).toContain("Default importance rubric");
  });
  it("keeps malformed JSON and ungrounded evidence failures distinct without retrying", async () => {
    generate.mockRejectedValueOnce(new SampleAiError("unavailable", "invalid-json"));
    expect(await organizeSample(input(), context())).toMatchObject({ ok: false, reason: "invalid-json" });
    generate.mockResolvedValueOnce({ value: { summary: "잘못된 근거", matches: [{ documentId: "report-1014", destination: ["보고서"], evidence: "존재하지 않는 원문을 만든 답변입니다", date: null }], held: [] }, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, model: "fixture" });
    expect(await organizeSample(input(), context())).toMatchObject({ ok: true, organization: { matches: [], held: [{ documentId: "report-1014" }] }, questions: [{ documentId: "report-1014" }] });
    expect(generate).toHaveBeenCalledTimes(2);
  });
  it("validates review answers before quota and rejects client controlled live-review policy", async () => {
    expect(await organizeSample({ ...input(), context: { reference: null, destination: null, answers: [{ documentId: "forged", destination: ["회의"] }] } }, context())).toMatchObject({ ok: false, code: "input" });
    expect(await organizeSample({ ...input(), context: { reference: null, destination: null, answers: [], liveReview: false } }, context())).toMatchObject({ ok: false, code: "input" });
    expect(reserve).not.toHaveBeenCalled();
  });
  it("sends server-owned excerpts and the explicit instruction, with one bounded reservation", async () => {
    expect(await organizeSample(input(), context())).toMatchObject({ ok: true, organization: { matches: [{ documentId: "report-1014" }] } });
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledTimes(1);

    const request = JSON.parse(generate.mock.calls[0][0].input);

    expect(request.documents).toHaveLength(2);
    expect(request.documents[0].excerpt).toContain("2026년 10월 14일");
    expect(JSON.stringify(request)).not.toMatch(/assetBase64|expectedContentDate|allowedFolderIds/);
  });
  it.each([{ consent: false }, { documentIds: ["private"] }, { documentIds: ["report-1014", "report-1014"] }, { excerpt: "private body" }, { model: "paid" }, { instruction: " " }])("rejects invalid consent/scope/client input (%j)", async extra => {
    expect(await organizeSample({ ...input(), ...extra }, context())).toMatchObject({ ok: false, code: "input" });
    expect(reserve).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
  it("rejects invalid sessions/origin and fails closed before provider on quota denial", async () => {
    expect(await organizeSample(input(), { ...context(), token: "forged" })).toMatchObject({ ok: false, code: "session" });
    expect(await organizeSample(input(), { ...context(), origin: "https://evil.invalid" })).toMatchObject({ ok: false, code: "origin" });
    reserve.mockResolvedValue({ allowed: false, retryAfter: 20 });
    expect(await organizeSample(input(), context())).toEqual({ ok: false, code: "limit", retryAfter: 20 });
    expect(generate).not.toHaveBeenCalled();
  });
  it("never returns a fabricated citation or silently substitutes a prepared answer", async () => {
    generate.mockResolvedValue({
      model: "fixture",
      usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
      value: {
        summary: "잘못된 답",
        matches: [{ documentId: "report-1014", destination: ["보고서"], evidence: "본문에 없는 문장을 만들었습니다.", date: null }],
        held: []
      }
    });
    expect(await organizeSample(input(), context())).toMatchObject({ ok: true, organization: { matches: [], held: [{ documentId: "report-1014" }] } });
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it("does not carry report/date-filter policy into an unrestricted topic request", async () => {
    await organizeSample({ ...input(), instruction: "웹사이트 성능 테스트 자료 모아 줘" }, context());

    const policy = generate.mock.calls[0][0].instructions as string;

    expect(policy).toContain("If no positive time filter was requested");
    expect(policy).not.toContain("The user asked for REPORTS");
    expect(policy).not.toContain("September/November");
  });
  it.each([
    "웹사이트 성능 테스트 자료를 모아 줘. 날짜별 정리는 하지 마.",
    "10월 성능 테스트 자료를 모아 줘. 날짜별 정리는 하지 마.",
  ])("respects negated grouping without asserting that date grouping was requested (%s)", async instruction => {
    await organizeSample({ ...input(), instruction }, context());

    const policy = generate.mock.calls[0][0].instructions as string;

    expect(policy).not.toContain("The user requested a date scope/grouping.");
    expect(policy).toContain("Respect negated time constraints");
    expect(policy).toContain("Filtering a period does not imply date grouping");
  });
  it("distinguishes unknown dates from confirmed out-of-period dates and describes a proposal", async () => {
    await organizeSample({ ...input(), instruction: "10월 성능 자료만 모으고 날짜가 없으면 보류해. 날짜별 정리는 하지 마." }, context());

    const policy = generate.mock.calls[0][0].instructions as string;

    expect(policy).toContain("Confirmed dates outside the requested period must be OMITTED, never held");
    expect(policy).toContain("summary describes a PROPOSAL awaiting review");
  });
});
