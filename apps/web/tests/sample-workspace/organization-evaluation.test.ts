import { mkdirSync, writeFileSync } from "node:fs";
import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { getSampleCatalog } from "../../src/server/sample-catalog";
import { selectOrganizationCandidates } from "../../src/features/sample-workspace/lib/organization-candidates";
import fixture from "../../../../tests/fixtures/classification/request-evaluation.json";
import legacy from "../../../../tests/fixtures/classification/v1/dataset.json";
import { corpusDigest, evaluateOrganizationResponse, expectedResponse, holdoutDocuments, scopedEvaluationDocuments } from "./organization-evaluation";

const catalog = getSampleCatalog();
const publicDocuments = catalog.documents.map(({ id, name, excerpt, sourceFolderId }) => ({ id, name, excerpt,
  sourcePath: (catalog.folders.find(folder => folder.id === sourceFolderId)?.label ?? "받은 자료").split("/") }));
const results: { id: string; split: string; scopeCount: number; candidateCount: number; candidateIds: string[]; characters: number; required: number; retained: number; missingIds: string[] }[] = [];

describe("versioned request evaluation dataset", () => {
  it("pins both corpora and keeps holdout families and IDs outside the public sample", () => {
    expect(fixture.reviewStatus).toBe("unreviewed");
    expect(new Set(fixture.cases.map(scenario => scenario.id)).size).toBe(fixture.cases.length);
    expect(fixture.cases.filter(scenario => scenario.split === "development")).toHaveLength(40);
    expect(fixture.cases.filter(scenario => scenario.split === "holdout")).toHaveLength(4);
    expect(publicDocuments).toHaveLength(fixture.corpus.development.documents);
    expect(holdoutDocuments).toHaveLength(fixture.corpus.holdout.documents);
    expect(corpusDigest(publicDocuments)).toBe(fixture.corpus.development.sha256);
    expect(corpusDigest(holdoutDocuments)).toBe(fixture.corpus.holdout.sha256);
    const developmentFamilies = new Set(legacy.documents.filter(document => document.split === "development").map(document => document.family));
    expect(fixture.corpus.holdout.families.every(family => !developmentFamilies.has(family))).toBe(true);
    expect(holdoutDocuments.every(document => !publicDocuments.some(candidate => candidate.id === document.id))).toBe(true);
    expect(fixture.intentGroups).toHaveLength(12);
    for (const group of fixture.intentGroups) {
      expect(fixture.cases.some(scenario => scenario.split === "development" && scenario.intentId === group.id)).toBe(true);
    }
    expect(fixture.unsupportedCandidates.every(candidate => candidate.status === "not-supported" && candidate.reason.length > 0)).toBe(true);
    expect(new Set(fixture.liveSelection).size).toBe(6);
    for (const id of fixture.liveSelection) {
      expect(fixture.cases.some(scenario => scenario.id === id && scenario.split === "development")).toBe(true);
    }
  });

  for (const scenario of fixture.cases) {
    const documents = scopedEvaluationDocuments(scenario, scenario.split === "holdout" ? holdoutDocuments : publicDocuments);
    it(`${scenario.id}: has exhaustive, disjoint expectations and grounded contract examples`, () => {
      expect(documents.length).toBeGreaterThan(0);
      const ids = [...scenario.expected.matches.map(item => item.documentId), ...scenario.expected.heldIds, ...scenario.expected.excludedIds];
      expect(ids.length).toBe(new Set(ids).size);
      expect([...ids].sort()).toEqual(documents.map(document => document.id).sort());
      expect(scenario.specIds).toContain("CO-005");
      expect(fixture.intentGroups.some(group => group.id === scenario.intentId)).toBe(true);
      expect(scenario.forbidden).toContain("write-before-review");
      const result = evaluateOrganizationResponse(expectedResponse(scenario), scenario, documents);
      expect(result.passed).toBe(true);
      expect(result.violations).toEqual([]);
    });

    it(`${scenario.id}: retains required matches and holds within the input budget`, () => {
      const candidates = selectOrganizationCandidates(documents, scenario.instruction);
      const candidateIds = candidates.map(document => document.id);
      const requiredIds = [...scenario.expected.matches.map(item => item.documentId), ...scenario.expected.heldIds];
      const missingIds = requiredIds.filter(id => !candidateIds.includes(id));
      const characters = candidates.reduce((sum, document) => sum + JSON.stringify({ id: document.id, name: document.name, excerpt: document.excerpt }).length + 100, scenario.instruction.length);
      results.push({ id: scenario.id, split: scenario.split, scopeCount: documents.length, candidateCount: candidates.length,
        candidateIds, characters, required: requiredIds.length, retained: requiredIds.length - missingIds.length, missingIds });
      expect(candidateIds.every(id => documents.some(document => document.id === id))).toBe(true);
      expect(candidates.length).toBeLessThanOrEqual(40);
      expect(characters).toBeLessThanOrEqual(6000);
      expect(missingIds).toEqual([]);
    });
  }
});

