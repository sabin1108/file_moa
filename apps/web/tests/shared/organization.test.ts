import { describe, expect, it } from "vitest";
import { contentDates, parseOrganizationResponse, type OrganizationRequest, type OrganizationResponse } from "../../src/shared/organization";

const request: OrganizationRequest = {
  instruction: "10월 보고서 날짜별 정리",
  documents: [{ id: "one", name: "무제.md", sourcePath: ["팀 공유"], excerpt: "작성일: 2026년 10월 14일. 업무 보고서의 내용입니다." }]
};
const response = (): OrganizationResponse => ({
  summary: "본문 날짜로 정리합니다.",
  matches: [{
    documentId: "one",
    destination: ["보고서", "2026-10-14"],
    evidence: "업무 보고서의 내용입니다.",
    date: "2026-10-14"
  }],
  held: []
});

describe("content-grounded organization", () => {
  it("keeps importance-only plans in 상/중/하 with literal evidence and no date grouping", () => {
    const importance = { ...request, instruction: "중요도에 따라 상 중 하로 나뉘어서 분류해줘" };
    for (const level of ["상", "중", "하"]) {
      const value = response();
      value.matches[0].destination = [level];
      value.matches[0].date = null;
      expect(parseOrganizationResponse(value, importance).matches[0].destination).toEqual([level]);
      value.matches[0].date = "2026-10-14";
      expect(() => parseOrganizationResponse(value, importance)).toThrow("invalid-importance-plan");
    }
    const wrong = response();
    wrong.matches[0].date = null;
    wrong.matches[0].destination = ["주제"];
    expect(() => parseOrganizationResponse(wrong, importance)).toThrow("invalid-importance-plan");
    wrong.matches[0].destination = ["상"];
    wrong.matches[0].evidence = "원문에는 없는 중요도 설명입니다.";
    expect(() => parseOrganizationResponse(wrong, importance)).toThrow("ungrounded");
  });
  it("does not enforce importance grouping when the user explicitly refuses it", () => {
    const value = response();
    value.matches[0].date = null;
    value.matches[0].destination = ["주제"];
    expect(parseOrganizationResponse(value, { ...request, instruction: "중요도로 상 중 하 분류하지 말아줘" }).matches[0].destination).toEqual(["주제"]);
  });
  it("matches by body with confirmed Korean content date and new virtual destinations", () => {
    expect(parseOrganizationResponse(response(), request).matches[0].documentId).toBe("one");
    expect(contentDates("2026-02-30 2026.10.14 2026/10/14")).toEqual(["2026-10-14"]);
  });
  it.each(["../비밀", ".", "..", "C:", "CON", "폴더.", "삭제/원본"])("rejects unsafe destination %s", segment => {
    const value = response();

    value.matches[0].destination = [segment];
    expect(() => parseOrganizationResponse(value, request)).toThrow();
  });
  it("rejects unknown/duplicate IDs, fabricated body citations and invented dates", () => {
    const unknown = response();

    unknown.matches[0].documentId = "other";
    expect(() => parseOrganizationResponse(unknown, request)).toThrow();

    const duplicate = response();

    duplicate.held = [{ documentId: "one", reason: "보류" }];
    expect(() => parseOrganizationResponse(duplicate, request)).toThrow();

    const citation = response();

    citation.matches[0].evidence = "제목만 보고 만들어낸 근거입니다.";
    expect(() => parseOrganizationResponse(citation, request)).toThrow("ungrounded");

    const date = response();

    date.matches[0].date = "2026-10-01";
    expect(() => parseOrganizationResponse(date, request)).toThrow("unconfirmed");
  });
  it("holds ambiguity instead of inventing a date or moving unrelated candidates", () => {
    const ambiguous = {
      ...request,
      documents: [{ ...request.documents[0], excerpt: "작성일 2026-10-14 또는 2026-11-14. 업무 보고서의 내용입니다." }]
    };

    expect(() => parseOrganizationResponse(response(), ambiguous)).toThrow("unconfirmed");
    expect(parseOrganizationResponse(
      { summary: "날짜를 확인해 주세요.", matches: [], held: [{ documentId: "one", reason: "작성일이 서로 달라요." }] },
      ambiguous
    ).matches).toHaveLength(0);
  });
  it("blocks source-root reuse and date folders that contradict the confirmed date", () => {
    const wrongDate = response();

    wrongDate.matches[0].destination = ["보고서", "2026-11-14"];
    expect(() => parseOrganizationResponse(wrongDate, request)).toThrow("mismatched");

    const source = response();

    source.matches[0].date = null;
    source.matches[0].destination = ["받은 자료", "팀 공유"];
    expect(() => parseOrganizationResponse(source, request)).toThrow("reserved");
  });
  it("normalizes only the known virtual display root without accepting source or absolute roots", () => {
    const display = response();

    display.matches[0].destination.unshift("정리한 자료");
    expect(parseOrganizationResponse(display, request).matches[0].destination).toEqual(["보고서", "2026-10-14"]);
  });
  it("rejects a dated destination when no date is confirmed in the result", () => {
    const invented = response();

    invented.matches[0].date = null;
    invented.matches[0].destination = ["보고서", "2099-01-01"];
    expect(() => parseOrganizationResponse(invented, request)).toThrow();
  });
});
