import { afterEach, describe, expect, it, vi } from "vitest";
import { FolderConnectionSession } from "../../../src/features/local-folders/connection-session";
import type { FolderHandle, HandleRepository } from "../../../src/features/local-folders/types";
import type { SourceSnapshot } from "../../../src/features/local-folders/organization/source-snapshot-rules";
import { LocalTextIndex } from "../../../src/features/local-folders/search/documents/local-text-index";

const scan = vi.hoisted(() => vi.fn());

vi.mock("../../../src/features/local-folders/organization/source-snapshot", () => ({
  readSourceSnapshot: scan
}));

const result: SourceSnapshot = {
  documents: [],
  excluded: [],
  complete: true,
  limits: [],
  discoveredFiles: 0,
  directories: 1,
  bytes: 0
};

async function session() {
  const repository: HandleRepository = { read: vi.fn(), write: vi.fn(), remove: vi.fn() };
  const folder = {
    kind: "directory",
    name: "fixture",
    queryPermission: vi.fn(async () => "granted"),
    requestPermission: vi.fn(async () => "granted")
  } as unknown as FolderHandle;
  const session = new FolderConnectionSession(repository);

  await session.switchOwner({ userId: "A", workspaceId: "test" });
  await session.select("source", async () => folder);

  return { session, folder };
}

afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

describe("organization snapshot owning connection", () => {
  it("a user scan interrupts an automatic scan as a benign skip and preserves its saved checkpoint", async () => {
    const current = await session();
    vi.spyOn(LocalTextIndex.prototype, "readScan").mockResolvedValue(undefined);
    const save = vi.spyOn(LocalTextIndex.prototype, "saveScan").mockResolvedValue();
    let release!: (value: SourceSnapshot) => void;
    scan.mockImplementationOnce(() => new Promise<SourceSnapshot>(resolve => { release = resolve; }));
    const automatic = current.session.pollSourceIndex(new AbortController().signal);

    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    scan.mockResolvedValueOnce(result);
    const user = current.session.inspectSourceSnapshot({ kind: "all" }, "자료", new AbortController().signal);
    release(result);

    await expect(automatic).resolves.toBeNull();
    await expect(user).resolves.toEqual(result);
    expect(save).not.toHaveBeenCalled();
  });
  it("an automatic poll skips an active user snapshot instead of invalidating it", async () => {
    const current = await session();
    let release!: (value: SourceSnapshot) => void;
    scan.mockImplementationOnce(() => new Promise<SourceSnapshot>(resolve => { release = resolve; }));
    const pending = current.session.inspectSourceSnapshot({ kind: "all" }, "자료", new AbortController().signal);

    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    expect(await current.session.pollSourceIndex(new AbortController().signal)).toBeNull();
    release(result);
    await expect(pending).resolves.toEqual(result);
  });
  it("rechecks only confirmed paths and returns the session owner, retaining the original document IDs", async () => {
    const current = await session();
    const document = {
      id: "document-8",
      name: "a.md",
      path: ["a.md"],
      size: 3,
      lastModified: 42,
      sha256: "a".repeat(64),
      excerpt: "abc",
      excerptHash: "b".repeat(64)
    };

    scan.mockResolvedValueOnce({ ...result, documents: [{ ...document, id: "document-1" }] });
    expect(await current.session.recheckSourceSnapshot([document], "abc", new AbortController().signal))
      .toEqual({ userId: "A", workspaceId: "test" });
    expect(scan.mock.calls.at(-1)?.[0]).toEqual({ createReader: expect.any(Function), createIndex: expect.any(Function), now: expect.any(Function), parserVersion: 2 });
    expect(scan.mock.calls.at(-1)?.[2]).toEqual({ kind: "selected", entries: [{ path: ["a.md"], kind: "file" }] });
  });

  it.each(["sha256", "excerptHash", "excerpt", "lastModified", "missing", "partial"])("rejects changed %s even with the same size", async change => {
    const current = await session();
    const document = {
      id: "document-1",
      name: "a.md",
      path: ["a.md"],
      size: 3,
      lastModified: 42,
      sha256: "a".repeat(64),
      excerpt: "abc",
      excerptHash: "b".repeat(64)
    };
    const changed = { ...document };

    if (change === "sha256") changed.sha256 = "c".repeat(64);

    if (change === "excerptHash") changed.excerptHash = "c".repeat(64);

    if (change === "excerpt") changed.excerpt = "abd";

    if (change === "lastModified") changed.lastModified++;

    scan.mockResolvedValueOnce({ ...result, complete: change !== "partial", documents: change === "missing" ? [] : [changed] });
    await expect(current.session.recheckSourceSnapshot([document], "abc", new AbortController().signal)).rejects.toThrow("source-changed");
  });

  it("rejects stale output after owner, disconnect, replacement, new scan and abort", async () => {
    for (const action of ["owner", "disconnect", "replace", "scan", "abort"] as const) {
      const current = await session();
      let resolve!: (value: SourceSnapshot) => void;

      scan.mockImplementationOnce(
        () =>
          new Promise<SourceSnapshot>(done => {
            resolve = done;
          })
      );

      const abort = new AbortController();
      const pending = current.session.inspectSourceSnapshot({ kind: "all" }, "자료", abort.signal);
      const rejection = expect(pending).rejects.toThrow();
      let next: Promise<SourceSnapshot> | undefined;

      await vi.waitFor(() => expect(resolve).toBeTypeOf("function"));

      if (action === "owner")
        await current.session.switchOwner({ userId: "B", workspaceId: "test" });

      if (action === "disconnect") await current.session.disconnect("source");

      if (action === "replace") await current.session.select("source", async () => current.folder);

      if (action === "abort") abort.abort();

      if (action === "scan") {
        scan.mockResolvedValueOnce(result);
        next = current.session.inspectSourceSnapshot(
          { kind: "all" },
          "새 요청",
          new AbortController().signal
        );
      }

      resolve(result);
      await rejection;
      await next;
    }
  });

  it("revokes the current permission state without requesting a new permission", async () => {
    const current = await session();

    vi.mocked(current.folder.requestPermission).mockClear();
    scan.mockRejectedValueOnce(new DOMException("synthetic denial", "NotAllowedError"));
    await expect(
      current.session.inspectSourceSnapshot({ kind: "all" }, "자료", new AbortController().signal)
    ).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(current.session.state("source")).toBe("needs-permission");
    expect(current.folder.requestPermission).not.toHaveBeenCalled();
  });
});
