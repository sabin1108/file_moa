import { describe, expect, it, vi } from "vitest";
import { withAbsentVaultMarker } from "../fixtures/absent-vault-marker";
import { createEntry } from "../../../src/features/local-folders/services/create-entry";
import { resolveEntryName } from "../../../src/features/local-folders/lib/new-entry";
import { EntryCreationController } from "../../../src/features/local-folders/store/entry-creation-controller";
import type { FolderHandle } from "../../../src/features/local-folders/types";
import type { FolderCreationRecord } from "../../../src/features/local-folders/services/folder-creation-journal";

function fixture() {
  const entries: {
    name: string;
    kind: string
  }[] = [];
  const file = {
    kind: "file",
    getFile: vi.fn(async () => ({ size: 0 })),
    isSameEntry: vi.fn(async () => true),
    createWritable: vi.fn()
  };
  const root = {
    name: "root",
    queryPermission: vi.fn(async () => "granted"),
    requestPermission: vi.fn(async () => "granted"),
    values: async function* () {
      yield* entries;
    },
    isSameEntry: async () => true,
    getFileHandle: vi.fn(async () => file)
  } as unknown as FolderHandle;
  const records: FolderCreationRecord[] = [];

  withAbsentVaultMarker(root);

  const journal = {
    put: vi.fn(async (record: FolderCreationRecord) => {
      records.push(record);
    }),
    assertWritable: vi.fn(async () => { })
  };

  return { entries, file, root, records, journal };
}

describe("new text and Markdown files", () => {
  it.each([
    ["aaa.txt", "folder", "txt"],
    ["기록.MD", "folder", "md"],
    ["노트.md", "txt", "md"],
    ["본문.TXT", "md", "txt"],
  ] as const)("honors explicit extension %s over selected %s through creation and journal", async (name, selectedKind, expectedKind) => {
    const f = fixture();
    const controller = new EntryCreationController((path, input, kind) =>
      createEntry(f.root, path, input, () => { }, f.journal, undefined, kind));

    expect(resolveEntryName(name, selectedKind)).toBe(name);
    expect(await controller.run([], name, selectedKind)).toBe(true);

    expect(f.root.getFileHandle).toHaveBeenCalledWith(name, { create: true });
    expect(f.records.map(record => [record.kind, record.status, record.path])).toEqual([
      [expectedKind, "pending", [name]], [expectedKind, "ready", [name]],
    ]);
    expect(controller.getSnapshot().message).toBe(`‘${name}’ 빈 파일을 준비했어요.`);
    expect(f.file.createWritable).not.toHaveBeenCalled();
  });

  it("rejects an inferred file collision before mutation", async () => {
    const f = fixture();

    f.entries.push({ name: "AAA.TXT", kind: "directory" });
    await expect(createEntry(f.root, [], "aaa.txt", () => { }, f.journal)).rejects.toThrow("entry-name-conflict");
    expect(f.root.getFileHandle).not.toHaveBeenCalled();
    expect(f.journal.put).not.toHaveBeenCalled();
  });

  it("resolves explicit extension at the file-access boundary without the UI controller", async () => {
    const f = fixture();

    await createEntry(f.root, [], "aaa.txt", () => { }, f.journal, undefined, "folder");
    expect(f.root.getFileHandle).toHaveBeenCalledWith("aaa.txt", { create: true });
    expect(f.records.every(record => record.kind === "txt")).toBe(true);
    expect(f.file.createWritable).not.toHaveBeenCalled();
  });

  it("retains unknown suffix handling and normalizes supported names", () => {
    expect(resolveEntryName("archive.zip", "folder")).toBe("archive.zip");
    expect(resolveEntryName("archive.zip", "txt")).toBe("archive.zip.txt");
    expect(resolveEntryName("가.MD", "txt")).toBe("가.MD");
  });
  it.each([["메모", "txt", "메모.txt"], ["일지.md", "md", "일지.md"], ["README.MD", "md", "README.MD"], ["a.txt", "folder", "a.txt"]] as const)("resolves %s (%s) to %s", (name, kind, expected) => {
    expect(resolveEntryName(name, kind)).toBe(expected);
  });
  it.each(["", "../a", "a/", "a.", "a ", "NUL", "a".repeat(252)])("rejects invalid raw or final file name %j", name => {
    expect(() => resolveEntryName(name, "txt")).toThrow();
  });
  it.each(["txt", "md"] as const)("creates an empty %s without a writable stream", async kind => {
    const f = fixture();

    expect(await createEntry(f.root, [], "메모", () => { }, f.journal, undefined, kind)).toEqual([`메모.${kind}`]);
    expect(f.root.getFileHandle).toHaveBeenCalledWith(`메모.${kind}`, { create: true });
    expect(f.file.createWritable).not.toHaveBeenCalled();
    expect(f.records.map(r => r.status)).toEqual(["pending", "ready"]);
  });
  it("rejects an existing filename before getFileHandle", async () => {
    const f = fixture();

    f.entries.push({ name: "MEMO.TXT", kind: "file" });
    await expect(createEntry(f.root, [], "memo", () => { }, f.journal, undefined, "txt")).rejects.toThrow("entry-name-conflict");
    expect(f.root.getFileHandle).not.toHaveBeenCalled();
    expect(f.file.createWritable).not.toHaveBeenCalled();
  });
  it("does not truncate a file created externally after conflict checking", async () => {
    const f = fixture();

    f.file.getFile.mockResolvedValue({ size: 42 });
    await expect(createEntry(f.root, [], "memo", () => { }, f.journal, undefined, "txt")).rejects.toThrow("entry-result-uncertain");
    expect(f.file.createWritable).not.toHaveBeenCalled();
    expect(f.records.at(-1)?.status).toBe("uncertain");
  });
});
