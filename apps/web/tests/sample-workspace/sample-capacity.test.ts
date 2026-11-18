import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SampleCatalog } from "../../src/shared/sample-contract";
import type { SampleOrganizationAction } from "../../src/shared/sample-organization";
import { sampleMaterialsSchema } from "../../src/shared/sample-materials";
import { SampleWorkspaceStore } from "../../src/features/sample-workspace/sample-workspace-store";
import { createSampleState, restoreSampleState, sampleSelectedMaterials } from "../../src/features/sample-workspace/sample-state";
import { createSampleEntry, createSampleFiles, prepareSampleFileOperation } from "../../src/features/sample-workspace/files/sample-file-workspace";

function catalog(count: number, characters = 500): SampleCatalog {
  return { version: "1", folders: [{ id: "work", label: "업무" }], documents: Array.from({ length: count }, (_, index) => ({
    id: `doc-${index}`, name: `${index.toString().padStart(3, "0")}.md`, format: "md", excerpt: `검증 문서 ${index}의 현재 기술 내용을 설명합니다. `.padEnd(characters, "가"),
    proposal: { folderId: "work", reason: "기술 자료", reviewRequired: false },
  })) };
}
const subscriptions: (() => void)[] = [];
afterEach(() => subscriptions.splice(0).forEach(close => close()));

describe("demo capacity boundaries with current materials", () => {
  it("prepares, transfers, applies, reloads and undoes 100 documents / 50,000 characters", async () => {
    const source = catalog(100);
    const store = new SampleWorkspaceStore(source, { kind: "sample", id: "capacity", expiresAt: Date.now() + 3_600_000, version: "1" }, () => ({ getItem: () => null, setItem: () => {} }));
    subscriptions.push(store.subscribe(() => {}));
    const initial = createSampleFiles(source, createSampleState(source).locations);
    expect(store.dispatch({ type: "file-workspace", files: initial })).toBe(true);
    store.organization.update({ request: "현재 기술 자료 정리", basis: "주제별", scope: { kind: "all" } });
    const start = performance.now();
    await store.organization.prepare();
    const prepareMs = performance.now() - start;
    expect(store.organization.getSnapshot().snapshot?.documents).toHaveLength(100);
    const ids = source.documents.map(document => document.id);
    expect(store.dispatch({ type: "select-question", ids })).toBe(true);
    const documents = sampleSelectedMaterials(source, store.getSnapshot().state, ids);
    expect(documents.reduce((sum, document) => sum + document.excerpt.length, 0)).toBe(50_000);
    const action = vi.fn<SampleOrganizationAction>(async input => ({ ok: true, model: "fixture", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      organization: { summary: "100개 현재 자료의 계획", matches: input.documents!.map(document => ({ documentId: document.id, destination: ["기술"], evidence: document.excerpt.slice(0, 40), date: null })), held: [] },
    }));
    await store.requestOrganization(action, "현재 자료를 기술별로 정리", ids);
    expect(action.mock.calls[0][0].documents).toEqual(documents);
    expect(store.getSnapshot().state.phase).toBe("review");
    const applyStart = performance.now();
    expect(store.dispatch({ type: "apply" })).toBe(true);
    const applyMs = performance.now() - applyStart;
    expect(store.getSnapshot().state.files?.archives).toHaveLength(1);
    const serialized = JSON.stringify(store.getSnapshot().state);
    const restoreStart = performance.now();
    expect(restoreSampleState(source, serialized).phase).toBe("result");
    const restoreMs = performance.now() - restoreStart;
    expect(store.dispatch({ type: "undo" })).toBe(true);
    expect(store.getSnapshot().state.files?.nodes).toEqual(initial.nodes);
    const output = resolve(".omx/verification/demo-full-qa-20261118");
    mkdirSync(output, { recursive: true });
    writeFileSync(`${output}/capacity.json`, JSON.stringify({ documents: 100, characters: 50_000, serializedCharacters: serialized.length, prepareMs, applyMs, restoreMs,
      condition: "Node lab, synthetic data, injected action; no paid AI, browser paint or field INP claim" }, null, 2));
  });

  it("rejects one extra document or one extra excerpt character", () => {
    const source = catalog(101);
    const state = createSampleState(source);
    expect(() => sampleSelectedMaterials(source, state, source.documents.map(document => document.id))).toThrow();
    const allowed = sampleSelectedMaterials(source, state, source.documents.slice(0, 100).map(document => document.id));
    expect(sampleMaterialsSchema.safeParse(allowed).success).toBe(true);
    expect(sampleMaterialsSchema.safeParse(allowed.map((document, index) => index ? document : { ...document, excerpt: document.excerpt + "가" })).success).toBe(false);
  });

  it("allows 300 nodes and rejects a 301st without mutating the tree", () => {
    let files = createSampleFiles(catalog(1), { "doc-0": null });
    while (files.nodes.length < 300) files = createSampleEntry(files, ["받은 자료"], `new-${files.nodes.length}`, "md");
    const before = JSON.stringify(files);
    expect(() => createSampleEntry(files, ["받은 자료"], "overflow", "md")).toThrow();
    expect(JSON.stringify(files)).toBe(before);
  });

  it("preserves all 30 archives and rejects the next edit atomically", () => {
    let files = createSampleFiles(catalog(1), { "doc-0": null });
    const edit = (text: string) => ({ kind: "edit" as const, source: ["받은 자료"], names: ["000.md"], destination: [], text });
    for (let index = 0; index < 30; index++) files = prepareSampleFileOperation(files, edit(`내용 ${index}`)).next;
    expect(files.archives).toHaveLength(30);
    const before = JSON.stringify(files);
    expect(() => prepareSampleFileOperation(files, edit("overflow"))).toThrow();
    expect(JSON.stringify(files)).toBe(before);
  });
});
