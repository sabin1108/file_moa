import { describe, expect, it, vi } from "vitest";
import { backupFilesystem, backupOwner } from "../../fixtures/backup-filesystem";
import { readRecoveryArchive } from "../../../../src/features/local-folders/recovery/archive/recovery-archive";
import { prepareRecoveryRestore, executeRecoveryRestore } from "../../../../src/features/local-folders/recovery/restore/recovery-restore";

async function fixture(fileName = "a.txt") {
  const fs = backupFilesystem();

  await fs.execute(await fs.inspect());

  const snapshot = await readRecoveryArchive(fs.root, fs.vault, backupOwner, () => { }, fs.abort.signal);
  const id = snapshot.view.items.find(item => item.fileName === fileName)!.id;

  fs.writes.length = 0;
  fs.creates.length = 0;

  let current = true;
  const check = () => {
    if (!current) throw Error("stale-connection-operation");
  };
  const prepare = (path: readonly string[] = ["to"]) => prepareRecoveryRestore(snapshot, id, path, check, fs.abort.signal, fs.hash);
  const run = (approved: Awaited<ReturnType<typeof prepare>>) => executeRecoveryRestore(approved, backupOwner, check,
    fs.abort.signal, () => { }, fs.hash, async work => work());
  const targets = () => fs.writes.filter(key => /^source\/to\/[^/]+$/u.test(key));

  return {
    ...fs,
    snapshot,
    id,
    prepare,
    run,
    targets,
    invalidate: () => {
      current = false;
    }
  };
}

describe("RESTORE new-file execution", () => {
  it("proposes a new name for a conflict, restores the old bytes and preserves existing files and backup", async () => {
    const f = await fixture();
    const before = new Map(f.bytes);
    const approved = await f.prepare();

    expect(approved.view.name).toBe("a (복원 1).txt");
    expect(approved.view.renamed).toBe(true);
    expect(f.writes).toEqual([]);
    expect(f.creates).toEqual([]);

    const result = await f.run(approved);

    expect(result).toMatchObject({ phase: "completed", status: "verified", journalComplete: true });
    expect(await f.bytes.get("source/to/a (복원 1).txt")!.text()).toBe("OLD_a.txt");

    for (const [key, value] of before) expect(f.bytes.get(key)).toBe(value);

    expect(f.removes).not.toHaveBeenCalled();
  });

  it("restores an empty payload as a verified empty file", async () => {
    const f = await fixture("empty.txt");
    const result = await f.run(await f.prepare());

    expect(result.phase).toBe("completed");
    expect(f.bytes.get("source/to/empty (복원 1).txt")!.size).toBe(0);
  });

  it("can restore elsewhere after the original folder and old destination journals are gone", async () => {
    const f = await fixture();

    for (const key of [...f.bytes.keys()]) if (key.startsWith("source/to/")) f.bytes.delete(key);

    f.directories.delete("source/to");

    const approved = await f.prepare([]);

    expect(approved.view.name).toBe("a.txt");
    expect((await f.run(approved)).phase).toBe("completed");
    expect(await f.bytes.get("source/a.txt")!.text()).toBe("OLD_a.txt");
  });

  it.each(["candidate-file", "candidate-folder", "denied", "record", "payload", "parent", "identity"])("blocks %s before creating a restored file", async fault => {
    const f = await fixture();
    const approved = await f.prepare();
    const target = `source/to/${approved.view.name}`;

    if (fault === "candidate-file") f.bytes.set(target, new File([], approved.view.name));
    else if (fault === "candidate-folder") await f.root.getDirectoryHandle("to").then(dir => dir.getDirectoryHandle(approved.view.name, { create: true }));
    else if (fault === "denied") f.deny();
    else if (fault === "record") f.fail((key, step) => key.includes("moa-restore-") && key.endsWith("prepared.json") && step === "write");
    else if (fault === "parent") f.replaceDirectory("source/to");
    else {
      const key = [...f.bytes.keys()].find(key => key.endsWith(`${f.snapshot.proofs.get(f.id)!.item!.recoveryId}.bin`))!;

      if (fault === "identity") f.replaceFile(key);
      else f.bytes.set(key, new File(["bad"], "bad.bin"));
    }

    f.creates.length = 0;

    const result = await f.run(approved);

    expect(result.phase).toBe("error");
    expect(f.targets()).toEqual([]);
    expect(f.creates).not.toContain(target);
  });

  it.each(["write", "close", "read"] as const)("marks a target %s failure uncertain without deleting or retrying", async step => {
    const f = await fixture();
    const approved = await f.prepare();
    const target = `source/to/${approved.view.name}`;
    let closed = false;

    f.onClose(key => {
      if (key === target) closed = true;
    });
    f.fail((key, at) => key === target && at === step && (step !== "read" || closed));

    const result = await f.run(approved);

    expect(result).toMatchObject({ phase: "error", status: "uncertain" });
    expect(f.targets()).toHaveLength(1);
    expect(f.removes).not.toHaveBeenCalled();
  });

  it("cancels a stream but retains the partial target and backup", async () => {
    const f = await fixture();
    const approved = await f.prepare();

    f.onWrite(key => {
      if (key === `source/to/${approved.view.name}`) f.abort.abort();
    });
    expect(await f.run(approved)).toMatchObject({ phase: "cancelled", status: "uncertain" });
    expect(f.removes).not.toHaveBeenCalled();
  });

  it("does not write stopped records after ownership changes", async () => {
    const f = await fixture();
    const approved = await f.prepare();

    f.onWrite(key => {
      if (key === `source/to/${approved.view.name}`) f.invalidate();
    });
    expect((await f.run(approved)).phase).toBe("error");
    expect(f.writes.some(key => key.includes("moa-restore-") && key.endsWith("stopped.json"))).toBe(false);
  });

  it("rejects unsafe/metadata paths and corrupted source without requesting write permission", async () => {
    const f = await fixture();

    vi.mocked(f.root.requestPermission).mockClear();
    await expect(f.prepare([".."])).rejects.toThrow();
    await expect(f.prepare([".moa-history"])).rejects.toThrow();
    expect(f.root.requestPermission).not.toHaveBeenCalled();
    expect(f.writes).toEqual([]);
  });
});
