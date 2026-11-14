import { describe, expect, it, vi } from "vitest";
import { readFolderHistory } from "../../../src/features/local-folders/history/folder-history";
import { FolderConnectionSession } from "../../../src/features/local-folders/connection-session";
import type { FolderHandle, HandleRepository } from "../../../src/features/local-folders/types";

const owner = { userId: "test", workspaceId: "work" };
const record = (status: string, extra: Record<string, unknown> = {}) => ({
  version: 1,
  id: "operation-1",
  path: ["note.txt"],
  kind: "txt",
  status,
  time: status === "pending" ? "2026-10-31T00:00:00.000Z" : "2026-10-31T00:00:01.000Z",
  owner,
  ...extra,
});

// Browser handles are simulated; bytes use real File/UTF-8 APIs. Every write-like call is observable.

function fixture(payloads: (unknown | Uint8Array)[] = []) {
  const reads = vi.fn();
  const files = payloads.map((payload, index) => ({
    name: `moa-folder-fixture-${index}.json`,
    kind: "file",
    getFile: vi.fn(async () => {
      reads(index);

      const bytes = payload instanceof Uint8Array ? payload : JSON.stringify(payload);

      return new File([bytes as BlobPart], "record.json");
    }),
    createWritable: vi.fn(),
  }));
  const history = {
    values: async function* () {
      yield* files;
    }
  } as unknown as FileSystemDirectoryHandle;
  const root = {
    queryPermission: vi.fn(async () => "granted"),
    requestPermission: vi.fn(),
    getDirectoryHandle: vi.fn(async () => history),
    getFileHandle: vi.fn(),
    removeEntry: vi.fn(),
  } as unknown as FolderHandle;
  const read = (path: readonly string[] = [], guard = () => { }) => readFolderHistory(root, path, owner, guard);

  return { root, history, files, reads, read };
}

