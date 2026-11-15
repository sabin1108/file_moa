import { afterEach, describe, expect, it, vi } from "vitest";
import { DOCUMENT_LIMITS } from "@personal-ai/domain";
import { readSourceSnapshot } from "../../../src/features/local-folders/organization/source-snapshot";
import type { FolderHandle } from "../../../src/features/local-folders/types";
import { withAbsentVaultMarker } from "../fixtures/absent-vault-marker";
import { LocalTextIndex, LOCAL_TEXT_INDEX_VERSION } from "../../../src/features/local-folders/search/documents/local-text-index";

const readText = vi.hoisted(() => vi.fn());
const dispose = vi.hoisted(() => vi.fn());

vi.mock("../../../src/features/local-folders/content/copy-hash", () => ({
  createCopyHasher: () => ({ readText, dispose })
}));

// The real listing/path/permission code runs; this fake replaces the disk and Worker only.

function directory(name: string, entries: Record<string, File | FolderHandle>): FolderHandle {
  const missing = () => new DOMException("synthetic missing entry", "NotFoundError");
  const root = {
    name,
    kind: "directory",
    queryPermission: vi.fn(async () => "granted"),
    requestPermission: vi.fn(() => {
      throw Error("unexpected-permission-request");
    }),
    values: async function* () {
      for (const [name, entry] of Object.entries(entries)) {
        yield { name, kind: entry instanceof File ? "file" : "directory" };
      }
    },
    getDirectoryHandle: vi.fn(async (name: string) => {
      const entry = entries[name];

      if (!entry || entry instanceof File) throw missing();

      return entry;
    }),
    getFileHandle: vi.fn(async (name: string) => {
      const entry = entries[name];

      if (!(entry instanceof File)) throw missing();

      return { getFile: async () => entry };
    }),
    removeEntry: vi.fn(() => {
      throw Error("unexpected-write");
    })
  };

  withAbsentVaultMarker(root);

  return root as unknown as FolderHandle;
}

afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

