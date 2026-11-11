import { expect, it } from "vitest";
import {
  buildOrganizationBatches,
  assertOrganizationBaseline
} from "../../../src/features/local-folders/lib/organization-operation";

const documents = [
  {
    id: "document-1",
    name: "a.md",
    path: ["회사", "a.md"],
    sha256: "a".repeat(64),
    excerptHash: "b".repeat(64),
    excerpt: "근거가 있는 성능 결과입니다",
    size: 30,
    lastModified: 42
  },
  {
    id: "document-2",
    name: "b.md",
    path: ["연구", "b.md"],
    sha256: "c".repeat(64),
    excerptHash: "d".repeat(64),
    excerpt: "근거가 있는 연구 결과입니다",
    size: 40,
    lastModified: 43
  }
];
const organization = {
  summary: "제안",
  held: [],
  matches: documents.map(document => ({
    documentId: document.id,
    destination: ["성능"],
    evidence: document.excerpt,
    date: null
  }))
};

it("projects multiple source parents into existing managed requests without expanding the selected files", () => {
  const batches = buildOrganizationBatches(organization, documents, ["정리"], "move");

  expect(batches.map(batch => batch.request)).toEqual([
    { kind: "move", source: ["회사"], names: ["a.md"], destination: ["정리", "성능"] },
    { kind: "move", source: ["연구"], names: ["b.md"], destination: ["정리", "성능"] }
  ]);
  expect(() =>
    buildOrganizationBatches(
      { ...organization, held: [{ documentId: "document-1", reason: "확인 필요" }] },
      documents,
      [],
      "copy"
    )
  ).toThrow();
  expect(() => buildOrganizationBatches(organization, documents.slice(0, 1), [], "copy")).toThrow();
});
it("refuses collisions across groups and any source baseline changed since the model proposal", () => {
  const copy = documents.map(document => ({
    ...document,
    name: "same.md",
    path: [...document.path.slice(0, -1), "same.md"]
  }));

  expect(() => buildOrganizationBatches(organization, copy, [], "copy")).toThrow();

  const nodes = documents.map(document => ({
    path: document.path,
    kind: "file" as const,
    size: document.size,
    modified: document.lastModified,
    sha256: document.sha256
  }));

  expect(() => assertOrganizationBaseline(documents, nodes)).not.toThrow();
  expect(() =>
    assertOrganizationBaseline(documents, [{ ...nodes[0], sha256: "f".repeat(64) }, nodes[1]])
  ).toThrow();
  expect(() => assertOrganizationBaseline(documents, nodes.slice(0, 1))).toThrow();
});