describe("current folder history reads", () => {
  it("does not create absent history or request write permission", async () => {
    const f = fixture();

    vi.mocked(f.root.getDirectoryHandle).mockRejectedValue(new DOMException("missing", "NotFoundError"));
    expect(await f.read()).toMatchObject({ groups: [], missing: true, incomplete: false });
    expect(f.root.getDirectoryHandle).toHaveBeenCalledWith(".moa-history", { create: false });
    expect(f.root.requestPermission).not.toHaveBeenCalled();
    expect(f.root.getFileHandle).not.toHaveBeenCalled();
    expect(f.root.removeEntry).not.toHaveBeenCalled();
    expect(f.root.queryPermission).toHaveBeenCalledTimes(2);
  });

  it("groups pending and ready into one recorded result without mutating bytes", async () => {
    const f = fixture([record("ready"), record("pending")]);
    const result = await f.read();

    expect(result.groups).toEqual([expect.objectContaining({ id: "operation-1", path: ["note.txt"], kind: "txt", status: "ready", count: 2 })]);
    expect(f.files.every(file => file.createWritable.mock.calls.length === 0)).toBe(true);
    expect(f.root.requestPermission).not.toHaveBeenCalled();
  });

  it.each([
    ["pending only", [record("pending")], "uncertain"],
    ["terminal only", [record("ready")], "uncertain"],
    ["failed", [record("pending"), record("failed")], "failed"],
    ["uncertain", [record("pending"), record("uncertain")], "uncertain"],
    ["contradictory terminal", [record("pending"), record("ready"), record("failed")], "uncertain"],
    ["terminal before pending", [record("pending"), record("ready", { time: "2026-10-30T00:00:00.000Z" })], "uncertain"],
  ] as const)("handles %s conservatively", async (_label, records, status) => {
    expect((await fixture([...records]).read()).groups[0].status).toBe(status);
  });

  it("does not pick a true path or kind from conflicting records", async () => {
    const result = await fixture([record("pending"), record("ready", { path: ["different.md"], kind: "md" })]).read();

    expect(result.groups[0]).toMatchObject({ path: null, kind: null, status: "uncertain" });
  });

  it("supports legacy folder records and stable newest-first ordering", async () => {
    const older = [record("pending", { id: "old", kind: undefined }), record("ready", { id: "old", kind: undefined })];
    const newer = [record("pending", { id: "new", time: "2026-10-31T01:00:00.000Z" }), record("ready", { id: "new", time: "2026-10-31T01:00:01.000Z" })];
    const result = await fixture([...older, ...newer]).read();

    expect(result.groups.map(group => group.id)).toEqual(["new", "old"]);
    expect(result.groups[1].kind).toBe("folder");
  });

  it("excludes other owners and rejects records outside the current parent", async () => {
    const f = fixture([record("ready", { owner: { ...owner, userId: "other" } }), record("ready", { path: ["other", "note.txt"] })]);

    expect(await f.read()).toMatchObject({ groups: [], excluded: 1, invalid: 1, incomplete: true });
  });

  it.each([
    ["version", record("ready", { version: 9 })],
    ["path traversal", record("ready", { path: [".."] })],
    ["bad time", record("ready", { time: "2026-02-30T00:00:00.000Z" })],
    ["bad status", record("deleted")],
    ["bad kind", record("ready", { kind: "exe" })],
    ["bad JSON", new TextEncoder().encode("{broken")],
    ["bad UTF-8", new Uint8Array([0xff])],
    ["oversize", new Uint8Array(65537)],
  ])("reports %s and never asserts a complete result", async (_label, bad) => {
    const result = await fixture([record("pending"), record("ready"), bad]).read();

    expect(result.incomplete).toBe(true);
    expect(result.groups[0].status).toBe("uncertain");
    expect(result.invalid + result.unsupported + result.unreadable + result.oversized).toBe(1);
  });

  it("limits record reads and marks a partial snapshot", async () => {
    const f = fixture(Array.from({ length: 201 }, () => record("pending")));

    expect(await f.read()).toMatchObject({ truncated: true, incomplete: true });
    expect(f.reads).toHaveBeenCalledTimes(200);
  });

  it("bounds enumeration without opening unrelated entries or recursing", async () => {
    const f = fixture();
    const getFile = vi.fn();

    f.history.values = async function* (): AsyncGenerator<FileSystemFileHandle, undefined, unknown> {
      for (let index = 0; index < 1001; index++) yield { kind: "file", name: `unrelated-${index}.txt`, getFile } as unknown as FileSystemFileHandle;

      return undefined;
    };
    expect(await f.read()).toMatchObject({ truncated: true, groups: [] });
    expect(getFile).not.toHaveBeenCalled();
  });

  it("stops at the aggregate byte budget before reading another body", async () => {
    const f = fixture(Array.from(
      { length: 33 },
      () => new TextEncoder().encode(JSON.stringify(record("pending")).padEnd(65536))
    ));
    const bodies = vi.fn();

    for (const handle of f.files) handle.getFile.mockImplementation(async () => {
      const file = new File([JSON.stringify(record("pending")).padEnd(65536)], "record.json");
      const original = file.arrayBuffer.bind(file);

      file.arrayBuffer = async () => {
        bodies();

        return original();
      };

      return file;
    });

    expect(await f.read()).toMatchObject({ truncated: true, incomplete: true });
    expect(bodies).toHaveBeenCalledTimes(32);
  });

  it("reads only the selected nested parent and tolerates an individual missing record", async () => {
    const f = fixture([record("pending", { path: ["nested", "note.txt"] }), record("ready", { path: ["nested", "note.txt"] })]);
    const parent = { getDirectoryHandle: vi.fn(async () => f.history) } as unknown as FileSystemDirectoryHandle;

    vi.mocked(f.root.getDirectoryHandle).mockResolvedValue(parent);
    f.files[1].getFile.mockRejectedValue(new DOMException("removed", "NotFoundError"));
    expect(await f.read(["nested"])).toMatchObject({ unreadable: 1, incomplete: true, groups: [expect.objectContaining({ status: "uncertain" })] });
    expect(f.root.getDirectoryHandle).toHaveBeenCalledWith("nested", { create: false });
    expect(parent.getDirectoryHandle).toHaveBeenCalledWith(".moa-history", { create: false });
  });

  it("rejects bytes that do not match the reported snapshot size", async () => {
    const f = fixture([record("pending")]);

    f.files[0].getFile.mockResolvedValue({ size: 1, arrayBuffer: async () => new ArrayBuffer(2) } as File);
    expect(await f.read()).toMatchObject({ unreadable: 1, incomplete: true, groups: [] });
  });

  it("distinguishes a missing parent and a file occupying the history name", async () => {
    const f = fixture();

    vi.mocked(f.root.getDirectoryHandle).mockRejectedValue(new DOMException("missing", "NotFoundError"));
    await expect(f.read(["nested"])).rejects.toMatchObject({ name: "NotFoundError" });
    vi.mocked(f.root.getDirectoryHandle).mockRejectedValue(new DOMException("file", "TypeMismatchError"));
    await expect(f.read()).rejects.toThrow("history-not-directory");
  });

  it("propagates permission loss and cancellation instead of counting them as corrupt files", async () => {
    const f = fixture([record("pending")]);

    f.files[0].getFile.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    await expect(f.read()).rejects.toMatchObject({ name: "NotAllowedError" });
    await expect(f.read([], () => {
      throw new DOMException("cancelled", "AbortError");
    })).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rechecks permission after reading even an empty history", async () => {
    const f = fixture();

    vi.mocked(f.root.queryPermission).mockResolvedValueOnce("granted").mockResolvedValueOnce("denied");
    await expect(f.read()).rejects.toMatchObject({ name: "NotAllowedError" });
  });

  it("rejects late session results after the connected root changes", async () => {
    const f = fixture([record("pending")]);

    Object.assign(f.root, { name: "source", kind: "directory" });

    const repo: HandleRepository = { read: vi.fn(), write: vi.fn(), remove: vi.fn() };
    const session = new FolderConnectionSession(repo);

    await session.switchOwner(owner);
    await session.select("source", async () => f.root);
    f.files[0].getFile.mockImplementation(async () => {
      await session.switchOwner({ ...owner, userId: "replacement" });

      return new File([JSON.stringify(record("pending"))], "record.json");
    });
    await expect(session.readSourceHistory([])).rejects.toThrow("stale-connection-operation");
  });
});
