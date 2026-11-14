import { describe, expect, it, vi } from "vitest";
import { withAbsentVaultMarker } from "../../fixtures/absent-vault-marker";
import { DOCUMENT_LIMITS } from "@personal-ai/domain";
import { FolderConnectionSession } from "../../../../src/features/local-folders/connection-session";
import type { FolderHandle, HandleRepository } from "../../../../src/features/local-folders/types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });

  return { promise, resolve, reject };
}

function fixture() {
  const file = new File(["한글\r\n  원문"], "노트.md", { lastModified: 1234 });
  const getFile = vi.fn(async () => file);
  const root = {
    name: "자료",
    kind: "directory" as const,
    queryPermission: vi.fn(async (): Promise<PermissionState> => "granted"),
    requestPermission: vi.fn(async (): Promise<PermissionState> => "granted"),
    getDirectoryHandle: vi.fn(),
    getFileHandle: vi.fn(async () => ({ getFile })),
    values: vi.fn(async function* () {
      yield { name: "노트.md", kind: "file" as const };
    }),
    removeEntry: vi.fn(() => {
      throw new Error("forbidden-write");
    }),
  };

  withAbsentVaultMarker(root);

  return { root, getFile, file };
}

const handle = (root: ReturnType<typeof fixture>["root"]) => root as unknown as FolderHandle;

async function setup() {
  const f = fixture();
  const repository: HandleRepository = {
    read: vi.fn(async () => undefined),
    write: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined)
  };
  const session = new FolderConnectionSession(repository);

  await session.switchOwner({ userId: "preview", workspaceId: "fixture" });
  await session.select("source", async () => handle(f.root));
  f.root.queryPermission.mockClear();
  vi.mocked(repository.write).mockClear();

  return { ...f, session, repository };
}

