import { describe, expect, it } from "vitest";
import { compileSearchQuerySuggestion } from "../../src/shared/search-query";

describe("remote search condition provenance", () => {
  it("canonicalizes redundant model roles while retaining the stronger exact phrase", () => {
    const question = 'Next.js "로그인 오류" 초안 말고 찾아줘';
    const result = compileSearchQuerySuggestion({ required: ["Next.js", "로그인 오류"], preferred: ["Next.js"], phrases: ["로그인 오류"], excluded: ["초안"] }, question);

    expect(result.required.map(span => span.text)).toEqual(["Next.js"]);
    expect(result.phrases.map(span => span.text)).toEqual(["로그인 오류"]);
    expect(result.preferred).toEqual([]);
    expect([...result.required, ...result.phrases, ...result.excluded].every(span => question.slice(span.start, span.end) === span.text)).toBe(true);
  });

  it("rejects invented, ambiguous or contradictory conditions", () => {
    const value = (required: string[], excluded: string[] = []) => ({ required, preferred: [], phrases: [], excluded });

    expect(() => compileSearchQuerySuggestion(value(["다른기업"]), "가온센터 찾아줘")).toThrow();
    expect(() => compileSearchQuerySuggestion(value(["가온"]), "가온과 가온 찾아줘")).toThrow();
    expect(() => compileSearchQuerySuggestion(value(["가온"], ["가온"]), "가온 찾아줘")).toThrow();
    expect(() => compileSearchQuerySuggestion(value(["2026"]), "2026년 가온센터 찾아줘")).toThrow("query-date-as-content");
    expect(compileSearchQuerySuggestion(value(["2026"]), '"2026" 찾아줘').required[0].text).toBe("2026");
  });
});
