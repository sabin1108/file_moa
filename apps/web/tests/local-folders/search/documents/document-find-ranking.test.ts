import { describe, expect, it } from "vitest";
import { findTextEvidence, type FindDocument, type FindQuery } from "../../../../src/features/local-folders/search/documents/document-find";
import { rankFindDocuments, retainFindCandidate } from "../../../../src/features/local-folders/search/documents/document-find-ranking";

const query: FindQuery = { terms: ["도담연구소", "보고서"], from: null, to: null, basis: "body" };

function document(path: readonly string[], text: string): FindDocument {
  const name = path.at(-1)!;
  const finding = findTextEvidence(text, query, undefined, { name, path });

  if (!finding) throw new Error("invalid synthetic candidate");

  return { path, name, finding };
}

describe("FIND-009: deterministic field ranking baseline", () => {
  it("retains a stronger late candidate when the result budget is full", () => {
    const candidates: FindDocument[] = [];
    const body = document(["notes.md"], "도담연구소 보고서");
    const name = document(["도담연구소 보고서.md"], "본문");

    expect(retainFindCandidate(candidates, body, 1)).toBe(false);
    expect(retainFindCandidate(candidates, name, 1)).toBe(true);
    expect(candidates).toEqual([name]);
  });
  it("prioritizes explicit filename matches, then parent paths, then body-only matches", () => {
    const body = document(["notes.md"], "도담연구소 보고서");
    const path = document(["도담연구소", "notes.md"], "보고서");
    const name = document(["도담연구소 보고서.md"], "다른 본문");
    const input = [body, path, name];

    expect(rankFindDocuments(input)).toEqual([name, path, body]);
    expect(input).toEqual([body, path, name]);
  });

  it("keeps confirmed dates ahead of uncertain dates regardless of field weight", () => {
    const uncertain = { ...document(["도담연구소 보고서.md"], "본문"), finding: { ...document(["도담연구소 보고서.md"], "본문").finding, kind: "date-unknown" as const } };
    const confirmed = document(["notes.md"], "도담연구소 보고서");

    expect(rankFindDocuments([uncertain, confirmed])[0]).toBe(confirmed);
  });

  it("uses the path as a stable tie break without adding unrelated candidates", () => {
    const a = document(["a.md"], "도담연구소 보고서");
    const b = document(["b.md"], "도담연구소 보고서");

    expect(rankFindDocuments([b, a])).toEqual([a, b]);
  });
});
