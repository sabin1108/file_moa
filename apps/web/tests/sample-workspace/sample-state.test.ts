import { describe, expect, it } from "vitest";
import { createSampleState, restoreSampleState, transitionSampleState, sampleChangePlan } from "../../src/features/sample-workspace/lib/sample-state";
import type { SampleCatalog } from "../../src/shared/sample-contract";

const catalog: SampleCatalog = {
  version: "1",
  folders: [{ id: "meeting", label: "업무/회의" }, { id: "learning", label: "학습" }],
  documents: [
    { id: "one", name: "회의.md", format: "md", excerpt: "회의 기록", proposal: { folderId: "meeting", reason: "회의 내용", reviewRequired: false } },
    { id: "two", name: "학습.xlsx", format: "xlsx", excerpt: "학습 표", proposal: { folderId: "learning", reason: "학습 내용", reviewRequired: false } },
    { id: "mixed", name: "혼합.txt", format: "txt", excerpt: "서로 다른 주제", proposal: { folderId: null, reason: "위치 확인 필요", reviewRequired: true } },
  ],
};

const initial = () => transitionSampleState(catalog, createSampleState(catalog), { type: "select", ids: ["one", "two"] });
const review = () => transitionSampleState(catalog, initial(), { type: "propose" });

describe("sample workspace state and shared file plans", () => {
  it("SAMPLE-002 makes proposals without moving samples and uses the shared plan shape", () => {
    const before = initial();
    const state = review();
    expect(state.locations).toEqual(before.locations);
    const plan = sampleChangePlan(catalog, state);
    expect(plan.operation).toBe("move");
    expect(plan.rows).toHaveLength(2);
    expect(plan.conflictCount).toBe(0);
    expect(plan.rows[0]).toMatchObject({ from: ["받은 자료", "회의.md"], to: ["정리한 자료", "업무", "회의", "회의.md"] });
  });

  it("SAMPLE-003 applies only after review and supports explicit destination changes", () => {
    expect(() => transitionSampleState(catalog, initial(), { type: "apply" })).toThrow();
    const edited = transitionSampleState(catalog, review(), { type: "destination", id: "one", folderId: "learning" });
    const applied = transitionSampleState(catalog, edited, { type: "apply" });
    expect(applied.locations).toEqual({ one: "learning", two: "learning", mixed: null });
    expect(applied.phase).toBe("result");
    expect(() => transitionSampleState(catalog, applied, { type: "apply" })).toThrow();
  });

  it("SAMPLE-003 blocks unresolved review documents and unknown destinations", () => {
    const mixed = transitionSampleState(catalog, createSampleState(catalog), { type: "select", ids: ["mixed"] });
    const proposed = transitionSampleState(catalog, mixed, { type: "propose" });
    expect(() => sampleChangePlan(catalog, proposed)).toThrow("sample-review-required");
    expect(() => transitionSampleState(catalog, proposed, { type: "apply" })).toThrow();
    expect(() => transitionSampleState(catalog, proposed, { type: "destination", id: "mixed", folderId: "private" })).toThrow();
    expect(() => transitionSampleState(catalog, proposed, { type: "destination", id: "one", folderId: "meeting" })).toThrow();
    const chosen = transitionSampleState(catalog, proposed, { type: "destination", id: "mixed", folderId: "meeting" });
    expect(transitionSampleState(catalog, chosen, { type: "apply" }).locations.mixed).toBe("meeting");
  });

  it("SAMPLE-004 restores the last applied locations and reset only returns sample state", () => {
    const applied = transitionSampleState(catalog, review(), { type: "apply" });
    const restored = transitionSampleState(catalog, applied, { type: "undo" });
    expect(restored.locations).toEqual(initial().locations);
    expect(restored.lastApplied).toBeNull();
    expect(transitionSampleState(catalog, applied, { type: "reset" })).toEqual(createSampleState(catalog));
  });

  it("SAMPLE-005 restores data without replaying an application", () => {
    const applied = transitionSampleState(catalog, review(), { type: "apply" });
    expect(restoreSampleState(catalog, JSON.stringify(applied))).toEqual(applied);
    expect(restoreSampleState(catalog, JSON.stringify(review()))).toEqual(review());
    expect(() => restoreSampleState(catalog, '{"locations":{"other":"private"}}')).toThrow();
    expect(() => restoreSampleState(catalog, JSON.stringify({ ...applied, locations: { ...applied.locations, one: "private" } }))).toThrow();
    expect(() => restoreSampleState(catalog, JSON.stringify({ ...applied, lastApplied: { ...applied.lastApplied, documentIds: ["one"] } }))).toThrow("invalid-sample-history");
    expect(() => transitionSampleState(catalog, initial(), { type: "select", ids: ["private"] })).toThrow();
  });

  it("SAMPLE-003 keeps shared name conflicts from being applied", () => {
    const applied = transitionSampleState(catalog, review(), { type: "apply" });
    const selected = transitionSampleState(catalog, { ...applied, phase: "select" }, { type: "select", ids: ["one"] });
    const repeated = transitionSampleState(catalog, selected, { type: "propose" });
    expect(sampleChangePlan(catalog, repeated).conflictCount).toBe(1);
    expect(() => transitionSampleState(catalog, repeated, { type: "apply" })).toThrow("sample-plan-conflict");
  });
});
