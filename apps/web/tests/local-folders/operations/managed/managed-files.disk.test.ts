import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { diskDirectory } from "../../fixtures/disk-filesystem";
import { createRecoveryVault } from "../../../../src/features/local-folders/recovery/create-recovery-vault";
import { prepareManagedOperation, readManagedEdit } from "../../../../src/features/local-folders/operations/managed/managed-inspection";
import { executeManagedOperation } from "../../../../src/features/local-folders/operations/managed/managed-execution";
import { readManagedArchiveList } from "../../../../src/features/local-folders/operations/managed/managed-archive";
import type { ManagedRequest } from "../../../../src/features/local-folders/operations/managed/managed-files";

const roots: string[] = [];
const hash = async (file: File) => createHash("sha256").update(new Uint8Array(await file.arrayBuffer())).digest("hex");
afterEach(async () => {
  for (const root of roots.splice(0)) {
    const path = relative(resolve(tmpdir()), resolve(root));
    if (!path || isAbsolute(path) || path === ".." || path.startsWith(`..${sep}`) || !basename(root).startsWith("moa-managed-qa-")) throw Error("unsafe fixture cleanup");
    await rm(root, { recursive: true });
  }
});

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "moa-managed-qa-"));
  roots.push(directory);
  const source = join(directory, "source");
  await mkdir(join(source, "from"), { recursive: true });
  await mkdir(join(source, "dest"));
  await mkdir(join(source, "restore"));
  await writeFile(join(source, "from/a.txt"), "initial document");
  await writeFile(join(source, "sentinel.txt"), "unrelated file stays intact");
  const root = await diskDirectory(source, directory);
  const parent = await diskDirectory(directory, directory);
  const owner = { userId: "disk-qa", workspaceId: "isolated" };
  const vault = await createRecoveryVault(parent, owner, [root], () => {});
  const context = { root, vault, owner, check: () => {} };
  const request = (kind: ManagedRequest["kind"], names = ["a.txt"]): ManagedRequest => ({ kind, source: ["from"], names, destination: ["dest"] });
  const prepare = (input: ManagedRequest) => prepareManagedOperation(context, input, hash);
  const run = (prepared: Awaited<ReturnType<typeof prepare>>, signal = new AbortController().signal) => executeManagedOperation(prepared, signal, hash, () => {}, async work => work());
  return { directory, source, context, request, prepare, run };
}

