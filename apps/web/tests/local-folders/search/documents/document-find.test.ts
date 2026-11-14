import { describe, expect, it, vi } from "vitest";
import {
  inferFindRequest,
  isFindRequest,
  confirmFindQuery,
  findTextEvidence,
} from "../../../../src/features/local-folders/search/documents/document-find";
import { DocumentFindController } from "../../../../src/features/local-folders/search/documents/document-find-controller";

const filters = {
  terms: "회의",
  year: "2026",
  month: "10",
  basis: "meeting",
  window: "month",
};
const query = () => confirmFindQuery(filters);

describe("FIND-001: explicit search conditions", () => {
  it("routes find-only requests without turning organization or negation into search", () => {
    expect(isFindRequest("10월쯤 한 회의자료 있는데 그것좀 찾아줄래")).toBe(
      true,
    );

    for (const value of [
      "회의자료를 찾아서 정리해 줘",
      "회의 자료를 찾지 말고",
      "회의자료 복사",
      "회의 날짜로 해 줘",
    ])
      expect(isFindRequest(value)).toBe(false);
  });
  it("does not guess a year/date basis or the meaning of around a month", () => {
    expect(
      inferFindRequest("내가 10월쯤 한 회의자료 있는데 그것좀 찾아줄래"),
    ).toMatchObject({
      terms: "회의",
      month: "10",
      year: "",
      basis: "",
      window: "",
    });
    expect(() =>
      confirmFindQuery(inferFindRequest("10월쯤 한 회의자료 찾아줘")),
    ).toThrow();
    expect(confirmFindQuery({ ...filters, window: "around" })).toMatchObject({
      from: "2026-09-24",
      to: "2026-11-07",
    });
  });
  it("handles year rollover and explicit no-period search without inventing dates", () => {
    expect(
      confirmFindQuery({ ...filters, month: "1", window: "around" }),
    ).toMatchObject({ from: "2025-12-25", to: "2026-02-07" });
    expect(
      confirmFindQuery({ ...filters, month: "all", year: "", basis: "" }),
    ).toMatchObject({ from: null, to: null });
  });
  it("does not pick a negated month or choose between conflicting date bases", () => {
    expect(inferFindRequest("2026년 10월 말고 회의 자료 찾아줘").month).toBe(
      "",
    );
    expect(
      inferFindRequest("회의일 또는 작성일 기준으로 회의 자료 찾아줘").basis,
    ).toBe("");
    expect(
      inferFindRequest("2025년과 2026년 10월 또는 11월 회의 자료 찾아줘"),
    ).toMatchObject({ year: "", month: "" });
  });
  it.each([
    { ...filters, year: "" },
    { ...filters, month: "13" },
    { ...filters, terms: "" },
    { ...filters, basis: "" },
    { ...filters, window: "" },
  ])("refuses incomplete or invalid conditions", (value) =>
    expect(() => confirmFindQuery(value)).toThrow(),
  );
});

