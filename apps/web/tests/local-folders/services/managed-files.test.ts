import { describe, it, expect } from "vitest";
import { backupFilesystem, backupOwner } from "../fixtures/backup-filesystem";
import { prepareManagedOperation, readManagedEdit } from "../../../src/features/local-folders/services/managed-inspection";
import { executeManagedOperation } from "../../../src/features/local-folders/services/managed-execution";
import { readManagedArchiveList } from "../../../src/features/local-folders/services/managed-archive";
import { parseManagedManifest, type ManagedRequest } from "../../../src/features/local-folders/lib/managed-files";

async function fixture() {
  const f = backupFilesystem();

  await f.root.getDirectoryHandle("dest", { create: true });

  let current = true;
  const context = {
    root: f.root,
    vault: f.vault,
    owner: backupOwner,
    check: () => {
      if (!current) throw Error("stale-connection-operation");
    }
  };
  const request = (kind: ManagedRequest["kind"], names = ["a.txt"]): ManagedRequest => ({ kind, source: ["from"], names, destination: ["dest"] });
  const prepare = (value: ManagedRequest) => prepareManagedOperation(context, value, f.hash);
  const run = (value: Awaited<ReturnType<typeof prepare>>) => executeManagedOperation(value, f.abort.signal, f.hash, () => { }, async work => work());
  const tree = async () => {
    const from = await f.root.getDirectoryHandle("from");
    const root = await from.getDirectoryHandle("tree", { create: true });
    const nested = await root.getDirectoryHandle("nested", { create: true });

    await nested.getDirectoryHandle("empty", { create: true });
    f.bytes.set("source/from/tree/a.md", new File(["alpha"], "a.md", { lastModified: 10 }));
    f.bytes.set("source/from/tree/nested/b.txt", new File(["beta"], "b.txt", { lastModified: 10 }));
  };

  return {
    ...f,
    context,
    request,
    prepare,
    run,
    tree,
    invalidate: () => {
      current = false;
    }
  };
}