describe("source file preview reader/session", () => {
  it("rejects a saved citation for another owner, connection or path before file I/O", async () => {
    const { session, root } = await setup();
    const expected = {
      owner: { userId: "preview", workspaceId: "fixture" },
      connectionId: "legacy",
      path: ["노트.md"],
      sha256: "a".repeat(64),
      size: 16,
      quote: "verified citation"
    };

    for (const invalid of [{ owner: { userId: "other", workspaceId: "fixture" } }, { owner: { userId: "preview", workspaceId: "other" } }, { connectionId: "other" }, { path: ["other.md"] }]) {
      await expect(session.readSourceFile(["노트.md"], undefined, { ...expected, ...invalid })).rejects.toThrow("citation-connection-mismatch");
    }

    expect(root.queryPermission).not.toHaveBeenCalled();
    expect(root.getFileHandle).not.toHaveBeenCalled();
  });
  it("PREVIEW-001/004/008 reads exact text and metadata without writes or permission requests", async () => {
    const { session, root, repository } = await setup();
    const result = await session.readSourceFile(["노트.md"]);

    expect(result).toEqual({ path: ["노트.md"], text: "한글\r\n  원문", size: 16, lastModified: 1234 });
    expect(root.getFileHandle).toHaveBeenCalledWith("노트.md", { create: false });
    expect(root.queryPermission).toHaveBeenCalledTimes(2);
    expect(root.queryPermission).toHaveBeenCalledWith({ mode: "read" });
    expect(root.requestPermission).not.toHaveBeenCalled();
    expect(root.removeEntry).not.toHaveBeenCalled();
    expect(repository.write).not.toHaveBeenCalled();
  });
  it("PREVIEW-001 snapshots nested paths before the first await", async () => {
    const { session, root, getFile } = await setup();
    const child = fixture().root;

    child.getFileHandle.mockResolvedValue({ getFile });
    root.getDirectoryHandle.mockResolvedValue(child);

    const gate = deferred<PermissionState>();

    root.queryPermission.mockReturnValueOnce(gate.promise);

    const path = ["하위", "노트.md"];
    const pending = session.readSourceFile(path);

    path[0] = "다른 곳";
    gate.resolve("granted");
    expect((await pending).path).toEqual(["하위", "노트.md"]);
    expect(root.getDirectoryHandle).toHaveBeenCalledWith("하위", { create: false });
  });
  it("PREVIEW-001 rejects invalid paths and unsupported extensions before I/O", async () => {
    const { session, root } = await setup();

    for (const path of [[], ["..", "a.md"], ["a/b.txt"], ["a\\b.md"], ["\0.txt"], [".", "a.md"], ["a.exe"]]) {
      await expect(session.readSourceFile(path)).rejects.toThrow();
    }

    expect(root.queryPermission).not.toHaveBeenCalled();
    expect(root.getFileHandle).not.toHaveBeenCalled();
  });
  it("PREVIEW-003/004 accepts empty, uppercase and BOM, preserves whitespace", async () => {
    const { session, getFile } = await setup();

    getFile.mockResolvedValueOnce(new File([], "EMPTY.TXT"));
    expect((await session.readSourceFile(["EMPTY.TXT"])).text).toBe("");
    getFile.mockResolvedValueOnce(new File([new Uint8Array([239, 187, 191]), "  본문\r\n"], "A.MD"));
    expect((await session.readSourceFile(["A.MD"])).text).toBe("  본문\r\n");
  });
  it("PREVIEW-003 accepts exactly 2MiB and rejects one more byte before body read", async () => {
    const { session, getFile } = await setup();

    getFile.mockResolvedValueOnce(new File(["a".repeat(DOCUMENT_LIMITS.fileBytes)], "a.txt"));
    expect((await session.readSourceFile(["a.txt"])).text.length).toBe(DOCUMENT_LIMITS.fileBytes);

    const tooLarge = new File(["a".repeat(DOCUMENT_LIMITS.fileBytes + 1)], "a.txt");
    const read = vi.spyOn(tooLarge, "arrayBuffer");

    getFile.mockResolvedValueOnce(tooLarge);
    await expect(session.readSourceFile(["a.txt"])).rejects.toThrow("too-large");
    expect(read).not.toHaveBeenCalled();
  });
  it("PREVIEW-004 rejects malformed UTF-8 instead of replacing bytes", async () => {
    const { session, getFile } = await setup();

    getFile.mockResolvedValueOnce(new File([new Uint8Array([0xc3, 0x28])], "a.md"));
    await expect(session.readSourceFile(["a.md"])).rejects.toThrow("invalid-utf8");
  });
  it("PREVIEW-002 rejects before and after read and marks reconnection without auto request", async () => {
    for (const afterRead of [false, true]) {
      const { session, root, getFile } = await setup();

      if (afterRead) root.queryPermission.mockResolvedValueOnce("granted");

      root.queryPermission.mockResolvedValueOnce("denied");
      await expect(session.readSourceFile(["a.txt"])).rejects.toMatchObject({ name: "NotAllowedError" });
      expect(session.state("source")).toBe("needs-permission");
      expect(getFile).toHaveBeenCalledTimes(afterRead ? 1 : 0);
      expect(root.requestPermission).not.toHaveBeenCalled();
    }
  });
  it("PREVIEW-005 propagates missing/type/read errors without empty success", async () => {
    const { session, getFile } = await setup();

    for (const name of ["NotFoundError", "TypeMismatchError", "NotReadableError"]) {
      getFile.mockRejectedValueOnce(new DOMException("synthetic", name));
      await expect(session.readSourceFile(["a.txt"])).rejects.toMatchObject({ name });
      expect(session.state("source")).toBe("connected");
    }
  });
  it("PREVIEW-006 cancels before I/O and discards a held body", async () => {
    const { session, root, file } = await setup();
    const signal = new AbortController();

    signal.abort();
    await expect(session.readSourceFile(["a.txt"], signal.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(root.getFileHandle).not.toHaveBeenCalled();

    const body = deferred<ArrayBuffer>();

    vi.spyOn(file, "arrayBuffer").mockReturnValue(body.promise);

    const current = new AbortController();
    const pending = session.readSourceFile(["a.txt"], current.signal);

    await vi.waitFor(() => expect(file.arrayBuffer).toHaveBeenCalled());
    current.abort();
    body.resolve(new ArrayBuffer(0));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
  it("PREVIEW-006 new request/owner/disconnect/replacement block old results", async () => {
    for (const action of ["request", "owner", "disconnect", "replace"]) {
      const { session, getFile, file } = await setup();
      const gate = deferred<File>();

      getFile.mockReturnValueOnce(gate.promise);

      const old = session.readSourceFile(["a.txt"]);

      await vi.waitFor(() => expect(getFile).toHaveBeenCalled());

      if (action === "request") await session.readSourceFile(["b.txt"]);

      if (action === "owner") await session.switchOwner({ userId: "B", workspaceId: "B" });

      if (action === "disconnect") await session.disconnect("source");

      if (action === "replace") await session.select("source", async () => handle(fixture().root));

      gate.resolve(file);
      await expect(old).rejects.toThrow("stale-connection-operation");
    }
  });
  it("PREVIEW-006 old permission error cannot revoke a replacement", async () => {
    const { session, getFile } = await setup();
    const gate = deferred<File>();

    getFile.mockReturnValueOnce(gate.promise);

    const old = session.readSourceFile(["a.txt"]);

    await vi.waitFor(() => expect(getFile).toHaveBeenCalled());
    await session.select("source", async () => handle(fixture().root));
    gate.reject(new DOMException("old", "NotAllowedError"));
    await expect(old).rejects.toThrow("stale-connection-operation");
    expect(session.state("source")).toBe("connected");
  });
  it("PREVIEW-007 listing and preview can finish independently", async () => {
    const { session, getFile, file } = await setup();
    const gate = deferred<File>();

    getFile.mockReturnValueOnce(gate.promise);

    const pending = session.readSourceFile(["a.txt"]);

    await vi.waitFor(() => expect(getFile).toHaveBeenCalled());
    expect((await session.listSourceFolder([])).entries).toHaveLength(1);
    gate.resolve(file);
    expect((await pending).text).toBe("한글\r\n  원문");
  });
  it("PREVIEW-002 rejects a disconnected handle without file I/O", async () => {
    const { session, root } = await setup();

    await session.disconnect("source");
    await expect(session.readSourceFile(["a.txt"])).rejects.toThrow("source-folder-not-connected");
    expect(root.getFileHandle).not.toHaveBeenCalled();
  });
});
