import { describe, expect, it } from "vitest";
import type { FindDocument } from "../../../../src/features/local-folders/search/documents/document-find";
import { mergeFindDocuments, rankFindDocuments } from "../../../../src/features/local-folders/search/documents/document-find-ranking";

const literal: FindDocument = { name: "release.md", path: ["release.md"], contentAvailable: true, finding: { kind: "matched", dates: [], evidence: ["필수 조건 근거"], matches: { name: ["release"], path: [], body: [] } } };
const semantic: FindDocument = { ...literal, finding: { kind: "matched", dates: [], evidence: ["본문 의미 근거"] }, retrieval: { kind: "semantic", score: 0.91, start: 20, end: 60, partial: false } };

describe("SEM-05 lexical and semantic evidence merge", () => {
  it("preserves both retrieval reasons in one candidate without changing the inputs", () => {
    const merged = mergeFindDocuments([literal], [semantic]);
    expect(merged).toHaveLength(1);
    expect(merged[0].finding.evidence).toEqual(["필수 조건 근거", "본문 의미 근거"]);
    expect(merged[0].retrieval).toEqual({ ...semantic.retrieval, lexical: true });
    expect(merged[0].finding.matches).toEqual(literal.finding.matches);
    expect(literal.retrieval).toBeUndefined();
    expect(literal.finding.evidence).toEqual(["필수 조건 근거"]);
  });
  it("keeps literal field priority when a candidate also has a semantic score", () => {
    const weaker: FindDocument = { ...literal, name: "notes.md", path: ["notes.md"], finding: { ...literal.finding, matches: { name: [], path: [], body: ["release"] } } };
    const merged = mergeFindDocuments([weaker, literal], [semantic]);
    expect(rankFindDocuments(merged)[0].path).toEqual(literal.path);
  });
  it("reserves a distinct semantic excerpt when literal evidence already fills the limit", () => {
    const full: FindDocument = { ...literal, finding: { ...literal.finding, evidence: Array.from({ length: 12 }, (_, i) => `literal-${i}`) } };
    const overlapping: FindDocument = { ...semantic, finding: { ...semantic.finding, evidence: ["literal-0", "semantic-distinct"] } };
    const [merged] = mergeFindDocuments([full], [overlapping]);
    expect(merged.finding.evidence).toHaveLength(12);
    expect(merged.finding.evidence).toContain("literal-0");
    expect(merged.finding.evidence).toContain("semantic-distinct");
  });
  it("never promotes a metadata-only candidate or attaches unverified body evidence", () => {
    const unread = { ...literal, contentAvailable: false };
    expect(mergeFindDocuments([unread], [semantic])).toEqual([unread]);
  });
  it("keeps semantic-only candidates and their score ordering", () => {
    const stronger: FindDocument = { ...semantic, name: "other.md", path: ["other.md"], retrieval: { ...semantic.retrieval!, score: 0.97 } };
    expect(rankFindDocuments(mergeFindDocuments([], [semantic, stronger]))).toEqual([stronger, semantic]);
  });
});
