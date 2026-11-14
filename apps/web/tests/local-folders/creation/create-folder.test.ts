import { describe, expect, it, vi } from "vitest";
import { withAbsentVaultMarker } from "../fixtures/absent-vault-marker";
import { createEntry as createFolder } from "../../../src/features/local-folders/creation/create-entry";
import { resolveEntryName as validateNewFolderName } from "../../../src/features/local-folders/creation/new-entry";
import type { FolderHandle } from "../../../src/features/local-folders/types";
import type { FolderCreationRecord } from "../../../src/features/local-folders/creation/folder-creation-journal";

function fixture() {
  const entries: {
    name: string;
    kind: string
  }[] = [];
  const created = { kind: "directory", name: "새 폴더", isSameEntry: vi.fn(async () => true) };
  const root = {
    name: "root",
    queryPermission: vi.fn(async () => "granted"),
    requestPermission: vi.fn(async () => "granted"),
    values: async function* () {
      yield* entries;
    },
    isSameEntry: vi.fn(async () => true),
    getDirectoryHandle: vi.fn(async () => created)
  } as unknown as FolderHandle;
  const records: FolderCreationRecord[] = [];

  withAbsentVaultMarker(root);

  const journal = {
    put: vi.fn(async (record: FolderCreationRecord) => {
      records.push({ ...record });
    }),
    assertWritable: vi.fn(async () => { })
  };

  return { root, entries, records, journal, created };
}

describe("actual directory creation", () => {
  it.each(["", "..", "a/b", "a\\b", "CON", "NUL.txt", "trailing.", " trailing", "a\n", "a".repeat(256), ".moa-history", ".MOA-HISTORY"])("rejects invalid single name %j", name => {
    expect(() => validateNewFolderName(name)).toThrow();
  });
  it("requests permission immediately, records before writing and completes", async () => {
    const f = fixture();
    const task = createFolder(f.root, [], "새 폴더", () => { }, f.journal);

    expect(f.root.requestPermission).toHaveBeenCalledWith({ mode: "readwrite" });
    expect(await task).toEqual(["새 폴더"]);
    expect(f.records.map(r => r.status)).toEqual(["pending", "ready"]);
    expect(f.journal.put.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(f.root.getDirectoryHandle).mock.invocationCallOrder.at(-1)!);
  });
  it("rejects denied permission without journal or mutation", async () => {
    const f = fixture();

    vi.mocked(f.root.requestPermission).mockResolvedValue("denied");
    await expect(createFolder(f.root, [], "new", () => { }, f.journal)).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(f.root.getDirectoryHandle).not.toHaveBeenCalled();
    expect(f.journal.put).not.toHaveBeenCalled();
  });
  it.each(["file", "directory"])("blocks existing normalized %s names", async kind => {
    const f = fixture();

    f.entries.push({ name: "NEW", kind });
    await expect(createFolder(f.root, [], "new", () => { }, f.journal)).rejects.toThrow("entry-name-conflict");
    expect(f.root.getDirectoryHandle).not.toHaveBeenCalled();
  });
  it("does not write when durable intent fails", async () => {
    const f = fixture();

    f.journal.put.mockRejectedValue(Error("storage"));
    await expect(createFolder(f.root, [], "new", () => { }, f.journal)).rejects.toThrow("storage");
    expect(f.root.getDirectoryHandle).not.toHaveBeenCalled();
  });
  it("keeps uncertain outcome after creation call fails", async () => {
    const f = fixture();

    vi.mocked(f.root.getDirectoryHandle).mockRejectedValue(new DOMException("lost", "NotAllowedError"));
    await expect(createFolder(f.root, [], "new", () => { }, f.journal)).rejects.toThrow("entry-result-uncertain");
    expect(f.records.at(-1)?.status).toBe("uncertain");
  });
  it("does not mutate a stale connection", async () => {
    const f = fixture();

    await expect(createFolder(f.root, [], "new", () => {
      throw Error("stale");
    }, f.journal)).rejects.toThrow("stale");
    expect(f.root.getDirectoryHandle).not.toHaveBeenCalled();
  });
  it("does not claim success when completion cannot be recorded", async () => {
    const f = fixture();

    f.journal.put.mockImplementation(async r => {
      if (r.status !== "pending") throw Error("disk full");

      f.records.push(r);
    });
    await expect(createFolder(f.root, [], "new", () => { }, f.journal)).rejects.toThrow("entry-result-uncertain");
    expect(f.records[0].status).toBe("pending");
  });
  it("marks replacement entry uncertain", async () => {
    const f = fixture();

    f.created.isSameEntry.mockResolvedValue(false);
    await expect(createFolder(f.root, [], "new", () => { }, f.journal)).rejects.toThrow("entry-result-uncertain");
    expect(f.records.map(r => r.status)).toEqual(["pending", "uncertain"]);
  });
  it("does not add contradictory terminal records after durable ready", async () => {
    const f = fixture();
    let stale = false;

    f.journal.put.mockImplementation(async r => {
      f.records.push(r);

      if (r.status === "ready") stale = true;
    });
    await expect(createFolder(f.root, [], "new", () => {
      if (stale) throw Error("stale");
    }, f.journal)).rejects.toThrow("stale");
    expect(f.records.map(r => r.status)).toEqual(["pending", "ready"]);
  });
  it("checks journal permission again before mutation", async () => {
    const f = fixture();

    f.journal.assertWritable.mockRejectedValue(Error("journal-permission"));
    await expect(createFolder(f.root, [], "new", () => { }, f.journal)).rejects.toThrow("journal-permission");
    expect(f.root.getDirectoryHandle).not.toHaveBeenCalled();
    expect(f.records.map(r => r.status)).toEqual(["pending", "failed"]);
  });
});
