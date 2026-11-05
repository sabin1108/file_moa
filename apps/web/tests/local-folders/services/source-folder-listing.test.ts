import { describe, expect, it, vi } from "vitest";
import { withAbsentVaultMarker } from "../fixtures/absent-vault-marker";
import { FolderConnectionSession } from "../../../src/features/local-folders/services/connection-session";
import type { FolderHandle, HandleRepository } from "../../../src/features/local-folders/types";

const owner = { userId: "listing-test", workspaceId: "test" };
const file = (name: string) => ({ kind: "file" as const, name });
const directory = (name: string) => ({ kind: "directory" as const, name });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

// Only browser boundaries are synthetic; every assertion runs the production session/reader.
function folder(name: string, entries: { name: string; kind: "file" | "directory" }[] = [file("노트.md")]) {
  return withAbsentVaultMarker({
    kind: "directory" as const,
    name,
    queryPermission: vi.fn(async (): Promise<PermissionState> => "granted"),
    requestPermission: vi.fn(async (): Promise<PermissionState> => "granted"),
    getDirectoryHandle: vi.fn(async (childName: string): Promise<unknown> => folder(childName, [])),
    values: vi.fn(async function* () {
      yield* entries;
    }),
    removeEntry: vi.fn(() => { throw new Error("forbidden-write"); }),
    getFileHandle: vi.fn(() => { throw new Error("forbidden-file-read"); }),
  });
}

type TestFolder = ReturnType<typeof folder>;
const asHandle = (value: TestFolder) => value as unknown as FolderHandle;

async function connected(root = folder("자료")) {
  const repository: HandleRepository = {
    read: vi.fn(async () => undefined),
    write: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
  };
  const session = new FolderConnectionSession(repository);
  await session.switchOwner(owner);
  await session.select("source", async () => asHandle(root));
  root.queryPermission.mockClear();
  vi.mocked(repository.write).mockClear();
  return { session, root, repository };
}

