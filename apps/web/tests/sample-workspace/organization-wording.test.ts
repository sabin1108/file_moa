import { mkdirSync, writeFileSync } from "node:fs";
import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { getSampleCatalog } from "../../src/server/sample-catalog";
import { selectOrganizationCandidates } from "../../src/features/sample-workspace/lib/organization-candidates";
import { scopedEvaluationDocuments } from "./organization-evaluation";
import fixture from "../../../../tests/fixtures/classification/request-evaluation.json";
import wording from "../../../../tests/fixtures/classification/request-wording-variants.json";

const catalog = getSampleCatalog();
const documents = catalog.documents.map(({ id, name, excerpt, sourceFolderId }) => ({ id, name, excerpt,
  sourcePath: (catalog.folders.find(folder => folder.id === sourceFolderId)?.label ?? "받은 자료").split("/") }));
const results: { id: string; baseCaseId: string; intentId: string; candidateCount: number; missingIds: string[]; characters: number }[] = [];

describe("paired everyday wording variants", () => {
  it("uses one development request from each intent group, without treating wording as a new document split", () => {
    expect(wording.reviewStatus).toBe("unreviewed");
    expect(new Set(wording.variants.map(variant => variant.id)).size).toBe(12);
    const groups = wording.variants.map(variant => fixture.cases.find(scenario => scenario.id === variant.baseCaseId)?.intentId);
    expect(new Set(groups).size).toBe(fixture.intentGroups.length);
  });

  it.each(wording.variants)("$id retains required candidates for the same scope", variant => {
    const base = fixture.cases.find(scenario => scenario.id === variant.baseCaseId)!;
    expect(base.split).toBe("development");
    expect(variant.instruction).not.toBe(base.instruction);
    const scoped = scopedEvaluationDocuments(base, documents);
    const candidates = selectOrganizationCandidates(scoped, variant.instruction);
    const required = [...base.expected.matches.map(item => item.documentId), ...base.expected.heldIds];
    const missingIds = required.filter(id => !candidates.some(document => document.id === id));
    const characters = candidates.reduce((sum, document) => sum + JSON.stringify({ id: document.id, name: document.name, excerpt: document.excerpt }).length + 100, variant.instruction.length);
    results.push({ id: variant.id, baseCaseId: base.id, intentId: base.intentId,
      candidateCount: candidates.length, missingIds, characters });
    expect(missingIds).toEqual([]);
    expect(candidates.length).toBeLessThanOrEqual(40);
    expect(characters).toBeLessThanOrEqual(6000);
    expect(candidates.every(candidate => scoped.some(document => document.id === candidate.id))).toBe(true);
  });
});

afterAll(() => {
  if (process.env.MOA_ORGANIZATION_REPORT !== "1") return;
  const output = "docs/verification/expectation-review";
  mkdirSync(output, { recursive: true });
  writeFileSync(`${output}/wording-report.json`, JSON.stringify({ version: wording.version, reviewStatus: wording.reviewStatus,
    mode: "offline-shortlist-only", providerCalls: 0, modelComprehension: "not-measured", results }, null, 2) + "\n");
});
