import { describe, expect, it, vi } from "vitest";
import { inspectHistoryTarget } from "../../../src/features/local-folders/services/history-target-inspection";
import type { HistoryGroup } from "../../../src/features/local-folders/lib/folder-history";
import type { FolderHandle } from "../../../src/features/local-folders/types";
import { FolderConnectionSession } from "../../../src/features/local-folders/services/connection-session";

const owner = { userId: "test", workspaceId: "work" };
const group: HistoryGroup = {
  id: "id",
  path: ["note.txt"],
  kind: "txt",
  status: "uncertain",
  time: "2026-10-31T00:00:00.000Z",
  count: 1
};
const failure = (name: string) => new DOMException(name, name);

function fixture(actual: "file" | "directory" | null = "file") {
  const record = { version: 1, ...group, status: "pending", owner };
  const history = {
    values: async function* () {
      yield {
        name: "moa-folder-id.json",
        kind: "file",
        getFile: async () => new File([JSON.stringify(record)], "record.json")
      };
    }
  };
  const target = {
    kind: actual,
    isSameEntry: vi.fn(async () => true),
    getFile: vi.fn(),
    values: vi.fn(),
    createWritable: vi.fn()
  };
  const root = {
    queryPermission: vi.fn(async () => "granted"),
    requestPermission: vi.fn(),
    removeEntry: vi.fn(),
    isSameEntry: vi.fn(async () => true),
    getDirectoryHandle: vi.fn(async (name: string) => {
      if (name === ".moa-history") return history;

      if (actual === "directory") return target;

      throw failure(actual === "file" ? "TypeMismatchError" : "NotFoundError");
    }),
    getFileHandle: vi.fn(async () => {
      if (actual === "file") return target;

      throw failure("NotFoundError");
    }),
  };
  const read = (expected = group, guard = () => { }) => inspectHistoryTarget(root as unknown as FolderHandle, [], owner, expected, guard);

  return { root, target, record, read };
}

describe("read-only history target inspection", () => {
  it.each([["file", "present"], ["directory", "kind-mismatch"], [null, "missing"]] as const)("reports %s as %s without inferring creation success", async (kind, status) => {
    const f = fixture(kind);

    expect(await f.read()).toMatchObject({ status, actualKind: kind, path: ["note.txt"] });
    expect(f.target.getFile).not.toHaveBeenCalled();
    expect(f.target.values).not.toHaveBeenCalled();
    expect(f.target.createWritable).not.toHaveBeenCalled();
    expect(f.root.requestPermission).not.toHaveBeenCalled();
    expect(f.root.removeEntry).not.toHaveBeenCalled();
    expect(f.root.getDirectoryHandle).toHaveBeenCalledWith("note.txt", { create: false });

    if (kind === "file") expect(f.root.getFileHandle).toHaveBeenCalledWith("note.txt", { create: false });

    expect(f.root.getDirectoryHandle.mock.calls.every(call => call[0] === ".moa-history" || call[0] === "note.txt")).toBe(true);
  });
  it("matches directory records and never enumerates the target", async () => {
    const f = fixture("directory");

    f.record.kind = "folder";
    expect(await f.read({ ...group, kind: "folder" })).toMatchObject({ status: "present", actualKind: "directory" });
    expect(f.target.values).not.toHaveBeenCalled();
  });
  it.each([
    { path: ["different.txt"] }, { kind: "md" }, { time: "2026-10-31T01:00:00.000Z" }, { owner: { ...owner, userId: "other" } }, { id: "changed" },
  ])("rejects changed records before touching a target: %j", async change => {
    const f = fixture();

    Object.assign(f.record, change);
    await expect(f.read()).rejects.toThrow("history-record-changed");
    expect(f.root.getFileHandle).not.toHaveBeenCalled();
    expect(f.root.getDirectoryHandle.mock.calls.every(call => call[0] === ".moa-history")).toBe(true);
  });
  it.each([{ path: null }, { kind: null }, { status: "ready" as const }, { path: ["..", "outside"] }])("rejects non-inspectable selection %j", async change => {
    const f = fixture();

    await expect(f.read({ ...group, ...change })).rejects.toThrow("history-record-changed");
    expect(f.root.getFileHandle).not.toHaveBeenCalled();
  });
  it("does not call missing parent a missing target", async () => {
    const f = fixture();

    f.record.path = ["nested", "note.txt"];
    f.root.getDirectoryHandle.mockRejectedValue(failure("NotFoundError"));
    await expect(inspectHistoryTarget(f.root as unknown as FolderHandle, ["nested"], owner, { ...group, path: ["nested", "note.txt"] }, () => { })).rejects.toMatchObject({ name: "NotFoundError" });
  });
  it("rejects parent replacement", async () => {
    const f = fixture();

    f.root.isSameEntry.mockResolvedValue(false);
    await expect(f.read()).rejects.toThrow("history-target-changed");
  });
  it("rejects replacement of a same-kind target", async () => {
    const f = fixture();

    f.target.isSameEntry.mockResolvedValue(false);
    await expect(f.read()).rejects.toThrow("history-target-changed");
  });
  it("rejects disappearance between probes", async () => {
    const f = fixture();

    f.root.getFileHandle.mockResolvedValueOnce(f.target).mockRejectedValueOnce(failure("NotFoundError"));
    await expect(f.read()).rejects.toThrow("history-target-changed");
  });
  it("does not swallow permission loss or cancellation as absence", async () => {
    const f = fixture();

    f.root.getFileHandle.mockRejectedValue(failure("NotAllowedError"));
    await expect(f.read()).rejects.toMatchObject({ name: "NotAllowedError" });
    await expect(f.read(group, () => {
      throw failure("AbortError");
    })).rejects.toMatchObject({ name: "AbortError" });
  });
  it("rechecks final permission even when absent", async () => {
    const f = fixture(null);

    f.root.queryPermission.mockResolvedValueOnce("granted").mockResolvedValueOnce("granted").mockResolvedValueOnce("denied");
    await expect(f.read()).rejects.toMatchObject({ name: "NotAllowedError" });
  });
  it("session rejects disconnected access and a late result after owner replacement", async () => {
    const f = fixture();

    Object.assign(f.root, { name: "source", kind: "directory" });

    const session = new FolderConnectionSession({ read: vi.fn(), write: vi.fn(), remove: vi.fn() });
    const signal = new AbortController().signal;

    await expect(session.inspectSourceHistoryTarget([], group, signal)).rejects.toThrow("source-folder-not-connected");
    await session.switchOwner(owner);
    await session.select("source", async () => f.root as unknown as FolderHandle);
    f.target.isSameEntry.mockImplementation(async () => {
      await session.switchOwner({ ...owner, userId: "other" });

      return true;
    });
    await expect(session.inspectSourceHistoryTarget([], group, signal)).rejects.toThrow("stale-connection-operation");
  });
  it("stops after cancellation during a target lookup", async () => {
    const f = fixture();
    let cancelled = false;

    f.root.getFileHandle.mockImplementation(async () => {
      cancelled = true;

      return f.target;
    });
    await expect(f.read(group, () => {
      if (cancelled) throw failure("AbortError");
    })).rejects.toMatchObject({ name: "AbortError" });
    expect(f.target.isSameEntry).not.toHaveBeenCalled();
  });
});