describe("source folder listing", () => {
  it("LIST-001/010 returns sorted direct display entries without reading bodies or changing sources", async () => {
    const root = folder("자료");
    root.values.mockImplementation(async function* () {
      yield file("z.pdf");
      yield directory("하위");
      yield file("a.txt");
    });
    const { session, repository } = await connected(root);

    const result = await session.listSourceFolder([]);

    expect(result).toEqual({ path: [], entries: [directory("하위"), file("a.txt"), file("z.pdf")], truncated: false });
    expect(root.getDirectoryHandle).toHaveBeenCalledWith("하위", { create: false });
    expect(root.getFileHandle).not.toHaveBeenCalled();
    expect(root.removeEntry).not.toHaveBeenCalled();
    expect(root.requestPermission).not.toHaveBeenCalled();
    expect(repository.write).not.toHaveBeenCalled();
    expect(repository.remove).not.toHaveBeenCalled();
    expect(root.queryPermission).toHaveBeenCalledWith({ mode: "read" });
  });

  it("LIST-001/009/010 opens only the requested child with create:false and snapshots the path", async () => {
    const { session, root } = await connected();
    const child = folder("하위");
    const permission = deferred<PermissionState>();
    root.queryPermission.mockReturnValueOnce(permission.promise);
    root.getDirectoryHandle.mockResolvedValue(child);
    const path = ["하위"];

    const pending = session.listSourceFolder(path);
    path[0] = "다른 폴더";
    permission.resolve("granted");
    const result = await pending;

    expect(root.getDirectoryHandle).toHaveBeenCalledExactlyOnceWith("하위", { create: false });
    expect(root.values).not.toHaveBeenCalled();
    expect(result.path).toEqual(["하위"]);
    expect(result.entries).toEqual([file("노트.md")]);
  });

  it("LIST-002 returns empty only after successful enumeration", async () => {
    const { session } = await connected(folder("빈 폴더", []));
    expect(await session.listSourceFolder([])).toEqual({ path: [], entries: [], truncated: false });
  });

  it("LIST-003 rejects disconnected and restored connections without reading files", async () => {
    const { session, root, repository } = await connected();
    await session.disconnect("source");
    await expect(session.listSourceFolder([])).rejects.toThrow("source-folder-not-connected");
    vi.mocked(repository.read).mockResolvedValue(asHandle(root));
    await session.switchOwner(owner);
    await expect(session.listSourceFolder([])).rejects.toThrow("source-folder-not-connected");
    expect(root.values).not.toHaveBeenCalled();
    expect(root.queryPermission).not.toHaveBeenCalled();
  });

  it("LIST-004 requires reconnection for prompt/denied without requesting permission or deleting references", async () => {
    for (const permission of ["prompt", "denied"] as const) {
      const { session, root, repository } = await connected();
      root.queryPermission.mockResolvedValue(permission);
      await expect(session.listSourceFolder([])).rejects.toMatchObject({ name: "NotAllowedError" });
      expect(session.state("source")).toBe("needs-permission");
      expect(root.values).not.toHaveBeenCalled();
      expect(root.requestPermission).not.toHaveBeenCalled();
      expect(repository.remove).not.toHaveBeenCalled();
    }
  });

  it("LIST-004 rejects a completed listing if permission is revoked before publication", async () => {
    const { session, root } = await connected();
    root.queryPermission.mockResolvedValueOnce("granted").mockResolvedValueOnce("denied");
    await expect(session.listSourceFolder([])).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(root.values).toHaveBeenCalledOnce();
    expect(session.state("source")).toBe("needs-permission");
  });

  it("LIST-004/005 rejects partial enumeration on permission, missing entry, or I/O failures", async () => {
    for (const name of ["NotAllowedError", "NotFoundError", "NotReadableError"]) {
      const { session, root } = await connected();
      root.values.mockImplementation(async function* () {
        yield file("先に読めた.txt");
        throw new DOMException("injected failure", name);
      });
      await expect(session.listSourceFolder([])).rejects.toMatchObject({ name });
      expect(session.state("source")).toBe(name === "NotAllowedError" ? "needs-permission" : "connected");
    }
  });

  it("LIST-005 preserves a missing-child error without creating it or treating it as empty", async () => {
    const { session, root } = await connected();
    root.getDirectoryHandle.mockRejectedValue(new DOMException("missing", "NotFoundError"));
    await expect(session.listSourceFolder(["消えた"])).rejects.toMatchObject({ name: "NotFoundError" });
    expect(root.getDirectoryHandle).toHaveBeenCalledExactlyOnceWith("消えた", { create: false });
    expect(session.state("source")).toBe("connected");
  });

  it("LIST-006 distinguishes the exact limit from overflow and stops at one lookahead", async () => {
    for (const count of [1000, 1002]) {
      const { session, root } = await connected();
      let visited = 0;
      let closed = false;
      root.values.mockImplementation(async function* () {
        try {
          for (let index = 0; index < count; index++) {
            visited++;
            yield file(`file-${index}.txt`);
          }
        } finally {
          closed = true;
        }
      });
      const result = await session.listSourceFolder([]);
      expect(result.entries).toHaveLength(1000);
      expect(result.truncated).toBe(count > 1000);
      expect(visited).toBe(Math.min(count, 1001));
      expect(closed).toBe(true);
    }
  });

  it("LIST-007 rejects pre-cancellation without I/O and cancellation during a pending read without results", async () => {
    const { session, root } = await connected();
    const stopped = new AbortController();
    stopped.abort();
    await expect(session.listSourceFolder([], stopped.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(root.queryPermission).not.toHaveBeenCalled();

    const gate = deferred<void>();
    const entered = deferred<void>();
    root.values.mockImplementation(async function* () {
      entered.resolve();
      await gate.promise;
      yield file("late.txt");
    });
    const controller = new AbortController();
    const pending = session.listSourceFolder([], controller.signal);
    const rejection = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await entered.promise;
    controller.abort();
    gate.resolve();
    await rejection;
    expect(root.queryPermission).toHaveBeenCalledTimes(1);
  });

  it("LIST-008 discards old successful reads after a new request, owner switch, disconnect, or replacement", async () => {
    for (const action of ["refresh", "owner", "disconnect", "replace"]) {
      const { session, root } = await connected();
      const permission = deferred<PermissionState>();
      root.queryPermission.mockReturnValueOnce(permission.promise);
      const old = session.listSourceFolder([]);
      const rejection = expect(old).rejects.toThrow("stale-connection-operation");
      if (action === "refresh") await session.listSourceFolder([]);
      if (action === "owner") await session.switchOwner({ ...owner, userId: "other" });
      if (action === "disconnect") await session.disconnect("source");
      if (action === "replace") await session.select("source", async () => asHandle(folder("別")));
      permission.resolve("granted");
      await rejection;
      expect(root.values).toHaveBeenCalledTimes(action === "refresh" ? 1 : 0);
    }
  });

  it("LIST-008 does not let old permission failures disconnect a new connection", async () => {
    const { session, root } = await connected();
    const permission = deferred<PermissionState>();
    root.queryPermission.mockReturnValueOnce(permission.promise);
    const old = session.listSourceFolder([]);
    const rejection = expect(old).rejects.toThrow("stale-connection-operation");
    await session.select("source", async () => asHandle(folder("새 자료")));
    permission.reject(new DOMException("revoked", "NotAllowedError"));
    await rejection;
    expect(session.view("source")).toEqual({ status: "connected", folderName: "새 자료" });
  });

  it("LIST-008 discards entries arriving after disconnect during enumeration", async () => {
    const { session, root } = await connected();
    const entered = deferred<void>();
    const resume = deferred<void>();
    let visited = 0;
    root.values.mockImplementation(async function* () {
      entered.resolve();
      await resume.promise;
      visited++;
      yield file("late.txt");
      visited++;
      yield file("must-not-read.txt");
    });
    const pending = session.listSourceFolder([]);
    const rejection = expect(pending).rejects.toThrow("stale-connection-operation");
    await entered.promise;
    await session.disconnect("source");
    resume.resolve();
    await rejection;
    expect(visited).toBe(1);
    expect(root.queryPermission).toHaveBeenCalledTimes(1);
  });

  it("LIST-007 rejects cancellation during the final permission check even for an empty directory", async () => {
    const { session, root } = await connected(folder("empty", []));
    const finalPermission = deferred<PermissionState>();
    const entered = deferred<void>();
    root.queryPermission.mockResolvedValueOnce("granted").mockImplementationOnce(() => {
      entered.resolve();
      return finalPermission.promise;
    });
    const controller = new AbortController();
    const pending = session.listSourceFolder([], controller.signal);
    const rejection = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await entered.promise;
    controller.abort();
    finalPermission.resolve("granted");
    await rejection;
    expect(session.state("source")).toBe("connected");
  });

  it("LIST-009 rejects invalid path segments before permission queries or directory access", async () => {
    const { session, root } = await connected();
    for (const segment of ["", ".", "..", "a/b", "a\\b", "a\0b"]) {
      await expect(session.listSourceFolder([segment])).rejects.toThrow("invalid-folder-path");
    }
    expect(root.queryPermission).not.toHaveBeenCalled();
    expect(root.getDirectoryHandle).not.toHaveBeenCalled();
  });
});
