import { describe, expect, it } from "vitest";
import { checkDocumentCandidate, DOCUMENT_LIMITS } from "../src/index";
describe("document candidate policy", () => {
  it("accepts supported extensions through the exact byte boundary", () => {
    expect(checkDocumentCandidate("한글.MD", DOCUMENT_LIMITS.fileBytes)).toBeNull();
    expect(checkDocumentCandidate("empty.txt", 0)).toBeNull();
    expect(checkDocumentCandidate("scan.PNG", DOCUMENT_LIMITS.fileBytes)).toBeNull();
    expect(checkDocumentCandidate("photo.jpeg", 100)).toBeNull();
  });
  it("rejects oversize and disguised executable names", () => {
    expect(checkDocumentCandidate("large.md", DOCUMENT_LIMITS.fileBytes + 1)).toBe("too-large");
    expect(checkDocumentCandidate("notes.md.exe", 10)).toBe("unsupported-extension");
  });
  it.each([-1, NaN, Infinity, 1.2])("rejects invalid byte size %s", bytes => {
    expect(checkDocumentCandidate("notes.txt", bytes)).toBe("invalid-size");
  });
});

