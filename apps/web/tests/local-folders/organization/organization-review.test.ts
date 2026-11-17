import { describe, expect, it } from "vitest";
import {
  buildReviewQuestions,
  validateReviewAnswers,
  parseLiveOrganizationResponse
} from "../../../src/shared/live-organization-review";
import { inferOrganizationConditions } from "../../../src/features/local-folders/organization/organization-intent";

const document = {
  id: "document-1",
  name: "보고.md",
  sourcePath: ["회사"],
  excerpt: "작성일: 2026-10-01\n검토 기준일: 2026-10-15\n성능 측정 결과 LCP 2.8초입니다."
};
const request = { instruction: "성능 보고서 날짜별 정리", documents: [document] };
const response = {
  summary: "확인할 자료입니다",
  matches: [],
  held: [{ documentId: document.id, reason: "어떤 날짜로 정리할지 확인해 주세요" }]
};

describe("grounded questions and user answers", () => {
  it("groups ambiguous documents once and derives real date meanings/evidence from the excerpt", () => {
    const questions = buildReviewQuestions(response, request, [
      { documentId: document.id, kind: "date" }
    ]);

    expect(questions).toHaveLength(1);
    expect(questions[0].dates.map(candidate => candidate.label)).toEqual(["작성일", "검토 기준일"]);
    expect(questions[0].dates.map(candidate => candidate.date)).toEqual([
      "2026-10-01",
      "2026-10-15"
    ]);
    expect(
      questions[0].dates.every(candidate => document.excerpt.includes(candidate.evidence))
    ).toBe(true);
    expect(questions[0].dates.some(candidate => candidate.label === "생성일")).toBe(false);
  });
  it("rejects ungrounded dates, outside documents, traversal, duplicate answers and forged question kinds", () => {
    for (const answers of [
      [{ documentId: document.id, date: "2026-12-01" }],
      [{ documentId: "outside", exclude: true }],
      [{ documentId: document.id, destination: [".."] }],
      [
        { documentId: document.id, exclude: true },
        { documentId: document.id, exclude: true }
      ]
    ])
      expect(() => validateReviewAnswers(answers, request.documents)).toThrow();

    expect(() =>
      buildReviewQuestions(response, request, [{ documentId: "outside", kind: "date" }])
    ).toThrow();
  });
  it("accepts a user-selected grounded date among multiple dates and refuses another date or ignored exclusions", () => {
    const answer = [{ documentId: document.id, date: "2026-10-15" }];
    const value = {
      summary: "제안입니다",
      matches: [
        {
          documentId: document.id,
          destination: ["성능", "2026-10-15"],
          evidence: "성능 측정 결과 LCP 2.8초입니다.",
          date: "2026-10-15"
        }
      ],
      held: [],
      questions: []
    };

    expect(parseLiveOrganizationResponse(value, request, answer).organization.matches[0].date).toBe(
      "2026-10-15"
    );
    expect(() =>
      parseLiveOrganizationResponse(value, request, [
        { documentId: document.id, date: "2026-10-01" }
      ])
    ).toThrow();
    expect(() =>
      parseLiveOrganizationResponse(value, request, [{ documentId: document.id, exclude: true }])
    ).toThrow();
  });
  it("does not ask the same date question once a date was explicitly selected", () => {
    expect(() =>
      parseLiveOrganizationResponse(
        { ...response, questions: [{ documentId: document.id, kind: "date" }] },
        request,
        [{ documentId: document.id, date: "2026-10-15" }]
      )
    ).toThrow();
  });
  it("honors an explicitly chosen folder independently of grounded date metadata", () => {
    const value = {
      summary: "사용자 기준 제안",
      matches: [
        {
          documentId: document.id,
          destination: ["직접 선택"],
          evidence: "성능 측정 결과 LCP 2.8초입니다.",
          date: "2026-10-15"
        }
      ],
      held: [],
      questions: []
    };

    expect(
      parseLiveOrganizationResponse(value, request, [
        { documentId: document.id, date: "2026-10-15", destination: ["직접 선택"] }
      ]).organization.matches[0].destination
    ).toEqual(["직접 선택"]);
    expect(
      parseLiveOrganizationResponse(
        { ...value, matches: [{ ...value.matches[0], destination: ["2027-01-01"], date: null }] },
        request,
        [{ documentId: document.id, destination: ["2027-01-01"] }]
      ).organization.matches[0].date
    ).toBeNull();
  });
});

describe("bounded natural language conditions", () => {
  it("accepts root-prefixed and Windows-relative paths, natural folder endings and unique leaf names", () => {
    const paths = [[], ["프로젝트"], ["프로젝트", "영어"], ["가로"]];
    for (const input of ["note / 프로젝트 / 영어", "프로젝트\\영어", "영어 폴더에 넣어줘", "영어 폴더 안으로", "영어 폴더", "영어에 넣어줘"]) {
      expect(inferOrganizationConditions(`"${input}"로`, "note", paths).destination, input).toEqual(["프로젝트", "영어"]);
    }
    expect(inferOrganizationConditions('"가로"에서', "note", paths).scope).toEqual({ kind: "folder", path: ["가로"] });
    expect(inferOrganizationConditions('"영어폴더에 넣어줘"로', "note", [...paths, ["영어폴더"]]).destination).toEqual(["영어폴더"]);
    expect(inferOrganizationConditions('"영어"로', "note", paths, false).destination).toBeUndefined();
    expect(inferOrganizationConditions('"영어"로', "note", [...paths, ["다른 곳", "영어"]]).destination).toBeUndefined();
    expect(inferOrganizationConditions('"../영어"로', "note", paths).destination).toBeUndefined();
    expect(inferOrganizationConditions('"C:\\note\\프로젝트\\영어"로', "note", paths).destination).toBeUndefined();
  });
  const folders = [[], ["회사"], ["보고서"], ["검토"]];

  it("separates explicit quoted source, reference and destination without broadening scope", () => {
    expect(
      inferOrganizationConditions(
        '"회사" 폴더에서 "보고서" 폴더 기준으로 "검토" 폴더로 정리',
        "자료",
        folders
      )
    ).toMatchObject({
      scope: { kind: "folder", path: ["회사"] },
      reference: ["보고서"],
      destination: ["검토"]
    });
  });
  it("recognizes a clear connected-root request and refuses ambiguous or invented paths", () => {
    expect(
      inferOrganizationConditions("연결한 폴더 전체에서 찾아줘", "자료", folders).scope
    ).toEqual({ kind: "all" });
    expect(
      inferOrganizationConditions('"없는 폴더"에서 찾아줘', "자료", folders).scope
    ).toBeUndefined();
    expect(
      inferOrganizationConditions('"회사"에서 "보고서"에서 찾아줘', "자료", folders).scope
    ).toBeUndefined();
    expect(inferOrganizationConditions("전체 정리", "자료", folders).scope).toBeUndefined();
  });
});
