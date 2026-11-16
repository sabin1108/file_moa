import { describe, expect, it } from "vitest";
import { confirmFindQuery, inferFindRequest } from "../../../../src/features/local-folders/search/documents/document-find";
import { confirmSemanticQuery, semanticEvidence } from "../../../../src/features/local-folders/search/semantic/semantic-query";

describe("SEM-04/05 confirmed meaning and mandatory conditions", () => {
  it.each(["올해", "작년", "재작년", "2025년"])("rejects removing the original %s restriction in semantic mode only", year => {
    const filters = { ...inferFindRequest(`${year} 회의 자료 찾아줘`, 2026), month: "all" };
    expect(() => confirmSemanticQuery(filters, "회의에서 결정한 내용", true, 2026)).toThrow("semantic-protected-period");
    expect(confirmFindQuery(filters, false, 2026)).toMatchObject({ from: null, to: null });
  });
  it.each(["2026년 10월 회의일 기준 회의 자료 찾아줘", "2026년 9월부터 10월까지 회의일 기준 회의 자료 찾아줘"])("preserves an explicit period and rejects widening it: %s", request => {
    const filters = inferFindRequest(request, 2026);
    const query = confirmSemanticQuery(filters, "회의에서 결정한 내용", true, 2026);
    expect(query.from).not.toBeNull();
    expect(query.to).toBe("2026-10-31");
    expect(query.semantic.lexical?.from).toBe(query.from);
    expect(() => confirmSemanticQuery({ ...filters, month: "all" }, "회의에서 결정한 내용", true, 2026)).toThrow("semantic-protected-period");
    expect(confirmFindQuery({ ...filters, month: "all" }, false, 2026)).toMatchObject({ from: null, to: null });
  });
  it("allows a confirmed description without requiring its literal words", () => {
    const filters = { ...inferFindRequest("빵을 만들 때 부피가 커지는 이유"), terms: "", month: "all" };
    const query = confirmSemanticQuery(filters, "빵을 만들 때 부피가 커지는 이유", true, 2026);
    const source = { name: "빵 반죽.md", path: ["조리", "빵 반죽.md"] };

    expect(semanticEvidence("효모는 당을 분해하며 기체를 만든다.", query, 1, source, 0.87, 0, 20)).not.toBeNull();
    expect(semanticEvidence("관련 없는 자료", query, 1, source, 0.82, 0, 7)).toBeNull();
    expect(() => confirmSemanticQuery(filters, "부피가 커지는 이유", false, 2026)).toThrow();
  });
  it("preserves explicit targets, phrase/exclusion, format/path and date restrictions", () => {
    const original = '가온센터 +Next.js "로그인 오류" -초안 ext:md path:개발 찾아줘';
    const filters = { ...inferFindRequest(original), month: "all" };
    const query = confirmSemanticQuery(filters, "인증이 풀리는 이유", true, 2026);
    const source = { name: "가온센터 Next.js.md", path: ["개발", "가온센터 Next.js.md"] };

    expect(semanticEvidence("로그인 오류를 확인했다.", query, 1, source, 0.95, 0, 10)).not.toBeNull();
    expect(semanticEvidence("로그인 오류 초안", query, 1, source, 0.95, 0, 10)).toBeNull();
    expect(semanticEvidence("로그인 뒤 다른 오류", query, 1, source, 0.95, 0, 10)).toBeNull();
    expect(semanticEvidence("로그인 오류", query, 1, { ...source, name: "가온센터 Next.js.pdf", path: ["개발", "가온센터 Next.js.pdf"] }, 0.95, 0, 6)).toBeNull();
    expect(() => confirmSemanticQuery({ ...filters, terms: "가온센터" }, "인증", true, 2026)).toThrow();
    const dated = confirmSemanticQuery({ ...inferFindRequest("보고서"), terms: "", year: "2026", month: "10", basis: "body", window: "month" }, "전력 소비", true, 2026);
    expect(semanticEvidence("작성일 2026-11-01 전력 소비", dated, 1, source, 0.95, 0, 10)).toBeNull();
  });
});
