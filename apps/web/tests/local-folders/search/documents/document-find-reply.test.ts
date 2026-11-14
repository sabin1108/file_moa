import { describe, expect, it, vi } from "vitest";
import { parseFindReply } from "../../../../src/features/local-folders/search/documents/document-find-reply";
import { confirmFindQuery, inferFindRequest } from "../../../../src/features/local-folders/search/documents/document-find";
import { DocumentFindController } from "../../../../src/features/local-folders/search/documents/document-find-controller";

describe("FIND-006: explicit conversation conditions", () => {
  it.each(["수정일", "마지막 수정 날짜", "파일 수정 날짜", "파일을 마지막으로 수정한 날짜", "마지막 수정된 파일 날짜"])("recognizes %s in the initial request and a follow-up without adding search words", basis => {
    expect(inferFindRequest(`2026년 10월 ${basis} 기준으로 회의 자료 찾아줘`)).toMatchObject({ terms: "회의", basis: "modified" });
    expect(parseFindReply(`2026년 10월 ${basis} 기준 해당 월만`, 2026)).toMatchObject({ kind: "apply", filters: { year: "2026", month: "10", basis: "modified", window: "month" } });
  });
  it("does not choose between two date bases", () => {
    expect(inferFindRequest("수정일 또는 작성일 기준으로 회의 자료 찾아줘").basis).toBe("");
    expect(parseFindReply("수정일 작성일 기준", 2026).kind).toBe("invalid");
  });
  it("accepts a complete condition reply without changing the search words", () => {
    expect(parseFindReply("2026년이고 회의 날짜 기준으로", 2026)).toEqual({ kind: "apply", filters: { year: "2026", basis: "meeting" } });
    expect(parseFindReply("작년 10월 말 작성일 기준", 2026)).toEqual({
      kind: "apply",
      filters: { year: "2025", month: "10", window: "late", endMonth: "", basis: "written" }
    });
  });
  it.each(["2025년 또는 2026년", "2026년이고 분기별로", "작성일 말고 회의일", "10월 초", "10월부터 9월까지", "2026년 13월"])("rejects the whole ambiguous or unsupported reply: %s", reply => {
    expect(parseFindReply(reply, 2026).kind).toBe("invalid");
  });
  it("does not treat an ordinary new request as a condition reply", () => {
    expect(parseFindReply("성능 보고서 정리해줘", 2026).kind).toBe("none");
    expect(parseFindReply("회의 자료", 2026).kind).toBe("none");
  });
  it("shows explicit relative years, ranges and the month-end interpretation", () => {
    const initial = inferFindRequest("작년 10월말 회의 자료 찾아줘", 2026);

    expect(initial).toMatchObject({ year: "2025", month: "10", window: "late", terms: "회의" });
    expect(confirmFindQuery({ ...initial, basis: "meeting" })).toMatchObject({ from: "2025-10-21", to: "2025-10-31" });

    const parsed = parseFindReply("2026년 9월부터 10월까지 회의일 기준", 2026);

    expect(parsed.kind).toBe("apply");

    if (parsed.kind === "apply") expect(confirmFindQuery({ terms: "회의", year: "", month: "", basis: "", window: "", ...parsed.filters })).toMatchObject({ from: "2026-09-01", to: "2026-10-31" });

    expect(inferFindRequest("10월 회의 자료 찾아줘").year).toBe("");
    expect(() => confirmFindQuery(inferFindRequest("작년과 올해 회의 자료 찾아줘", 2026))).toThrow();
    expect(inferFindRequest("작년과 올해 회의 자료 찾아줘", 2026)).toMatchObject({ year: "", month: "" });
  });
  it("applies replies atomically and waits for a separate search action", async () => {
    const read = vi.fn(async () => ({ documents: [], complete: true, excluded: [], limits: [], discoveredFiles: 0 }));
    const controller = new DocumentFindController(read);

    controller.start("10월쯤 회의 자료 찾아줘");

    const before = controller.getSnapshot().filters;

    expect(controller.submitReply("2026년이고 분기별로")).toBe(true);
    expect(controller.getSnapshot().filters).toEqual(before);
    expect(controller.submitReply("2026년 회의일 기준 해당 월만")).toBe(true);
    expect(controller.getSnapshot()).toMatchObject({
      filters: { ...before, year: "2026", basis: "meeting", window: "month" },
      submittedReply: "2026년 회의일 기준 해당 월만",
      draft: "",
      phase: "confirm"
    });
    expect(read).not.toHaveBeenCalled();
    await controller.search();
    expect(read).toHaveBeenCalledOnce();
  });
});
