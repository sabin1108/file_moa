import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../../src/server/session-guards", () => ({
  requireWorkspace: async () => ({
    userId: "live-review-verification",
    workspaceId: "live-review-verification",
    sessionUserId: "live-review-verification",
    sessionExpiresAt: new Date(Date.now() + 300000).toISOString()
  })
}));
import { organizeLive } from "../../src/server/live-organization";
import { getDatabase } from "../../src/server/database/client";
import type { LiveOrganizationResult } from "../../src/shared/live-organization";
import type { ReviewAnswer } from "../../src/shared/live-organization-review";
import { parseLiveOrganizationResponse } from "../../src/shared/live-organization-review";

if (process.env.MOA_RUN_LIVE_REVIEW_CHECKS !== "1")
  throw Error("Explicit live review opt-in required.");
process.loadEnvFile(resolve("apps/web/.env.local"));
process.env.AI_PROVIDER = "gemini";
const phase = process.env.MOA_LIVE_REVIEW_PHASE ?? "initial";
if (!["initial", "answer", "replay"].includes(phase)) throw Error("Invalid verification phase");
const output = resolve("docs/verification/live-organization-completion");
process.chdir(resolve("apps/web"));
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const documents = [
  {
    name: "합성-날짜보고.md",
    text: "# 합성 성능 실측 보고서\n작성일: 2026-10-01\n검토 기준일: 2026-10-15\n실제 회사와 관계없는 검증 문서입니다. 사이트 성능 측정 결과 LCP 2.8초, CLS 0.01입니다."
  },
  {
    name: "합성-혼합자료.txt",
    text: "개인정보 없는 합성 문서입니다. 회사 웹사이트 성능 실측 결과 LCP 2.6초와 개인 영어 학습 노트가 하나의 문서에 섞여 있습니다. 회사 자료와 개인 공부 중 어느 쪽으로 분류할지는 작성자가 정하지 않았습니다."
  }
].map((document, index) => ({
  id: `document-${index + 1}`,
  name: document.name,
  path: [document.name],
  excerpt: document.text,
  excerptHash: hash(document.text),
  sha256: hash(document.text),
  size: Buffer.byteLength(document.text),
  lastModified: 1
}));
afterAll(async () => {
  if (phase !== "replay") await getDatabase().$disconnect();
});

it("validates grounded questions or explicit answers using synthetic session, actual DB reservation and actual Google", async () => {
  if (phase === "replay") {
    for (const savedPhase of ["initial", "answer"]) {
      const saved = JSON.parse(readFileSync(`${output}/provider-${savedPhase}.json`, "utf8")) as {
        corpusHash: string; answers: ReviewAnswer[]; result: LiveOrganizationResult;
      };
      expect(saved.corpusHash).toBe(hash(JSON.stringify(documents)));
      if (!saved.result.ok) throw Error("Saved provider verification failed");
      const parsed = parseLiveOrganizationResponse({
        ...saved.result.organization,
        questions: (saved.result.questions ?? []).map(({ documentId, kind }) => ({ documentId, kind }))
      }, {
        instruction: "성능 실측 자료를 모아 날짜별로 정리해 줘.",
        documents: documents.map(document => ({ ...document, sourcePath: [] }))
      }, saved.answers);
      expect(parsed).toEqual({ organization: saved.result.organization, questions: saved.result.questions });
    }
    writeFileSync(`${output}/provider-replay.json`, JSON.stringify({
      at: new Date().toISOString(), phases: ["initial", "answer"], passed: true,
      condition: "saved real provider responses parsed by final shared validator; no new DB reservation or model call"
    }, null, 2));
    return;
  }
  let answers: ReviewAnswer[] = [];
  if (phase === "answer") {
    const previous = JSON.parse(readFileSync(`${output}/provider-initial.json`, "utf8")) as {
      result: LiveOrganizationResult;
    };
    if (!previous.result.ok) throw Error("No successful initial review to answer");
    answers = (previous.result.questions ?? []).map(question => {
      if (question.kind === "destination")
        return { documentId: question.documentId, destination: ["혼합자료"] };
      const candidate = question.dates.find(candidate => candidate.label.includes("검토 기준일"));
      if (!candidate) throw Error("Grounded date choice unavailable");
      return { documentId: question.documentId, date: candidate.date, dateLabel: candidate.label };
    });
  }
  const input = {
    requestId: `${Date.now()}:${randomUUID()}`,
    owner: { userId: "live-review-verification", workspaceId: "live-review-verification" },
    consent: true as const,
    request:
      "성능 실측 자료를 모아 날짜별로 정리해 줘. 날짜 의미가 여러 개이면 추측하지 말고 마지막에 확인해 줘. 회사와 개인 주제가 섞인 문서도 임의로 분류하지 말고 함께 물어봐.",
    basis: "",
    scope: { kind: "all" as const },
    reference: null,
    destination: null,
    documents,
    answers
  };
  const started = performance.now();
  const result = await organizeLive(input, new URL(process.env.BETTER_AUTH_URL!).origin);
  mkdirSync(output, { recursive: true });
  writeFileSync(
    `${output}/provider-${phase}.json`,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        condition:
          "synthetic guard/session and public synthetic documents; real production quota store and Google countTokens/generation; not an authenticated user HTTP journey",
        phase,
        requestId: input.requestId,
        corpusHash: hash(JSON.stringify(documents)),
        elapsedMs: performance.now() - started,
        answers,
        result
      },
      null,
      2
    )
  );
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  if (phase === "initial") {
    expect(
      result.questions?.some(
        question => question.documentId === "document-1" && question.kind === "date"
      )
    ).toBe(true);
    expect(
      result.questions?.some(
        question => question.documentId === "document-2" && question.kind === "destination"
      )
    ).toBe(true);
    expect(
      result.questions
        ?.find(question => question.kind === "date")
        ?.dates.some(candidate => candidate.label === "검토 기준일")
    ).toBe(true);
  } else {
    expect(result.organization.held).toEqual([]);
    expect(result.questions).toEqual([]);
    expect(result.organization.matches).toHaveLength(2);
    expect(result.organization.matches.find(match => match.documentId === "document-1")?.date).toBe(
      "2026-10-15"
    );
    expect(
      result.organization.matches.find(match => match.documentId === "document-2")?.destination
    ).toEqual(["혼합자료"]);
  }
}, 60000);
