import { afterEach, describe, expect, it, vi } from "vitest";
import { DOCUMENT_LIMITS } from "@personal-ai/domain";
import { readSourceSnapshot } from "../../../src/features/local-folders/services/source-snapshot";
import type { FolderHandle } from "../../../src/features/local-folders/types";
import { withAbsentVaultMarker } from "../fixtures/absent-vault-marker";

const readText = vi.hoisted(() => vi.fn());
const dispose = vi.hoisted(() => vi.fn());
vi.mock("../../../src/features/local-folders/services/copy-hash", () => ({
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

afterEach(() => vi.clearAllMocks());

describe("read-only TXT/MD organization snapshot", () => {
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
      "photo.pdf": new File(["unsupported"], "photo.pdf"),
      ".moa-history": directory(".moa-history", {
        "secret.txt": new File(["internal"], "secret.txt")
      })
    });

    const result = await readSourceSnapshot(root, { kind: "all" }, "성능 자료", () => {});

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
      path: ["photo.pdf"],
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
      () => {}
    );
    expect(result.documents.map(document => document.path)).toEqual([["회사", "a.txt"]]);
    expect(readText).toHaveBeenCalledOnce();
  });

  it("rejects unsafe/empty selections before disk access", async () => {
    const root = directory("자료", {});
    await expect(
      readSourceSnapshot(root, { kind: "folder", path: [".."] }, "x", () => {})
    ).rejects.toThrow();
    await expect(
      readSourceSnapshot(root, { kind: "selected", entries: [] }, "x", () => {})
    ).rejects.toThrow();
    expect(root.queryPermission).not.toHaveBeenCalled();
  });

  it("reports failed UTF-8 and rejects oversized files before asking the Worker to read", async () => {
    readText.mockRejectedValueOnce(Error("invalid-utf8"));
    const root = directory("자료", {
      "bad.md": new File([new Uint8Array([0xc3, 0x28])], "bad.md"),
      "large.txt": new File([new Uint8Array(DOCUMENT_LIMITS.fileBytes + 1)], "large.txt")
    });
    const result = await readSourceSnapshot(root, { kind: "all" }, "x", () => {});
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
      () => {}
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
      () => {}
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
      () => {}
    );
    expect(bytes.bytes).toBe(DOCUMENT_LIMITS.workspaceTextBytes);
    expect(bytes.documents).toHaveLength(25);
    expect(bytes.limits).toContain("bytes-limit");
  });

  it("rejects permission loss and marks an externally changed version as incomplete", async () => {
    const root = directory("자료", { "a.txt": new File(["x"], "a.txt") });
    vi.mocked(root.queryPermission).mockResolvedValue("denied");
    await expect(readSourceSnapshot(root, { kind: "all" }, "x", () => {})).rejects.toMatchObject({
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
      () => {}
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
      readSourceSnapshot(root, { kind: "all" }, "x", () => {}, abort.signal)
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(dispose).toHaveBeenCalledOnce();
  });
});