describe("answer evaluator rejects deliberately wrong responses", () => {
  const scenario = fixture.cases.find(item => item.id === "selected-only")!;
  const documents = scopedEvaluationDocuments(scenario, publicDocuments);
  it.each([
    ["missing match", "missing-match:perf-inp", (answer: ReturnType<typeof expectedResponse>) => { answer.matches = []; }],
    ["wrong safe destination", "wrong-destination:perf-inp", (answer: ReturnType<typeof expectedResponse>) => { answer.matches[0].destination = ["다른 폴더"]; }],
    ["fabricated quote", "invalid-response", (answer: ReturnType<typeof expectedResponse>) => { answer.matches[0].evidence = "본문에 존재하지 않는 성능 측정 결과입니다."; }],
    ["out of scope ID", "invalid-response", (answer: ReturnType<typeof expectedResponse>) => { answer.matches[0].documentId = "perf-lcp"; }],
    ["duplicate ID", "invalid-response", (answer: ReturnType<typeof expectedResponse>) => { answer.matches.push(structuredClone(answer.matches[0])); }],
    ["path traversal", "invalid-response", (answer: ReturnType<typeof expectedResponse>) => { answer.matches[0].destination = [".."]; }],
    ["invented date", "invalid-response", (answer: ReturnType<typeof expectedResponse>) => { answer.matches[0].date = "2026-10-01"; answer.matches[0].destination = ["2026-10-01"]; }],
    ["date folder with null date", "invalid-response", (answer: ReturnType<typeof expectedResponse>) => { answer.matches[0].destination = ["2026-10-01"]; }],
    ["irrelevant grounded match", "unexpected-match:recipe", (answer: ReturnType<typeof expectedResponse>) => { answer.matches.push({ documentId: "recipe", evidence: "양파와 감자를 썰고 국을 끓인다.", destination: ["성능 테스트"], date: null }); }],
    ["unnecessary hold", "unexpected-hold:recipe", (answer: ReturnType<typeof expectedResponse>) => { answer.held.push({ documentId: "recipe", reason: "불필요한 보류" }); }],
  ] as const)("%s", (_label, violation, mutate) => {
    const answer = expectedResponse(scenario);
    mutate(answer);
    const result = evaluateOrganizationResponse(answer, scenario, documents);
    expect(result.passed).toBe(false);
    expect(result.violations).toContain(violation);
  });

  it("detects missing holds even when the response passes the production parser", () => {
    const ambiguous = fixture.cases.find(item => item.id === "uncertain-report-date")!;
    const answer = expectedResponse(ambiguous);
    answer.held = [];
    expect(evaluateOrganizationResponse(answer, ambiguous, scopedEvaluationDocuments(ambiguous, publicDocuments)).violations)
      .toEqual(["missing-hold:report-unknown", "missing-hold:report-ambiguous"]);
  });

  it("rejects holding a confirmed November measurement for an October-only request", () => {
    const october = fixture.cases.find(item => item.id === "october-performance-no-date-folders")!;
    const answer = expectedResponse(october);
    answer.held.push({ documentId: "perf-longtask", reason: "11월 자료여서 10월이 아닙니다." });
    expect(evaluateOrganizationResponse(answer, october, scopedEvaluationDocuments(october, publicDocuments)).violations)
      .toContain("unexpected-hold:perf-longtask");
  });

  it("accepts alternative exact body evidence without requiring the fixture quote verbatim", () => {
    const answer = expectedResponse(scenario);
    answer.matches[0].evidence = "검색창 입력 지연을 웹사이트 성능 테스트에서 재현했다.";
    expect(evaluateOrganizationResponse(answer, scenario, documents).violations).toEqual([]);
  });

  it("detects an unnecessary confirmed date when the request asks for topic-only grouping", () => {
    const performance = fixture.cases.find(item => item.id === "document-injection")!;
    const answer = expectedResponse(performance);
    answer.matches[0].date = "2026-10-03";
    answer.matches[0].destination = ["성능 테스트", "2026-10-03"];
    expect(evaluateOrganizationResponse(answer, performance, scopedEvaluationDocuments(performance, publicDocuments)).violations)
      .toContain("wrong-date:perf-lcp");
  });
});

afterAll(() => {
  if (process.env.MOA_ORGANIZATION_REPORT !== "1") return;
  const path = "docs/verification/organization-evaluation";
  mkdirSync(path, { recursive: true });
  const splits = ["development", "holdout"].map(split => {
    const cases = results.filter(result => result.split === split);
    const required = cases.reduce((sum, result) => sum + result.required, 0);
    const retained = cases.reduce((sum, result) => sum + result.retained, 0);
    return { split, cases: cases.length, required, retained, requiredIdRecall: required ? retained / required : null,
      passingCases: cases.filter(result => result.missingIds.length === 0).length };
  });
  writeFileSync(`${path}/retrieval-report.json`, JSON.stringify({ at: new Date().toISOString(), version: fixture.version,
    seed: fixture.seed, reviewStatus: fixture.reviewStatus, corpus: fixture.corpus, mode: "offline-shortlist-and-contract",
    modelEvaluation: "not-run", providerCalls: 0, note: "Candidate recall includes required matches and holds, not model relevance accuracy. Empty-target cases do not contribute to recall. Excluded documents may appear in the shortlist.",
    splits, results }, null, 2) + "\n");
});
