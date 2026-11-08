import { describe, expect, it } from "vitest";
import type { SampleCatalog } from "../../src/shared/sample-contract";
import type { SampleOrganizationResult } from "../../src/shared/sample-organization";
import { createSampleState, restoreSampleState, sampleActiveCatalog, sampleChangePlan, transitionSampleState } from "../../src/features/sample-workspace/lib/sample-state";
const catalog: SampleCatalog = { version: "1", folders: [{ id: "source", label: "받은 자료/팀 공유" }], documents: [
  { id: "one", name: "메모.md", format: "md", sourceFolderId: "source", excerpt: "작성일 2026-10-14. 업무 보고서의 내용입니다.", proposal: { folderId: null, reason: "검토", reviewRequired: true } },
  { id: "unrelated", name: "장보기.txt", format: "txt", excerpt: "채소와 쌀을 샀다.", proposal: { folderId: null, reason: "검토", reviewRequired: true } },
] };
const result: Extract<SampleOrganizationResult, { ok: true }> = { ok: true, model: "gemini-3.5-flash-lite", usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 }, organization: {
  summary: "본문 작성일별로 보고서를 정리합니다.", matches: [{ documentId: "one", destination: ["보고서", "2026-10-14"], evidence: "업무 보고서의 내용입니다.", date: "2026-10-14" }], held: [],
} };
const propose = () => transitionSampleState(catalog, createSampleState(catalog), { type: "organization-propose", instruction: "10월 보고서 날짜별 정리", candidateIds: ["one", "unrelated"], result });
describe("organization plan state", () => {
  it("adds proposed folders, previews the shared plan and moves only matched documents after approval", () => {
    const review = propose();
    expect(review.selected).toEqual(["one"]);
    expect(review.locations).toEqual({ one: "source", unrelated: null });
    expect(sampleChangePlan(catalog, review).directoriesToCreate).toEqual([["정리한 자료", "보고서", "2026-10-14"]]);
    expect(sampleActiveCatalog(catalog, review).folders).toHaveLength(2);
    const applied = transitionSampleState(catalog, review, { type: "apply" });
    expect(applied.locations).toEqual({ one: "custom-1", unrelated: null });
    expect(restoreSampleState(catalog, JSON.stringify(applied))).toEqual(applied);
    const restored = transitionSampleState(catalog, applied, { type: "undo" });
    expect(restored.locations).toEqual({ one: "source", unrelated: null });
    expect(restored.createdFolders).toEqual([]);
  });
  it("drops unapproved folders on back and reuses an already committed folder", () => {
    expect(transitionSampleState(catalog, propose(), { type: "back" }).createdFolders).toEqual([]);
    const applied = transitionSampleState(catalog, propose(), { type: "apply" });
    const again = transitionSampleState(catalog, applied, { type: "intent", instruction: "같은 자료 정리" });
    const next = transitionSampleState(catalog, again, { type: "organization-propose", instruction: "같은 자료 정리", candidateIds: ["one"], result });
    expect(next.createdFolders).toHaveLength(1);
    expect(restoreSampleState(catalog, JSON.stringify(next))).toEqual(next);
  });
  it("rejects corrupt folder history before restoring or undoing", () => {
    const applied = transitionSampleState(catalog, propose(), { type: "apply" });
    applied.lastApplied!.foldersBefore.push({ id: "custom-99", label: "../외부" });
    expect(() => restoreSampleState(catalog, JSON.stringify(applied))).toThrow();
  });
  it("allocates an unused folder ID after restoring a sparse folder set", () => {
    const sparse = propose(); sparse.createdFolders[0].id = "custom-2"; sparse.targets.one = "custom-2";
    const restored = restoreSampleState(catalog, JSON.stringify(sparse));
    const applied = transitionSampleState(catalog, restored, { type: "apply" });
    const start = transitionSampleState(catalog, applied, { type: "intent", instruction: "다른 곳에 정리" });
    const alternate = { ...result, organization: { ...result.organization, matches: result.organization.matches.map(match => ({ ...match, destination: ["새 보고서", "2026-10-14"] })) } };
    const next = transitionSampleState(catalog, start, { type: "organization-propose", instruction: "다른 곳에 정리", candidateIds: ["one"], result: alternate });
    expect(new Set(next.createdFolders.map(folder => folder.id)).size).toBe(next.createdFolders.length);
    expect(next.targets.one).not.toBe("custom-2");
  });
  it("commits only approved destinations and announces undo in the conversation", () => {
    const extended = { ...catalog, folders: [...catalog.folders, { id: "existing", label: "기존 분류" }] };
    const edited = transitionSampleState(extended, propose(), { type: "destination", id: "one", folderId: "existing" });
    expect(sampleChangePlan(extended, edited).directoriesToCreate).toEqual([]);
    const applied = transitionSampleState(extended, edited, { type: "apply" });
    expect(applied.createdFolders).toEqual([]);
    expect(restoreSampleState(extended, JSON.stringify(applied))).toEqual(applied);
    expect(transitionSampleState(extended, applied, { type: "undo" }).messages.at(-1)?.text).toContain("되돌렸어요");
  });
});
