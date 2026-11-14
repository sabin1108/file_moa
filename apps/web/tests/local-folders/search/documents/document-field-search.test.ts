import { describe, expect, it } from "vitest";
import { findTextEvidence, inferFindRequest, isFindEvidence, type FindQuery } from "../../../../src/features/local-folders/search/documents/document-find";

const query: FindQuery = { terms: ["다온소프트", "지원서"], from: null, to: null, basis: "body" };
const source = { name: "다온소프트.md", path: ["지원 준비", "다온소프트.md"] };

describe("FIND-008: evidence across document fields", () => {
  it("combines a target in the filename with a type in the body", () => {
    expect(findTextEvidence("지원서 초안을 검토한다.", query, undefined, source)).toMatchObject({
      kind: "matched", matches: { name: ["다온소프트"], path: [], body: ["지원서"] },
    });
  });

  it("combines a folder target and a body term without treating the filename as the folder", () => {
    expect(findTextEvidence("지원서 초안", query, undefined, { name: "memo.md", path: ["다온소프트", "memo.md"] })).toMatchObject({
      matches: { name: [], path: ["다온소프트"], body: ["지원서"] },
    });
  });

  it("returns name-only evidence without inventing a matching body", () => {
    const result = findTextEvidence("본문에는 다른 설명만 있다.", query, undefined, { name: "다온소프트 지원서.md", path: ["다온소프트 지원서.md"] });

    expect(result).toMatchObject({ matches: { name: query.terms, path: [], body: [] } });
    expect(result?.evidence.some(line => line.includes("파일 이름"))).toBe(true);
    expect(isFindEvidence(result)).toBe(true);
  });

  it("keeps every confirmed term instead of returning another company's application", () => {
    expect(findTextEvidence("지원서", query, undefined, { name: "다른회사 지원서.md", path: ["지원서", "다른회사 지원서.md"] })).toBeNull();
  });

  it("does not interpret a filename date as a date in the body", () => {
    expect(findTextEvidence("지원서", { ...query, from: "2026-10-01", to: "2026-10-31" }, undefined, { name: "다온소프트 2026-10-15.md", path: ["다온소프트 2026-10-15.md"] })?.kind).toBe("date-unknown");
  });

  it("still rejects an explicit modification date outside the period", () => {
    expect(findTextEvidence("지원서", { ...query, from: "2026-10-01", to: "2026-10-31", basis: "modified" }, new Date(2026, 10, 1).getTime(), source)).toBeNull();
  });

  it("preserves technical identifiers instead of losing their punctuation", () => {
    expect(inferFindRequest("C++ C# .NET Next.js 찾아줘").terms).toBe("C++ C# .NET Next.js");
  });

  it("rejects malformed field evidence at the Worker response boundary", () => {
    const valid = { kind: "matched", dates: [], evidence: ["근거"], matches: { name: ["다온소프트"], path: [], body: [] } };

    expect(isFindEvidence(valid)).toBe(true);
    expect(isFindEvidence({ ...valid, matches: { name: "wrong", path: [], body: [] } })).toBe(false);
    expect(isFindEvidence({ ...valid, matches: { name: Array(9).fill("too many"), path: [], body: [] } })).toBe(false);
  });
});
