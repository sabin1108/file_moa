import { describe, expect, it } from "vitest";
import { jsonTextPreview } from "../src/shared/json-text-preview";

describe("demo JSON text preview", () => {
  it("decodes split strings without publishing JSON or plan fields", () => {
    const json = JSON.stringify({ summary: '검토 "안내"\n한글', matches: [{ destination: ["비공개"] }] });
    const expected = '검토 "안내"\n한글';
    for (let index = 0; index <= json.length; index++) expect(expected.startsWith(jsonTextPreview(json.slice(0, index), "summary"))).toBe(true);
    expect(jsonTextPreview(json, "summary")).toBe(expected);
    expect(jsonTextPreview('{"answer":"하\\u', "answer")).toBe("하");
    expect(jsonTextPreview('{"answer":"하\\uAE00', "answer")).toBe("하글");
    expect(jsonTextPreview('{"matches":[{"answer":"x"}]}', "summary")).toBe("");
    expect(jsonTextPreview('{"matches":[{"answer":"nested"}]}', "answer")).toBe("");
    expect(jsonTextPreview(JSON.stringify({ questions: [{ documentId: '"summary":"fake' }], summary: "실제 요약" }), "summary")).toBe("실제 요약");
  });
});
