import { describe, expect, it } from "vitest";
import { inferFindRequest } from "../../../../src/features/local-folders/search/documents/document-find";
import { confirmSemanticQuery, semanticEvidence } from "../../../../src/features/local-folders/search/semantic/semantic-query";

describe("SEM-04/05 confirmed meaning and mandatory conditions", () => {
  it("allows a confirmed description without requiring its literal words", () => {
    const filters = { ...inferFindRequest("빵을 만들 때 부피가 커지는 이유"), terms: "", month: "all" };
    const query = confirmSemanticQuery(filters, "빵을 만들 때 부피가 커지는 이유", true);
    const source = { name: "빵 반죽.md", path: ["조리", "빵 반죽.md"] };

    expect(semanticEvidence("효모는 당을 분해하며 기체를 만든다.", query, 1, source, 0.87, 0, 20)).not.toBeNull();
    expect(semanticEvidence("관련 없는 자료", query, 1, source, 0.82, 0, 7)).toBeNull();
    expect(() => confirmSemanticQuery(filters, "부피가 커지는 이유", false)).toThrow();
  });
  it("preserves explicit targets, phrase/exclusion, format/path and date restrictions", () => {
    const original = '가온센터 +Next.js "로그인 오류" -초안 ext:md path:개발 찾아줘';
    const filters = { ...inferFindRequest(original), month: "all" };
    const query = confirmSemanticQuery(filters, "인증이 풀리는 이유", true);
    const source = { name: "가온센터 Next.js.md", path: ["개발", "가온센터 Next.js.md"] };

    expect(semanticEvidence("로그인 오류를 확인했다.", query, 1, source, 0.95, 0, 10)).not.toBeNull();
    expect(semanticEvidence("로그인 오류 초안", query, 1, source, 0.95, 0, 10)).toBeNull();
    expect(semanticEvidence("로그인 뒤 다른 오류", query, 1, source, 0.95, 0, 10)).toBeNull();
    expect(semanticEvidence("로그인 오류", query, 1, { ...source, name: "가온센터 Next.js.pdf", path: ["개발", "가온센터 Next.js.pdf"] }, 0.95, 0, 6)).toBeNull();
    expect(() => confirmSemanticQuery({ ...filters, terms: "가온센터" }, "인증", true)).toThrow();
    const dated = confirmSemanticQuery({ ...inferFindRequest("보고서"), terms: "", year: "2026", month: "10", basis: "body", window: "month" }, "전력 소비", true);
    expect(semanticEvidence("작성일 2026-11-01 전력 소비", dated, 1, source, 0.95, 0, 10)).toBeNull();
  });
});
