import { createHash } from "node:crypto";
import { basename } from "node:path";
import { parseOrganizationResponse, type OrganizationDocument, type OrganizationResponse } from "../../src/shared/organization";
import fixture from "../../../../tests/fixtures/classification/request-evaluation.json";
import legacy from "../../../../tests/fixtures/classification/v1/dataset.json";

export type EvaluationCase = (typeof fixture.cases)[number];

export const holdoutDocuments: OrganizationDocument[] = legacy.documents.filter(document => document.split === "holdout")
  .map(document => ({ id: document.id, name: basename(document.file), excerpt: document.excerpt, sourcePath: ["holdout-only"] }));

export function corpusDigest(documents: readonly OrganizationDocument[]): string {
  const canonical = documents.map(({ id, name, excerpt, sourcePath }) => ({ id, name, excerpt, sourcePath }))
    .sort((first, second) => first.id.localeCompare(second.id, "en"));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function scopedEvaluationDocuments(scenario: EvaluationCase, documents: readonly OrganizationDocument[]): OrganizationDocument[] {
  const scope = scenario.scope;
  return documents.filter(document => scope.kind === "all" || (scope.kind === "selected"
    ? scope.documentIds?.includes(document.id)
    : scope.path?.every((part, index) => document.sourcePath[index] === part)));
}

export function expectedResponse(scenario: EvaluationCase): OrganizationResponse {
  return { summary: "계약 검사용 기대 응답", matches: structuredClone(scenario.expected.matches),
    held: scenario.expected.heldIds.map(documentId => ({ documentId, reason: "내용이 섞였거나 날짜·본문이 부족해 확인이 필요합니다." })) };
}

// Labels stay in tests. This checks an answer against the request contract, without calling a model.
export function evaluateOrganizationResponse(value: unknown, scenario: EvaluationCase, documents: readonly OrganizationDocument[]) {
  let response: OrganizationResponse;
  try {
    response = parseOrganizationResponse(structuredClone(value), { instruction: scenario.instruction, documents });
  } catch {
    return { passed: false, violations: ["invalid-response"], matchedIds: [], heldIds: [] };
  }

  const violations: string[] = [];
  const matchedIds = response.matches.map(item => item.documentId);
  const heldIds = response.held.map(item => item.documentId);
  for (const expected of scenario.expected.matches) {
    const actual = response.matches.find(item => item.documentId === expected.documentId);
    if (!actual) violations.push(`missing-match:${expected.documentId}`);
    else {
      if (JSON.stringify(actual.destination) !== JSON.stringify(expected.destination)) violations.push(`wrong-destination:${expected.documentId}`);
      if (actual.date !== expected.date) violations.push(`wrong-date:${expected.documentId}`);
    }
  }
  for (const id of matchedIds) if (!scenario.expected.matches.some(item => item.documentId === id)) violations.push(`unexpected-match:${id}`);
  for (const id of scenario.expected.heldIds) if (!heldIds.includes(id)) violations.push(`missing-hold:${id}`);
  for (const id of heldIds) if (!scenario.expected.heldIds.some(expectedId => expectedId === id)) violations.push(`unexpected-hold:${id}`);
  return { passed: violations.length === 0, violations, matchedIds, heldIds };
}