describe("managed services with isolated real disk I/O", () => {
  it("confines adapter paths and discards an aborted writable before touching source bytes", async () => {
    const f = await fixture();
    await expect(f.context.root.getDirectoryHandle("..")).rejects.toThrow("disk-fixture-name");
    await expect(diskDirectory(tmpdir(), f.directory)).rejects.toThrow("disk-fixture-boundary");
    await expect(f.context.root.removeEntry("dest", { recursive: true })).rejects.toThrow("disk-fixture-recursive-removal-denied");
    const handle = await (await f.context.root.getDirectoryHandle("from")).getFileHandle("a.txt");
    const stream = await handle.createWritable();
    await stream.write("uncommitted replacement");
    expect(await readFile(join(f.source, "from/a.txt"), "utf8")).toBe("initial document");
    await stream.abort();
    expect(await readFile(join(f.source, "from/a.txt"), "utf8")).toBe("initial document");
  });
  it("copies nested files and empty folders while keeping source bytes and unrelated files", async () => {
    const f = await fixture();
    await mkdir(join(f.source, "from/tree/nested/empty"), { recursive: true });
    await writeFile(join(f.source, "from/tree/nested/note.md"), "nested bytes");
    expect(await f.run(await f.prepare(f.request("copy", ["tree"])))).toMatchObject({ phase: "completed", status: "verified", removed: 0 });
    expect(await readFile(join(f.source, "dest/tree/nested/note.md"), "utf8")).toBe("nested bytes");
    expect((await stat(join(f.source, "dest/tree/nested/empty"))).isDirectory()).toBe(true);
    expect(await readFile(join(f.source, "from/tree/nested/note.md"), "utf8")).toBe("nested bytes");
    expect(await readFile(join(f.source, "sentinel.txt"), "utf8")).toBe("unrelated file stays intact");
  });

  it("moves only after preservation and keeps a readable recovery archive", async () => {
    const f = await fixture();
    const before = await readFile(join(f.source, "from/a.txt"));
    expect(await f.run(await f.prepare(f.request("move")))).toMatchObject({ phase: "completed", status: "verified", preserved: true, removed: 1 });
    await expect(stat(join(f.source, "from/a.txt"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(join(f.source, "dest/a.txt"))).toEqual(before);
    expect((await readManagedArchiveList(f.context, hash)).items[0]).toMatchObject({ kind: "move", completed: true, preserved: true });
  });

  it("trashes and recovers exact bytes to another directory without consuming the archive", async () => {
    const f = await fixture();
    const before = await readFile(join(f.source, "from/a.txt"));
    const prepared = await f.prepare(f.request("trash"));
    expect((await f.run(prepared)).phase).toBe("completed");
    const recover = await f.prepare({ kind: "recover", source: [], names: [], destination: ["restore"], archiveId: prepared.view.id });
    expect((await f.run(recover)).phase).toBe("completed");
    expect(await readFile(join(f.source, "restore/a.txt"))).toEqual(before);
    expect((await readManagedArchiveList(f.context, hash)).items.find(item => item.id === prepared.view.id)?.preserved).toBe(true);
  });

  it("preserves BOM and CRLF when editing a real text file", async () => {
    const f = await fixture();
    const original = Buffer.concat([Buffer.from([239, 187, 191]), Buffer.from("old\r\nline\r\n")]);
    await writeFile(join(f.source, "from/a.txt"), original);
    const baseline = await readManagedEdit(f.context, ["from", "a.txt"], hash);
    const prepared = await prepareManagedOperation(f.context, { ...f.request("edit"), text: "최신\n내용\n" }, hash, baseline);
    expect((await f.run(prepared)).phase).toBe("completed");
    expect(await readFile(join(f.source, "from/a.txt"))).toEqual(Buffer.concat([Buffer.from([239, 187, 191]), Buffer.from("최신\r\n내용\r\n")]));
    const payload = await f.context.vault.getDirectoryHandle(`moa-managed-${prepared.view.id}`);
    expect(Buffer.from(await (await (await payload.getFileHandle(`${prepared.nodes[0].view.payload}.bin`)).getFile()).arrayBuffer())).toEqual(original);
  });

  it("rejects an existing destination without overwriting either real file", async () => {
    const f = await fixture();
    await writeFile(join(f.source, "dest/a.txt"), "existing destination");
    await expect(f.prepare(f.request("move"))).rejects.toThrow(/conflict/);
    expect(await readFile(join(f.source, "dest/a.txt"), "utf8")).toBe("existing destination");
    expect(await readFile(join(f.source, "from/a.txt"), "utf8")).toBe("initial document");
  });

  it("detects changed source bytes even when size and modification time are restored", async () => {
    const f = await fixture();
    const prepared = await f.prepare(f.request("move"));
    const file = join(f.source, "from/a.txt");
    const previous = await stat(file);
    await writeFile(file, "changed document");
    await utimes(file, previous.atime, previous.mtime);
    expect(await f.run(prepared)).toMatchObject({ phase: "error", removed: 0 });
    expect(await readFile(file, "utf8")).toBe("changed document");
    await expect(stat(join(f.source, "dest/a.txt"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("leaves real source bytes untouched when cancelled before execution", async () => {
    const f = await fixture();
    const prepared = await f.prepare(f.request("move"));
    const abort = new AbortController();
    abort.abort();
    expect(await f.run(prepared, abort.signal)).toMatchObject({ phase: "cancelled", removed: 0 });
    expect(await readFile(join(f.source, "from/a.txt"), "utf8")).toBe("initial document");
  });
});