describe("read-only TXT/MD organization snapshot", () => {
  it("CACHE-003 stores observed extraction metadata and avoids rewriting validated cache hits", async () => {
    const file = new File(["abc"], "note.md", { lastModified: 100 });
    const root = directory("자료", { "note.md": file });
    const context = { owner: "owner", workspace: "workspace", connection: "connection" };
    const metadata = { format: "text" as const, size: 3, lastModified: 100, ocrEnabled: false };
    const cached = { ...context, id: "cached", path: ["note.md"], hash: "a".repeat(64), text: "abc", parserVersion: LOCAL_TEXT_INDEX_VERSION, updatedAt: 1, metadata };
    vi.spyOn(LocalTextIndex.prototype, "readPath").mockResolvedValue(cached);
    const put = vi.spyOn(LocalTextIndex.prototype, "put").mockResolvedValue();
    vi.spyOn(LocalTextIndex.prototype, "retain").mockResolvedValue();
    const check = vi.fn();
    readText.mockResolvedValue({ sha256: cached.hash, size: 3, fullText: "abc", excerpt: "abc", excerptHash: "b".repeat(64), cacheMetadata: metadata, cacheHit: false });

    await readSourceSnapshot(root, { kind: "all" }, "abc", check, undefined, undefined, context);

    expect(readText.mock.calls[0][4]).toEqual(cached);
    expect(put).toHaveBeenCalledWith(expect.objectContaining({ ...context, path: ["note.md"], hash: cached.hash }), "abc", expect.any(Function), metadata);
    put.mockClear();
    readText.mockResolvedValue({ sha256: cached.hash, size: 3, fullText: "abc", excerpt: "abc", excerptHash: "b".repeat(64), cacheMetadata: metadata, cacheHit: true });

    await readSourceSnapshot(root, { kind: "selected", entries: [{ kind: "file", path: ["note.md"] }] }, "abc", check, undefined, undefined, context);

    expect(put).not.toHaveBeenCalled();
  });

  it("CACHE-005 only prunes after a complete full scan, preserving entries after failure or partial selection", async () => {
    const root = directory("자료", { "note.md": new File(["abc"], "note.md") });
    const context = { owner: "owner", workspace: "workspace", connection: "connection" };
    vi.spyOn(LocalTextIndex.prototype, "readPath").mockResolvedValue(undefined);
    vi.spyOn(LocalTextIndex.prototype, "put").mockResolvedValue();
    const retain = vi.spyOn(LocalTextIndex.prototype, "retain").mockResolvedValue();
    readText.mockResolvedValue({ sha256: "a".repeat(64), size: 3, excerpt: "abc", excerptHash: "b".repeat(64) });

    await readSourceSnapshot(root, { kind: "all" }, "abc", () => {}, undefined, undefined, context);

    expect(retain).toHaveBeenCalledWith(context, [["note.md"]], expect.any(Function));
    retain.mockClear();
    await readSourceSnapshot(root, { kind: "selected", entries: [{ kind: "file", path: ["note.md"] }] }, "abc", () => {}, undefined, undefined, context);
    readText.mockRejectedValueOnce(new Error("invalid-utf8"));
    const failed = await readSourceSnapshot(root, { kind: "all" }, "abc", () => {}, undefined, undefined, context);

    expect(failed.complete).toBe(false);
    expect(retain).not.toHaveBeenCalled();
  });
  it("keeps only name evidence and discards stale modification dates when a file changes during reading", async () => {
    const name = "해솔연구.md";
    const root = directory("자료", { [name]: new File(["x"], name) });
    vi.mocked(root.getFileHandle).mockResolvedValue({ getFile: vi.fn()
      .mockResolvedValueOnce(new File(["x"], name, { lastModified: new Date(2026, 9, 15).getTime() }))
      .mockResolvedValueOnce(new File(["changed"], name, { lastModified: new Date(2026, 10, 15).getTime() })) } as unknown as FileSystemFileHandle);
    readText.mockResolvedValue({ sha256: "a".repeat(64), excerptHash: "b".repeat(64), excerpt: "x", size: 1 });
    const result = await readSourceSnapshot(root, { kind: "selected", entries: [{ kind: "file", path: [name] }] }, "해솔연구", () => {}, undefined, { terms: ["해솔연구"], from: "2026-10-01", to: "2026-10-31", basis: "modified" });

    expect(result.findings?.[0]).toMatchObject({ contentAvailable: false, finding: { kind: "date-unknown", matches: { body: [] } } });
    expect(result.documents).toEqual([]);
    expect(result.excluded).toContainEqual({ path: [name], reason: "source-changed" });
  });
  it("continues metadata search after the body document budget and retains stronger late names", async () => {
    const terms = ["가온센터", "연구"];
    readText.mockImplementation(async (file: File) => ({ sha256: "a".repeat(64), excerptHash: "b".repeat(64), size: file.size, excerpt: "합성", finding: { kind: "matched", dates: [], evidence: ["가온센터 연구"], matches: { name: [], path: [], body: terms } } }));
    const entries = Object.fromEntries(Array.from({ length: 500 }, (_, index) => [`${String(index).padStart(3, "0")}.md`, new File([], "body.md")]));
    entries["zz 가온센터 연구.docx"] = new File([], "zz 가온센터 연구.docx");
    const result = await readSourceSnapshot(directory("자료", entries), { kind: "all" }, "가온센터 연구", () => {}, undefined, { terms, from: null, to: null, basis: "body" });

    expect(readText).toHaveBeenCalledTimes(500);
    expect(result.findings).toHaveLength(500);
    expect(result.findings?.[0]).toMatchObject({ name: "zz 가온센터 연구.docx", contentAvailable: false });
    expect(result.limits).toEqual(expect.arrayContaining(["document-limit", "result-limit"]));
    expect(result.complete).toBe(false);
  });

  it("continues filename discovery after the body byte budget without sending more files to the Worker", async () => {
    readText.mockImplementation(async (file: File) => ({ sha256: "a".repeat(64), excerptHash: "b".repeat(64), size: file.size, excerpt: "합성" }));
    const file = new File([new Uint8Array(DOCUMENT_LIMITS.fileBytes)], "body.md");
    const entries = Object.fromEntries(Array.from({ length: 26 }, (_, index) => [`${String(index).padStart(3, "0")}.md`, file]));
    entries["zz 해솔연구.md"] = file;
    const result = await readSourceSnapshot(directory("자료", entries), { kind: "all" }, "해솔연구", () => {}, undefined, { terms: ["해솔연구"], from: null, to: null, basis: "body" });

    expect(readText).toHaveBeenCalledTimes(25);
    expect(result.findings).toEqual([expect.objectContaining({ name: "zz 해솔연구.md", contentAvailable: false })]);
    expect(result.limits).toContain("bytes-limit");
  });

  it("keeps listed name evidence when getFile fails, with an unknown modification date", async () => {
    const name = "해솔연구.docx";
    const root = directory("자료", { [name]: new File([], name) });
    vi.mocked(root.getFileHandle).mockRejectedValue(new DOMException("synthetic unreadable", "NotReadableError"));
    const result = await readSourceSnapshot(root, { kind: "selected", entries: [{ kind: "file", path: [name] }] }, "해솔연구", () => {}, undefined, { terms: ["해솔연구"], from: "2026-10-01", to: "2026-10-31", basis: "modified" });

    expect(result.findings?.[0]).toMatchObject({ contentAvailable: false, finding: { kind: "date-unknown" } });
    expect(result.complete).toBe(false);
    expect(readText).not.toHaveBeenCalled();
  });

  it("does not publish metadata-only candidates after permission is revoked", async () => {
    const name = "해솔연구.docx";
    const root = directory("자료", { [name]: new File([], name) });
    vi.mocked(root.getFileHandle).mockImplementation(async () => {
      vi.mocked(root.queryPermission).mockResolvedValue("denied");

      return { getFile: async () => new File([], name) } as unknown as FileSystemFileHandle;
    });

    await expect(readSourceSnapshot(root, { kind: "selected", entries: [{ kind: "file", path: [name] }] }, "해솔연구", () => {}, undefined, { terms: ["해솔연구"], from: null, to: null, basis: "body" })).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(readText).not.toHaveBeenCalled();
  });
  it("finds unsupported names without reading their body or adding them to AI source documents", async () => {
    const root = directory("자료", { "해솔테크 지원서.docx": new File(["not decoded"], "해솔테크 지원서.docx") });
    const result = await readSourceSnapshot(root, { kind: "all" }, "해솔테크 지원서", () => {}, undefined, { terms: ["해솔테크", "지원서"], from: null, to: null, basis: "body" });

    expect(result.findings).toEqual([expect.objectContaining({ name: "해솔테크 지원서.docx", contentAvailable: false })]);
    expect(result.documents).toEqual([]);
    expect(result.excluded).toContainEqual({ path: ["해솔테크 지원서.docx"], reason: "unsupported-extension" });
    expect(readText).not.toHaveBeenCalled();
    expect(root.removeEntry).not.toHaveBeenCalled();
  });

  it("keeps filename evidence when UTF-8 decoding fails, without claiming body evidence", async () => {
    readText.mockRejectedValueOnce(new Error("invalid-utf8"));
    const root = directory("자료", { "해솔테크 지원서.md": new File([new Uint8Array([255])], "해솔테크 지원서.md") });
    const result = await readSourceSnapshot(root, { kind: "all" }, "해솔테크 지원서", () => {}, undefined, { terms: ["해솔테크", "지원서"], from: null, to: null, basis: "body" });

    expect(result.findings?.[0]).toMatchObject({ contentAvailable: false, finding: { matches: { body: [] } } });
    expect(result.documents).toEqual([]);
    expect(result.complete).toBe(false);
  });
  it("recurses and returns content/version evidence, excluding unsupported files and internal history", async () => {
    readText.mockImplementation(async (file: File) => ({
      sha256: "a".repeat(64),
      size: file.size,
      excerpt: await file.text(),
      excerptHash: "b".repeat(64)
    }));

    const child = directory("회사", {
      "a.MD": new File(["성능 보고"], "a.MD", { lastModified: 42 })
    });
    const root = directory("자료", {
      회사: child,
      "photo.exe": new File(["unsupported"], "photo.exe"),
      ".moa-history": directory(".moa-history", {
        "secret.txt": new File(["internal"], "secret.txt")
      })
    });

    const result = await readSourceSnapshot(root, { kind: "all" }, "성능 자료", () => { });

    expect(result.documents).toEqual([
      expect.objectContaining({
        name: "a.MD",
        path: ["회사", "a.MD"],
        excerpt: "성능 보고",
        sha256: "a".repeat(64),
        excerptHash: "b".repeat(64),
        lastModified: 42
      })
    ]);
    expect(result.complete).toBe(true);
    expect(result.excluded).toContainEqual({
      path: ["photo.exe"],
      reason: "unsupported-extension"
    });
    expect(readText).toHaveBeenCalledTimes(1);
    expect(root.requestPermission).not.toHaveBeenCalled();
    expect(root.removeEntry).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("does not expand a selected scope and deduplicates files under selected folders", async () => {
    readText.mockResolvedValue({
      sha256: "a".repeat(64),
      excerptHash: "b".repeat(64),
      excerpt: "x",
      size: 1
    });

    const child = directory("회사", { "a.txt": new File(["x"], "a.txt") });
    const root = directory("자료", { 회사: child, "outside.txt": new File(["x"], "outside.txt") });
    const result = await readSourceSnapshot(
      root,
      {
        kind: "selected",
        entries: [
          { path: ["회사"], kind: "directory" },
          { path: ["회사", "a.txt"], kind: "file" }
        ]
      },
      "x",
      () => { }
    );

    expect(result.documents.map(document => document.path)).toEqual([["회사", "a.txt"]]);
    expect(readText).toHaveBeenCalledOnce();
  });

  it("rejects unsafe/empty selections before disk access", async () => {
    const root = directory("자료", {});

    await expect(
      readSourceSnapshot(root, { kind: "folder", path: [".."] }, "x", () => { })
    ).rejects.toThrow();
    await expect(
      readSourceSnapshot(root, { kind: "selected", entries: [] }, "x", () => { })
    ).rejects.toThrow();
    expect(root.queryPermission).not.toHaveBeenCalled();
  });

  it("reports failed UTF-8 and rejects oversized files before asking the Worker to read", async () => {
    readText.mockRejectedValueOnce(Error("invalid-utf8"));

    const root = directory("자료", {
      "bad.md": new File([new Uint8Array([0xc3, 0x28])], "bad.md"),
      "large.txt": new File([new Uint8Array(DOCUMENT_LIMITS.fileBytes + 1)], "large.txt")
    });
    const result = await readSourceSnapshot(root, { kind: "all" }, "x", () => { });

    expect(result.complete).toBe(false);
    expect(result.documents).toHaveLength(0);
    expect(result.excluded.map(entry => entry.reason)).toEqual(["invalid-utf8", "too-large"]);
    expect(readText).toHaveBeenCalledOnce();
  });

  it("does not claim complete after a directory listing limit", async () => {
    const entries = Object.fromEntries(
      Array.from({ length: 1001 }, (_, index) => [`${index}.pdf`, new File([], `${index}.pdf`)])
    );
    const result = await readSourceSnapshot(
      directory("자료", entries),
      { kind: "all" },
      "x",
      () => { }
    );

    expect(result.complete).toBe(false);
    expect(result.limits).toContain("listing-limit");
  });

  it("bounds accepted documents and aggregate bytes independently", async () => {
    readText.mockImplementation(async (file: File) => ({
      sha256: "a".repeat(64),
      excerptHash: "b".repeat(64),
      excerpt: "x",
      size: file.size
    }));

    const small = Object.fromEntries(
      Array.from({ length: 501 }, (_, index) => [`${index}.md`, new File([], `${index}.md`)])
    );
    const documents = await readSourceSnapshot(
      directory("자료", small),
      { kind: "all" },
      "x",
      () => { }
    );

    expect(documents.documents).toHaveLength(500);
    expect(documents.limits).toContain("document-limit");
    expect(documents.complete).toBe(false);

    const body = new File([new Uint8Array(DOCUMENT_LIMITS.fileBytes)], "body.md");
    const large = Object.fromEntries(
      Array.from({ length: 26 }, (_, index) => [`${index}.md`, body])
    );
    const bytes = await readSourceSnapshot(
      directory("자료", large),
      { kind: "all" },
      "x",
      () => { }
    );

    expect(bytes.bytes).toBe(DOCUMENT_LIMITS.workspaceTextBytes);
    expect(bytes.documents).toHaveLength(25);
    expect(bytes.limits).toContain("bytes-limit");
  });

  it("rejects permission loss and marks an externally changed version as incomplete", async () => {
    const root = directory("자료", { "a.txt": new File(["x"], "a.txt") });

    vi.mocked(root.queryPermission).mockResolvedValue("denied");
    await expect(readSourceSnapshot(root, { kind: "all" }, "x", () => { })).rejects.toMatchObject({
      name: "NotAllowedError"
    });
    expect(readText).not.toHaveBeenCalled();

    const root2 = directory("자료", { "a.txt": new File(["x"], "a.txt", { lastModified: 1 }) });

    vi.mocked(root2.getFileHandle).mockResolvedValue({
      getFile: vi
        .fn()
        .mockResolvedValueOnce(new File(["x"], "a.txt", { lastModified: 1 }))
        .mockResolvedValueOnce(new File(["y"], "a.txt", { lastModified: 2 }))
    } as unknown as FileSystemFileHandle);
    readText.mockResolvedValue({
      sha256: "a".repeat(64),
      excerptHash: "b".repeat(64),
      excerpt: "x",
      size: 1
    });

    const changed = await readSourceSnapshot(
      root2,
      { kind: "selected", entries: [{ path: ["a.txt"], kind: "file" }] },
      "x",
      () => { }
    );

    expect(changed.complete).toBe(false);
    expect(changed.excluded).toEqual([{ path: ["a.txt"], reason: "source-changed" }]);
  });

  it("disposes and rejects a late result after cancellation instead of returning a partial success", async () => {
    const abort = new AbortController();

    readText.mockImplementationOnce(async () => {
      abort.abort();

      return { sha256: "a".repeat(64), excerptHash: "b".repeat(64), excerpt: "x", size: 1 };
    });

    const root = directory("자료", { "a.txt": new File(["x"], "a.txt") });

    await expect(
      readSourceSnapshot(root, { kind: "all" }, "x", () => { }, abort.signal)
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(dispose).toHaveBeenCalledOnce();
  });
});
