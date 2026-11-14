import { describe, expect, it } from "vitest";
import { parsePastedFolderPath } from "../../src/features/local-folders/pasted-folder-path";

describe("pasted destination path", () => {
  it("supports relative slash and Windows separators", () => {
    expect(parsePastedFolderPath("자료\\노트", "root")).toEqual({ path: ["자료", "노트"], requiresConfirmation: false });
  });
  it("converts the displayed connected-root path back to a relative path", () => {
    expect(parsePastedFolderPath("note", "note").path).toEqual([]);
    expect(parsePastedFolderPath("note/자료", "note").path).toEqual(["자료"]);
    expect(parsePastedFolderPath("notebook/자료", "note").path).toEqual(["notebook", "자료"]);
  });
  it("offers an explicit relative candidate for a copied absolute path", () => {
    expect(parsePastedFolderPath('"D:\\sabin\\note\\프로젝트\\자료"', "프로젝트")).toEqual({ path: ["자료"], requiresConfirmation: true });
    expect(parsePastedFolderPath("D:\\sabin\\프로젝트", "프로젝트").path).toEqual([]);
  });
  it("rejects unprovable or ambiguous roots, UNC and traversal", () => {
    for (const value of ["D:\\other\\file", "D:\\root\\root\\file", "\\\\server\\root\\file", "D:\\root\\..\\file", "../file", "D:file"]) {
      expect(() => parsePastedFolderPath(value, "root")).toThrow();
    }
  });
});
