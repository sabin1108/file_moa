import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const reserve = vi.hoisted(() => vi.fn());
const generate = vi.hoisted(() => vi.fn());

vi.mock(
  "../../src/server/sample-ai",
  async original => ({ ...await original<typeof import("../../src/server/sample-ai")>(), reserveSampleAi: reserve })
);
vi.mock(
  "../../src/server/ai-generation",
  async original => ({ ...await original<typeof import("../../src/server/ai-generation")>(), generateAiJson: generate })
);

import { organizeSample } from "../../src/server/sample-organization";
import { createSampleSession } from "../../src/server/sample-session";

const input = () => ({
  requestId: crypto.randomUUID(),
  documentIds: ["report-1014", "perf-lcp"],
  instruction: "10월 보고서 날짜별로 정리",
  consent: true
});
const context = () => ({ token: createSampleSession().token, origin: "http://127.0.0.1:3034" });

beforeEach(() => {
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
      value: {
        summary: "잘못된 답",
        matches: [{ documentId: "report-1014", destination: ["보고서"], evidence: "본문에 없는 문장을 만들었습니다.", date: null }],
        held: []
      }
    });
    expect(await organizeSample(input(), context())).toMatchObject({ ok: false, code: "unavailable" });
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
