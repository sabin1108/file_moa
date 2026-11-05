import { describe, expect, it } from "vitest";
import { backupFilesystem, backupOwner } from "../fixtures/backup-filesystem";
import { readRecoveryArchive } from "../../../src/features/local-folders/services/recovery-archive";
import { prepareRecoveryRestore, executeRecoveryRestore } from "../../../src/features/local-folders/services/recovery-restore";
import { readRestoreHistory } from "../../../src/features/local-folders/services/recovery-restore-history";
import { inspectRestoredFile } from "../../../src/features/local-folders/services/restore-history-inspection";

async function fixture() {
  const f = backupFilesystem();
  await f.execute(await f.inspect());
  const archive = await readRecoveryArchive(f.root, f.vault, backupOwner, () => {}, f.abort.signal);
  const id = archive.view.items.find(item => item.fileName === "a.txt")!.id;
  const approved = await prepareRecoveryRestore(archive, id, ["to"], () => {}, f.abort.signal, f.hash);
  await executeRecoveryRestore(approved, backupOwner, () => {}, f.abort.signal, () => {}, f.hash, async work => work());
  const read = () => readRestoreHistory(f.root, ["to"], backupOwner, () => { if (f.abort.signal.aborted) throw new DOMException("cancelled", "AbortError"); });
  const first = await read();
  const group = first.groups[0];
  const inspect = () => inspectRestoredFile(f.root, ["to"], group, backupOwner, () => {}, f.abort.signal, f.hash);
  f.writes.length = 0;
  f.creates.length = 0;
  return { ...f, read, group, inspect, target: `source/${group.to!.join("/")}` };
}

describe("restore history and explicit current observation", () => {
  it("reads completed history and compares bytes without writes or permission requests", async () => {
    const f = await fixture();
    expect((await f.read()).groups[0]).toMatchObject({ status: "completed", fileStatus: "verified", from: ["to", "a.txt"] });
    expect(await f.inspect()).toMatchObject({ status: "matches" });
    expect(f.writes).toEqual([]);
    expect(f.creates).toEqual([]);
    expect(f.removes).not.toHaveBeenCalled();
  });
  it.each(["different", "missing", "directory"] as const)("observes %s without altering past completion", async observation => {
    const f = await fixture();
    if (observation === "different") f.bytes.set(f.target, new File(["changed"], "changed"));
    else {
      f.bytes.delete(f.target);
      if (observation === "directory") await (await f.root.getDirectoryHandle("to")).getDirectoryHandle(f.group.to!.at(-1)!, { create: true });
    }
    expect(await f.inspect()).toMatchObject({ status: observation });
    expect((await f.read()).groups[0].status).toBe("completed");
  });
  it("marks a missing final journal uncertain and refuses to compare it as a completed restore", async () => {
    const f = await fixture();
    f.bytes.delete(`source/to/.moa-history/moa-restore-${f.group.id}/stopped.json`);
    expect((await f.read()).groups[0].status).toBe("uncertain");
    await expect(f.inspect()).rejects.toThrow("history-record-changed");
  });
  it("excludes foreign owners and conceals invalid target paths", async () => {
    const f = await fixture();
    const key = `source/to/.moa-history/moa-restore-${f.group.id}/prepared.json`;
    const value = JSON.parse(await f.bytes.get(key)!.text());
    f.bytes.set(key, new File([JSON.stringify({ ...value, to: ["outside", "a.txt"] })], "prepared.json"));
    expect((await f.read()).groups[0]).toMatchObject({ status: "uncertain", to: null, from: null });
    f.bytes.set(key, new File([JSON.stringify({ ...value, owner: { ...backupOwner, userId: "foreign" } })], "prepared.json"));
    expect(await f.read()).toMatchObject({ groups: [], excluded: 1 });
  });
  it("discards changed records, permission loss and cancelled reads", async () => {
    const f = await fixture();
    f.deny();
    await expect(f.inspect()).rejects.toMatchObject({ name: "NotAllowedError" });
    f.abort.abort();
    await expect(f.read()).rejects.toMatchObject({ name: "AbortError" });
  });
});
