import { describe, expect, it } from "vitest";
import { confirmFindQuery, findTextEvidence, inferFindRequest } from "../../../../src/features/local-folders/search/documents/document-find";

const query = (request: string) => confirmFindQuery({ ...inferFindRequest(request), month: "all" }, false, 2026);
const source = (name: string, folder = "자료") => ({ name, path: [folder, name] });

describe("RAG-S01~04: preserved query conditions and bounded related candidates", () => {
  it("keeps a named target mandatory while retaining a document type as an explained preference", () => {
    const request = "가온센터 이력서 찾아줘";
    const filters = inferFindRequest(request);
    const q = confirmFindQuery({ ...filters, month: "all" }, false, 2026);

    expect(filters.terms).toBe("가온센터");
    expect(filters.preferred).toBe("이력서");
    expect(findTextEvidence("지원 준비 기록", q, undefined, source("가온센터 메모.md")))
      .toMatchObject({ relevance: { kind: "related", missing: ["이력서"] } });
    expect(findTextEvidence("이력서", q, undefined, source("다른센터.md"))).toBeNull();
  });

  it("does not relax document-type-only queries or delete a requested template", () => {
    const q = query("이력서 양식 찾아줘");

    expect(q.terms).toEqual(["이력서", "양식"]);
    expect(findTextEvidence("이력서", q, undefined, source("자유형식.md"))).toBeNull();
    expect(findTextEvidence("이력서 양식", q, undefined, source("서식.md"))).not.toBeNull();
  });

  it("matches quoted phrases inside one field and enforces explicit exclusions", () => {
    const q = query('Next.js "로그인 오류" -초안 찾아줘');

    expect(findTextEvidence("로그인 오류 해결", q, undefined, source("Next.js.md"))).not.toBeNull();
    expect(findTextEvidence("로그인 뒤 연결 오류", q, undefined, source("Next.js.md"))).toBeNull();
    expect(findTextEvidence("로그인 오류 해결 초안", q, undefined, source("Next.js.md"))).toBeNull();
  });

  it("handles explicit format/path filters without treating them as body terms", () => {
    const q = query("C++ ext:pdf path:연구 찾아줘");

    expect(findTextEvidence("스레드", q, undefined, source("C++.pdf", "연구"))).not.toBeNull();
    expect(findTextEvidence("스레드", q, undefined, source("C++.md", "연구"))).toBeNull();
    expect(findTextEvidence("스레드", q, undefined, source("C++.pdf", "개인"))).toBeNull();
  });

  it("preserves technical identifiers and syntax provenance in the execution plan", () => {
    const q = query("C++ C# .NET Next.js v2.1 ERR_AUTH ext:md 찾아줘");

    expect(q.terms).toEqual(["C++", "C#", ".NET", "Next.js", "v2.1", "ERR_AUTH"]);
    expect(q.plan?.clauses.every(clause => clause.source.text.slice(clause.source.start, clause.source.end) === clause.value)).toBe(true);
  });

  it("never silently truncates overlong searches, phrases or unsupported operators", () => {
    expect(() => query('alpha "unfinished')).toThrow();
    expect(() => query("alpha before:tomorrow")).toThrow();
    expect(() => query("a1 a2 a3 a4 a5 a6 a7 a8 a9")).toThrow();
  });

  it("scopes natural exclusions independently of explicit dates", () => {
    expect(inferFindRequest("가온센터 초안 제외 찾아줘")).toMatchObject({ month: "all", excluded: "초안" });
    expect(inferFindRequest("2026년 10월 가온센터 초안 제외 찾아줘")).toMatchObject({ year: "2026", month: "10", excluded: "초안" });
  });

  it("keeps unchanged raw spans and marks edited conditions as confirmed", () => {
    const filters = inferFindRequest("가온센터 이력서 찾아줘");
    const original = confirmFindQuery(filters, false, 2026);
    const edited = confirmFindQuery({ ...filters, terms: "해솔센터" }, false, 2026);

    expect(original.plan?.clauses.every(clause => clause.source.kind === "request")).toBe(true);
    expect(original.plan?.period?.source.kind).toBe("request");
    expect(edited.plan?.clauses.find(clause => clause.value === "해솔센터")?.source.kind).toBe("confirmed");
  });

  it("does not accept a dotless file as an extension match and normalizes spaced path separators", () => {
    const q = query('C++ ext:pdf path:"연구 / 2026" 찾아줘');

    expect(findTextEvidence("C++", q, undefined, source("pdf", "연구/2026"))).toBeNull();
    expect(findTextEvidence("C++", q, undefined, { name: "note.pdf", path: ["연구", "2026", "note.pdf"] })).not.toBeNull();
    expect(() => query("C++ path:연구 path:2026 찾아줘")).toThrow();
  });

  it("keeps explicitly required types, quoted years, and technical symbols", () => {
    expect(inferFindRequest("가온센터 +이력서 찾아줘")).toMatchObject({ terms: "가온센터 이력서", preferred: "" });
    expect(query('"2026" Next.js 찾아줘').terms).toEqual(["Next.js", "2026"]);
    expect(inferFindRequest("가온센터, 이력서 찾아줘").terms).toBe("가온센터");
  });
  it("preserves punctuation in exact phrases, exclusions and quoted folder filters", () => {
    const q = query('Next.js "로그인 오류!" -"초안!" path:"연구!" 찾아줘');

    expect(findTextEvidence("로그인 오류! 해결", q, undefined, source("Next.js.md", "연구!"))).not.toBeNull();
    expect(findTextEvidence("로그인 오류 해결", q, undefined, source("Next.js.md", "연구!"))).toBeNull();
    expect(findTextEvidence("로그인 오류! 초안!", q, undefined, source("Next.js.md", "연구!"))).toBeNull();
  });
});