describe("FIND-003/004: full body evidence, not an excerpt/date guess", () => {
  it("finds a meeting date far beyond the old 1200-character excerpt", () => {
    const text =
      "회의 자료\n" +
      "설명 ".repeat(1000) +
      "\n회의일: 2026-10-15\n결정 사항입니다.";
    const result = findTextEvidence(text, query());

    expect(result).toMatchObject({ kind: "matched", dates: ["2026-10-15"] });
    expect(
      result?.evidence.some((line) => line.includes("회의일: 2026-10-15")),
    ).toBe(true);
    expect(
      result?.evidence.every(
        (line) => text.includes(line) && line.length <= 200,
      ),
    ).toBe(true);
  });
  it("does not confuse a written date with the meeting date or reuse a file name", () => {
    expect(
      findTextEvidence(
        "회의 자료\n작성일: 2026-10-15\n회의일: 2026-11-01",
        query(),
      ),
    ).toBeNull();
    expect(
      findTextEvidence("회의 자료\n작성일: 2026-10-15", query())?.kind,
    ).toBe("date-unknown");
    expect(
      findTextEvidence(
        "회의 자료\n작성일: 2026-10-15",
        confirmFindQuery({ ...filters, basis: "written" }),
      )?.kind,
    ).toBe("matched");
  });
  it("keeps conflicting period evidence for review and omits irrelevant/outside candidates", () => {
    expect(
      findTextEvidence("회의\n회의일: 2026-10-15\n회의일: 2026-11-15", query())
        ?.kind,
    ).toBe("date-conflict");
    expect(findTextEvidence("회의\n회의일: 2026-11-15", query())).toBeNull();
    expect(
      findTextEvidence("학습\n회의일: 2026-10-15", {
        ...query(),
        terms: ["회의", "결정"],
      }),
    ).toBeNull();
    expect(findTextEvidence("회의\n회의일: 2026-02-30", query())?.kind).toBe(
      "date-unknown",
    );
  });
  it("uses confirmed inclusive boundaries and can search without a date filter", () => {
    const around = confirmFindQuery({ ...filters, window: "around" });

    expect(findTextEvidence("회의\n회의일: 2026-09-24", around)?.kind).toBe(
      "matched",
    );
    expect(findTextEvidence("회의\n회의일: 2026-11-07", around)?.kind).toBe(
      "matched",
    );
    expect(findTextEvidence("회의\n회의일: 2026-11-08", around)).toBeNull();
    expect(
      findTextEvidence("회의", confirmFindQuery({ ...filters, month: "all" }))
        ?.kind,
    ).toBe("matched");
  });
  it("keeps in-period evidence visible after many earlier outside dates", () => {
    const text =
      "회의\n" +
      Array.from(
        { length: 18 },
        (_, index) => `회의일: 2026-11-${String(index + 1).padStart(2, "0")}\n`,
      ).join("") +
      "회의일: 2026-10-15";
    const result = findTextEvidence(text, query());

    expect(result?.kind).toBe("date-conflict");
    expect(result?.dates[0]).toBe("2026-10-15");
    expect(result?.evidence[0]).toContain("회의일: 2026-10-15");
    expect(findTextEvidence("회의\n회의일: 2026-10-155", query())?.kind).toBe(
      "date-unknown",
    );
  });
});

describe("FIND-002/005: read-only search lifecycle", () => {
  it("asks for conditions before reading, then calls only the injected reader", async () => {
    const result = {
      documents: [],
      complete: true,
      excluded: [],
      limits: [],
      discoveredFiles: 0,
    };
    const read = vi.fn(async () => result);
    const c = new DocumentFindController(read);

    c.start("10월쯤 한 회의자료 찾아줘");
    await c.search();
    expect(read).not.toHaveBeenCalled();
    c.configure(filters);
    await c.search();
    expect(read).toHaveBeenCalledWith(
      { kind: "all" },
      query(),
      expect.any(AbortSignal),
    );
    expect(c.getSnapshot()).toMatchObject({ phase: "ready", result });
  });
  it("drops late results after cancel, edit or owner reset", async () => {
    for (const action of [
      (c: DocumentFindController) => c.cancel(),
      (c: DocumentFindController) => c.configure({ year: "2025" }),
      (c: DocumentFindController) => c.reset(),
    ]) {
      let finish!: (value: {
        documents: never[];
        complete: boolean;
        excluded: never[];
        limits: never[];
        discoveredFiles: number;
      }) => void;
      const c = new DocumentFindController(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );

      c.start("2026년 10월 회의 자료 찾아줘");
      c.configure(filters);

      const pending = c.search();

      action(c);
      finish({
        documents: [],
        complete: true,
        excluded: [],
        limits: [],
        discoveredFiles: 0,
      });
      await pending;
      expect(c.getSnapshot().result).toBeNull();
    }
  });
});
