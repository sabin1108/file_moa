import { describe, expect, it } from "vitest";
import { restoreDestinationPath, restoreFileName } from "../../../src/features/local-folders/lib/recovery-restore";

describe("restore destination naming", () => {
  it("uses the original name when free and preserves an extension when renaming", () => {
    expect(restoreFileName("자료.md", [])).toBe("자료.md");
    expect(restoreFileName("자료.md", ["자료.md", "자료 (복원 1).MD"])).toBe("자료 (복원 2).md");
  });
  it("avoids case and NFC equivalent names regardless of their entry kind", () => {
    expect(restoreFileName("a.txt", ["A.TXT"])).toBe("a (복원 1).txt");
    expect(restoreFileName("가.txt", ["가.txt".normalize("NFD")])).toBe("가 (복원 1).txt");
  });
  it("bounds a long name without splitting a Unicode point", () => {
    const name = "가".repeat(250) + ".txt";
    const next = restoreFileName(name, [name]);

    expect(next.length).toBeLessThanOrEqual(255);
    expect(next.endsWith(" (복원 1).txt")).toBe(true);
  });
  it.each([[".."], [".moa-history"], ["bad/name"], ["C:"]])("blocks unsafe destination %j", path => {
    expect(() => restoreDestinationPath(path)).toThrow();
  });
  it("allows the connected root as a destination", () => {
    expect(restoreDestinationPath([])).toEqual([]);
  });
});