describe("managed file operations preserve before mutation", () => {
  it("copies a bounded tree including an empty directory and pairs immutable records", async () => {
    const f = await fixture();

    await f.tree();

    const before = new Map(f.bytes);
    const approved = await f.prepare(f.request("copy", ["tree"]));

    expect(f.writes).toEqual([]);
    expect(await f.run(approved)).toMatchObject({ phase: "completed", status: "verified", preserved: true, copied: 5, removed: 0 });
    expect(await f.bytes.get("source/dest/tree/nested/b.txt")!.text()).toBe("beta");
    expect(f.directories.has("source/dest/tree/nested/empty")).toBe(true);

    for (const [key, file] of before) expect(f.bytes.get(key)).toBe(file);

    const prefix = `moa-managed-${approved.view.id}`;
    const manifest = JSON.parse(await f.bytes.get(`vault/${prefix}/prepared.json`)!.text());

    expect(parseManagedManifest({ ...manifest, roots: [], nodes: [] })).toBeNull();
    expect(await f.bytes.get(`vault/${prefix}/stopped.json`)!.text()).toBe(await f.bytes.get(`source/dest/.moa-history/${prefix}/stopped.json`)!.text());
    expect(f.removes).not.toHaveBeenCalled();
  });

  it("moves one file only after its preserved bytes and destination are verified", async () => {
    const f = await fixture();

    f.removes.mockImplementation((path: string) => {
      expect(path).toBe("source/from/a.txt");
      expect(f.bytes.has("source/dest/a.txt")).toBe(true);
      expect([...f.bytes.keys()].some(key => key.startsWith("vault/moa-managed-") && key.endsWith("item-0000-verified.json"))).toBe(true);
    });
    expect(await f.run(await f.prepare(f.request("move")))).toMatchObject({ phase: "completed", removed: 1 });
    expect(f.bytes.has("source/from/a.txt")).toBe(false);
    expect(await f.bytes.get("source/dest/a.txt")!.text()).toBe("NEW_a.txt");
    expect(f.removes.mock.calls.every(call => !call[1]?.recursive)).toBe(true);
  });

  it("moves a whole tree leaf-first with no recursive source removal", async () => {
    const f = await fixture();

    await f.tree();
    expect(await f.run(await f.prepare(f.request("move", ["tree"])))).toMatchObject({ phase: "completed", removed: 5 });
    expect(f.directories.has("source/from/tree")).toBe(false);
    expect(f.removes.mock.calls.at(-1)?.[0]).toBe("source/from/tree");
    expect(f.removes.mock.calls.every(call => !call[1]?.recursive)).toBe(true);
  });

  it("trashes and recovers a tree to a new name without consuming or merging its archive", async () => {
    const f = await fixture();

    await f.tree();

    const approved = await f.prepare(f.request("trash", ["tree"]));

    expect((await f.run(approved)).phase).toBe("completed");
    expect(f.directories.has("source/from/tree")).toBe(false);

    const list = await readManagedArchiveList(f.context, f.hash);

    expect(list.items[0]).toMatchObject({ kind: "trash", completed: true, preserved: true });
    await (await f.root.getDirectoryHandle("from")).getDirectoryHandle("tree", { create: true });

    const oldArchive = new Map([...f.bytes].filter(([path]) => path.startsWith(`vault/moa-managed-${approved.view.id}/`)));
    const recover = await f.prepare({ kind: "recover", source: [], names: [], destination: ["from"], archiveId: approved.view.id });

    expect(recover.targets[0]).toEqual(["from", "tree (복원 1)"]);
    expect((await f.run(recover)).phase).toBe("completed");
    expect(await f.bytes.get("source/from/tree (복원 1)/nested/b.txt")!.text()).toBe("beta");
    expect(f.directories.has("source/from/tree")).toBe(true);

    for (const [path, file] of oldArchive) expect(f.bytes.get(path)).toBe(file);
  });

  it("edits UTF-8 text while preserving BOM, CRLF and the exact previous bytes", async () => {
    const f = await fixture();
    const old = new Uint8Array([239, 187, 191, ...new TextEncoder().encode("old\r\nline\r\n")]);

    f.bytes.set("source/from/a.txt", new File([old], "a.txt", { lastModified: 10 }));

    const baseline = await readManagedEdit(f.context, ["from", "a.txt"], f.hash);
    const approved = await prepareManagedOperation(f.context, { ...f.request("edit"), text: "new\nline\n" }, f.hash, baseline);

    expect((await f.run(approved)).phase).toBe("completed");
    expect(new Uint8Array(await f.bytes.get("source/from/a.txt")!.arrayBuffer())).toEqual(new Uint8Array([239, 187, 191, ...new TextEncoder().encode("new\r\nline\r\n")]));

    const payload = approved.nodes[0].view.payload;

    expect(new Uint8Array(await f.bytes.get(`vault/moa-managed-${approved.view.id}/${payload}.bin`)!.arrayBuffer())).toEqual(old);
  });

  it.each(["conflict", "source-change", "source-replaced", "parent-replaced", "permission", "vault-deleted", "backup-write", "paired-record"])("halts %s before source removal", async fault => {
    const f = await fixture();
    const approved = await f.prepare(f.request("move"));

    if (fault === "conflict") f.bytes.set("source/dest/A.TXT", new File([], "A.TXT"));

    if (fault === "source-change") f.bytes.set("source/from/a.txt", new File(["changed"], "a.txt"));

    if (fault === "source-replaced") f.replaceFile("source/from/a.txt");

    if (fault === "parent-replaced") f.replaceDirectory("source/dest");

    if (fault === "permission") f.deny();

    if (fault === "vault-deleted") f.bytes.delete("vault/.moa-vault.json");

    if (fault === "backup-write") f.fail((key, step) => key.startsWith("vault/moa-managed-") && key.endsWith(".bin") && step === "write");

    if (fault === "paired-record") f.fail((key, step) => key.startsWith("source/dest/.moa-history/") && step === "write");

    expect((await f.run(approved)).phase).toBe("error");
    expect(f.removes).not.toHaveBeenCalled();
    expect(f.bytes.has("source/from/a.txt")).toBe(true);
  });

  it("refuses an external edit since editor loading, with no writes", async () => {
    const f = await fixture();
    const baseline = await readManagedEdit(f.context, ["from", "a.txt"], f.hash);

    f.bytes.set("source/from/a.txt", new File(["external"], "a.txt"));
    await expect(prepareManagedOperation(f.context, { ...f.request("edit"), text: "draft" }, f.hash, baseline)).rejects.toThrow("managed-changed");
    expect(f.writes).toEqual([]);
  });

  it("stops after a target close failure and retains original plus preserved bytes", async () => {
    const f = await fixture();
    const approved = await f.prepare(f.request("move"));

    f.fail((key, step) => key === "source/dest/a.txt" && step === "close");
    expect(await f.run(approved)).toMatchObject({ phase: "error", status: "uncertain", preserved: true });
    expect(f.removes).not.toHaveBeenCalled();
    expect(f.bytes.has("source/from/a.txt")).toBe(true);
  });

  it("keeps a file created externally inside a source directory during removal", async () => {
    const f = await fixture();

    await f.tree();

    const approved = await f.prepare(f.request("move", ["tree"]));

    f.removes.mockImplementation((path: string) => {
      if (path.endsWith("/b.txt")) f.bytes.set("source/from/tree/nested/new.txt", new File(["external"], "new.txt"));
    });
    expect(await f.run(approved)).toMatchObject({ phase: "error", status: "uncertain" });
    expect(await f.bytes.get("source/from/tree/nested/new.txt")!.text()).toBe("external");
    expect(f.directories.has("source/from/tree")).toBe(true);
  });

  it("cancels destination writes without removing the source or retrying", async () => {
    const f = await fixture();
    const approved = await f.prepare(f.request("move"));

    f.onWrite(path => {
      if (path === "source/dest/a.txt") f.abort.abort();
    });
    expect(await f.run(approved)).toMatchObject({ phase: "cancelled", status: "uncertain" });
    expect(f.removes).not.toHaveBeenCalled();
    expect(f.writes.filter(path => path === "source/dest/a.txt")).toHaveLength(1);
  });

  it("does not claim move completion when a destination disappears after source removal", async () => {
    const f = await fixture();
    const approved = await f.prepare(f.request("move"));

    f.removes.mockImplementation(() => f.bytes.delete("source/dest/a.txt"));
    expect(await f.run(approved)).toMatchObject({ phase: "error", status: "uncertain", removed: 1 });
    expect(f.bytes.has(`vault/moa-managed-${approved.view.id}/${approved.nodes[0].view.payload}.bin`)).toBe(true);
  });

  it("does not remove a node through a stale renamed/replaced parent handle", async () => {
    const f = await fixture();
    const approved = await f.prepare(f.request("trash"));

    f.onClose(path => {
      if (path.endsWith("source-removal-started.json")) f.replaceDirectory("source/from");
    });
    expect((await f.run(approved)).phase).toBe("error");
    expect(f.removes).not.toHaveBeenCalled();
    expect(f.bytes.has("source/from/a.txt")).toBe(true);
  });

  it("does not turn a one-sided final journal failure into completion after reconnect", async () => {
    const f = await fixture();
    const approved = await f.prepare(f.request("move"));

    f.fail((path, step) => path.startsWith("source/dest/.moa-history/") && path.endsWith("stopped.json") && step === "write");
    expect(await f.run(approved)).toMatchObject({ phase: "error", status: "uncertain" });
    f.fail(() => false);

    const list = await readManagedArchiveList(f.context, f.hash);

    expect(list.items.find(item => item.id === approved.view.id)?.completed).toBe(false);
  });

  it("detects an unexpected destination child before any source removal", async () => {
    const f = await fixture();

    await f.tree();

    const approved = await f.prepare(f.request("move", ["tree"]));

    f.onClose(path => {
      if (path === "source/dest/tree/nested/b.txt") f.bytes.set("source/dest/tree/extra.txt", new File(["external"], "extra.txt"));
    });
    expect((await f.run(approved)).phase).toBe("error");
    expect(f.removes).not.toHaveBeenCalled();
    expect(f.bytes.has("source/dest/tree/extra.txt")).toBe(true);
  });

  it("does not journal to a different owner after connection invalidation", async () => {
    const f = await fixture();
    const approved = await f.prepare(f.request("trash"));

    f.onWrite(path => {
      if (path.endsWith(".bin")) f.invalidate();
    });
    expect((await f.run(approved)).phase).toBe("error");
    expect(f.removes).not.toHaveBeenCalled();
    expect(f.writes.some(path => path.endsWith("stopped.json"))).toBe(false);
  });

  it("protects direct management selection and nested destinations while copy excludes history", async () => {
    const f = await fixture();

    await f.tree();
    await (await (await f.root.getDirectoryHandle("from")).getDirectoryHandle("tree")).getDirectoryHandle(
      ".moa-history",
      { create: true }
    );
    await expect(f.prepare(f.request("trash", [".moa-history"]))).rejects.toThrow();
    await expect(f.prepare({ ...f.request("copy", ["tree"]), destination: ["from", "tree", "nested"] })).rejects.toThrow("managed-nested");

    const copy = await f.prepare(f.request("copy", ["tree"]));

    expect(copy.view.skipped).toBe(true);
    expect(f.writes).toEqual([]);
  });

  it.each(["move", "trash"] as const)("preserves internal history before %s and restores its exact bytes", async kind => {
    const f = await fixture();

    await f.tree();

    const tree = await (await f.root.getDirectoryHandle("from")).getDirectoryHandle("tree");
    const history = await tree.getDirectoryHandle(".moa-history", { create: true });

    await history.getDirectoryHandle("moa-managed-previous", { create: true });

    const original = new File(["immutable previous journal"], "prepared.json", { lastModified: 22 });

    f.bytes.set("source/from/tree/.moa-history/moa-managed-previous/prepared.json", original);

    const prepared = await f.prepare(f.request(kind, ["tree"]));

    expect(f.writes).toEqual([]);

    const historyNode = prepared.nodes.find(node => node.view.path.at(-1) === "prepared.json")!;

    expect(historyNode).toBeDefined();
    expect((await f.run(prepared)).phase).toBe("completed");
    expect(f.directories.has("source/from/tree")).toBe(false);
    expect(await f.bytes.get(`vault/moa-managed-${prepared.view.id}/${historyNode.view.payload}.bin`)!.text()).toBe(await original.text());

    if (kind === "move") expect(await f.bytes.get("source/dest/tree/.moa-history/moa-managed-previous/prepared.json")!.text()).toBe(await original.text());

    const recovery = await f.prepare({ kind: "recover", source: [], names: [], destination: ["from"], archiveId: prepared.view.id });

    expect((await f.run(recovery)).phase).toBe("completed");
    expect(await f.bytes.get("source/from/tree/.moa-history/moa-managed-previous/prepared.json")!.text()).toBe(await original.text());
    expect(f.removes.mock.calls.every(call => !call[1]?.recursive)).toBe(true);
  });

  it.each(["changed", "backup-failed", "vault-inside", "other-reserved"])("keeps original internal history on %s", async fault => {
    const f = await fixture();

    await f.tree();

    const tree = await (await f.root.getDirectoryHandle("from")).getDirectoryHandle("tree");

    await tree.getDirectoryHandle(".moa-history", { create: true });

    const historyPath = "source/from/tree/.moa-history/record.json";

    f.bytes.set(historyPath, new File(["old journal"], "record.json", { lastModified: 22 }));

    if (fault === "vault-inside") {
      f.bytes.set("source/from/tree/.moa-vault.json", new File(["marker"], ".moa-vault.json"));
      await expect(f.prepare(f.request("trash", ["tree"]))).rejects.toThrow("managed-protected");

      return;
    }

    if (fault === "other-reserved") {
      await tree.getDirectoryHandle(".moa-private", { create: true });
      await expect(f.prepare(f.request("trash", ["tree"]))).rejects.toThrow("managed-protected");

      return;
    }

    const prepared = await f.prepare(f.request("trash", ["tree"]));

    if (fault === "changed") f.bytes.set(historyPath, new File(["new journal"], "record.json"));
    else f.fail((key, step) => key.startsWith("vault/") && key.endsWith(".bin") && step === "write");

    expect((await f.run(prepared)).phase).toBe("error");
    expect(f.bytes.has(historyPath)).toBe(true);
    expect(f.removes).not.toHaveBeenCalled();
  });

  it("rejects oversized files, edit output and malformed recovery manifests", async () => {
    const f = await fixture();

    f.bytes.set("source/from/large.bin", new File([new Uint8Array(16 * 1024 * 1024 + 1)], "large.bin"));
    await expect(f.prepare(f.request("copy", ["large.bin"]))).rejects.toThrow("managed-limit");

    const baseline = await readManagedEdit(f.context, ["from", "a.txt"], f.hash);

    await expect(prepareManagedOperation(
      f.context,
      { ...f.request("edit"), text: "가".repeat(1024 * 1024) },
      f.hash,
      baseline
    )).rejects.toThrow("managed-edit-limit");
    expect(parseManagedManifest({ schemaVersion: 1, nodes: [{ path: [".."] }] })).toBeNull();
    expect(f.writes).toEqual([]);
  });

  it("rejects too-deep and oversized entry sets before mutation", async () => {
    const f = await fixture();
    const from = await f.root.getDirectoryHandle("from");
    let parent = await from.getDirectoryHandle("deep", { create: true });

    for (let depth = 0; depth < 17; depth++) parent = await parent.getDirectoryHandle(`d${depth}`, { create: true });

    await expect(f.prepare(f.request("trash", ["deep"]))).rejects.toThrow("managed-limit");
    await from.getDirectoryHandle("many", { create: true });

    for (let index = 0; index < 501; index++) f.bytes.set(`source/from/many/${index}.txt`, new File([], `${index}.txt`));

    await expect(f.prepare(f.request("copy", ["many"]))).rejects.toThrow("managed-limit");
    expect(f.writes).toEqual([]);
    expect(f.removes).not.toHaveBeenCalled();
  });

  it("caps a complete source set at64MiB before creating archives", async () => {
    const f = await fixture();
    const names = Array.from({ length: 5 }, (_, index) => `large-${index}.bin`);

    for (const name of names) f.bytes.set(`source/from/${name}`, new File([new Uint8Array(16 * 1024 * 1024)], name));

    await expect(f.prepare(f.request("move", names))).rejects.toThrow("managed-limit");
    expect(f.writes).toEqual([]);
    expect(f.removes).not.toHaveBeenCalled();
  });

  it("blocks a corrupted preservation payload before destination writes or source removal", async () => {
    const f = await fixture();
    const approved = await f.prepare(f.request("move"));
    const payload = `vault/moa-managed-${approved.view.id}/${approved.nodes[0].view.payload}.bin`;

    f.onClose(path => {
      if (path.endsWith("item-0000-verified.json")) f.bytes.set(payload, new File(["bad"], "bad.bin"));
    });
    expect((await f.run(approved)).phase).toBe("error");
    expect(f.writes).not.toContain("source/dest/a.txt");
    expect(f.removes).not.toHaveBeenCalled();
  });

  it("retains recoverable bytes when source removal throws", async () => {
    const f = await fixture();
    const approved = await f.prepare(f.request("trash"));

    f.removes.mockImplementation(() => {
      throw new DOMException("blocked", "NoModificationAllowedError");
    });
    expect(await f.run(approved)).toMatchObject({ phase: "error", status: "uncertain", removed: 0 });
    expect(f.bytes.has("source/from/a.txt")).toBe(true);
    expect((await readManagedArchiveList(f.context, f.hash)).items[0]).toMatchObject({ preserved: true, completed: false });
  });

  it("does not read unbounded archive metadata or expose malformed records as recoverable", async () => {
    const f = await fixture();

    for (let index = 0; index < 10; index++) {
      const id = crypto.randomUUID();

      await f.vault.getDirectoryHandle(`moa-managed-${id}`, { create: true });
      f.bytes.set(
        `vault/moa-managed-${id}/prepared.json`,
        new File([JSON.stringify("x".repeat(1024 * 1024 - 2))], "prepared.json")
      );
    }

    const list = await readManagedArchiveList(f.context, f.hash);

    expect(list).toMatchObject({ items: [], truncated: true });
    expect(list.unreadable).toBeLessThan(10);
    expect(f.writes).toEqual([]);
  });
});
