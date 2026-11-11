import { describe, expect, it } from "vitest";
import {
  buildFileChangePlan,
  classificationFolder,
  parsePlanDestination,
  type PlanDirectory,
  type PlanOperation
} from "../../../src/features/local-folders/lib/file-change-plan";

// Fixed synthetic names; no filesystem or permission mocks are needed for these pure rules.

const source = {
  path: ["자료"],
  entries: [{ name: "a.md", kind: "file" as const }, { name: "B.TXT", kind: "file" as const }],
  truncated: false
};
const target: PlanDirectory = { path: ["보관"], entries: [], truncated: false, availability: "existing" };
const plan = (operation: PlanOperation = "move", destinations = [target], selectedNames = ["a.md"]) => buildFileChangePlan({ operation, source, selectedNames, destinationPath: ["보관"], destinations });

describe("read-only file change rules", () => {
  it("PLAN-002 accepts a root or nested relative destination", () => {
    expect(parsePlanDestination("")).toEqual([]);
    expect(parsePlanDestination("자료/한글 폴더")).toEqual(["자료", "한글 폴더"]);
  });
  it("PLAN-002 rejects absolute, traversal and ambiguous path syntax", () => {
    for (const value of ["/root", "a/", "a//b", "a/../b", ".", "C:/data", "a\\b", "a\0b", "a\nb"]) {
      expect(() => parsePlanDestination(value)).toThrow();
    }
  });
  it("PLAN-001 rejects empty, duplicate or missing selections and directories", () => {
    expect(() => plan("move", [target], [])).toThrow("empty-selection");
    expect(() => plan("move", [target], ["a.md", "a.md"])).toThrow();
    expect(() => plan("move", [target], ["missing.md"])).toThrow("source-changed");
    expect(() => buildFileChangePlan({
      operation: "move",
      source: { ...source, entries: [{ name: "a.md", kind: "directory" }] },
      selectedNames: ["a.md"],
      destinationPath: target.path,
      destinations: [target]
    })).toThrow("source-changed");
  });
  it("PLAN-003 preserves source and gives exact move/copy rows without mutating input", () => {
    const before = JSON.stringify(source);

    for (const operation of ["move", "copy"] as const) {
      expect(plan(operation)).toMatchObject({ operation, rows: [{ from: ["자료", "a.md"], to: ["보관", "a.md"], issues: [] }], conflictCount: 0 });
    }

    expect(JSON.stringify(source)).toBe(before);
  });
  it("PLAN-003 classifies by extension and lists only proposed folders", () => {
    expect(["A.MD", "a.txt", "photo.pdf", "README"].map(classificationFolder)).toEqual(["마크다운", "텍스트", "기타", "기타"]);

    const result = plan("classify", [{ ...target, path: ["보관", "마크다운"], availability: "planned" }]);

    expect(result.rows[0].to).toEqual(["보관", "마크다운", "a.md"]);
    expect(result.directoriesToCreate).toEqual([["보관", "마크다운"]]);
  });
  it("PLAN-004 marks same source/destination for move and copy", () => {
    for (const operation of ["move", "copy"] as const) {
      const result = buildFileChangePlan({
        operation,
        source,
        selectedNames: ["a.md"],
        destinationPath: source.path,
        destinations: [{ ...target, ...source }]
      });

      expect(result.rows[0].issues).toContain("same-path");
    }
  });
  it("PLAN-004 blocks exact file or directory name collision", () => {
    for (const kind of ["file", "directory"] as const) {
      expect(plan("move", [{ ...target, entries: [{ name: "a.md", kind }] }]).rows[0].issues).toContain("name-conflict");
    }
  });
  it("PLAN-004 conservatively marks case and Unicode aliases", () => {
    expect(plan("move", [{ ...target, entries: [{ name: "A.MD", kind: "file" }] }]).rows[0].issues).toContain("ambiguous-name");

    const unicode = buildFileChangePlan({
      operation: "copy",
      source: { ...source, entries: [{ name: "é.md", kind: "file" }] },
      selectedNames: ["é.md"],
      destinationPath: target.path,
      destinations: [{ ...target, entries: [{ name: "e\u0301.md", kind: "file" }] }]
    });

    expect(unicode.rows[0].issues).toContain("ambiguous-name");
  });
  it("PLAN-004 marks all duplicate normalized targets, not just the last one", () => {
    const result = buildFileChangePlan({
      operation: "move",
      source: { ...source, entries: [{ name: "a.md", kind: "file" }, { name: "A.MD", kind: "file" }] },
      selectedNames: ["a.md", "A.MD"],
      destinationPath: target.path,
      destinations: [target]
    });

    expect(result.rows.every(row => row.issues.includes("duplicate-target"))).toBe(true);
    expect(result.conflictCount).toBe(2);
  });
  it("PLAN-005 never treats a partial destination as collision-free", () => {
    expect(plan("move", [{ ...target, truncated: true }]).rows[0].issues).toContain("incomplete-destination");
    expect(plan("move", []).rows[0].issues).toContain("incomplete-destination");
  });
  it("PLAN-004 distinguishes a blocked classification directory", () => {
    expect(plan("classify", [{ ...target, path: ["보관", "마크다운"], availability: "blocked" }]).rows[0].issues).toContain("blocked-directory");
  });
});
