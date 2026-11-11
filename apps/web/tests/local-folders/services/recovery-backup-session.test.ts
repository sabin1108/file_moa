import { afterEach, describe, expect, it, vi } from "vitest";
import { FolderConnectionSession } from "../../../src/features/local-folders/services/connection-session";
import { backupFilesystem, backupOwner } from "../fixtures/backup-filesystem";

// Browser Worker boundary only. Real SHA-256, session, FS services and records run unchanged.

vi.mock("../../../src/features/local-folders/services/copy-hash", () => ({
  createCopyHasher: () => ({
    dispose: () => { },
    hash: async (file: File) =>
      [...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))].map(byte => byte.toString(16).padStart(2, "0")).join("")
  }),
}));
afterEach(() => vi.unstubAllGlobals());

async function fixture() {
  const fs = backupFilesystem();
  const session = new FolderConnectionSession({ read: async () => undefined, write: async () => { }, remove: async () => { } });

  await session.switchOwner(backupOwner);
  await session.select("source", async () => fs.root);
  await session.selectRecovery(async () => fs.vault, false);

  return { ...fs, session };
}

describe("BACKUP-002 session approval and lifetime", () => {
  it("MANAGED refuses a forged preview and consumes a current move approval once", async () => {
    const f = await fixture();
    const signal = new AbortController().signal;
    const view = await f.session.prepareManaged(
      { kind: "move", source: ["from"], names: ["a.txt"], destination: [] },
      signal
    );

    await expect(f.session.executeManaged({ ...view, destination: ["to"] }, signal, () => { })).rejects.toThrow("managed-inspection-required");
    expect(f.writes).toEqual([]);
    expect(await f.session.executeManaged(view, signal, () => { })).toMatchObject({ phase: "completed", removed: 1 });
    await expect(f.session.executeManaged(view, signal, () => { })).rejects.toThrow("managed-inspection-required");
  });

  it("MANAGED requires a new user gesture and invalidates approvals when recovery reconnects", async () => {
    const f = await fixture();
    const signal = new AbortController().signal;
    const view = await f.session.prepareManaged(
      { kind: "trash", source: ["from"], names: ["a.txt"], destination: [] },
      signal
    );

    vi.stubGlobal("navigator", { userActivation: { isActive: false } });
    await expect(f.session.executeManaged(view, signal, () => { })).rejects.toThrow("managed-user-action-required");
    vi.unstubAllGlobals();
    await f.session.reconnectRecovery();
    await expect(f.session.executeManaged(view, signal, () => { })).rejects.toThrow();
    expect(f.writes).toEqual([]);
    expect(f.removes).not.toHaveBeenCalled();
  });

  it("MANAGED editor requires its private loading receipt and blocks later external changes", async () => {
    const f = await fixture();
    const signal = new AbortController().signal;
    const request = { kind: "edit" as const, source: ["from"], names: ["a.txt"], destination: [], text: "new" };

    await expect(f.session.prepareManaged(request, signal)).rejects.toThrow("managed-edit-required");

    const editor = await f.session.openManagedEditor(["from", "a.txt"], signal);

    f.bytes.set("source/from/a.txt", new File(["external"], "a.txt"));
    await expect(f.session.prepareManaged({ ...request, editId: editor.id }, signal)).rejects.toThrow("managed-changed");
    expect(f.writes).toEqual([]);
  });

  it("MANAGED blocks a simultaneous legacy write and ignores owner-switched completion", async () => {
    const f = await fixture();
    const signal = new AbortController().signal;
    const view = await f.session.prepareManaged(
      { kind: "trash", source: ["from"], names: ["a.txt"], destination: [] },
      signal
    );
    const pending = f.session.executeManaged(view, signal, () => { });

    await expect(f.session.createSourceEntry([], "other")).rejects.toThrow("managed-operation-running");
    f.onWrite(path => {
      if (path.endsWith(".bin")) void f.session.switchOwner(null);
    });
    await expect(pending).rejects.toThrow("stale-connection-operation");
    expect(f.removes).not.toHaveBeenCalled();
  });
  it("invalidates a deleted vault on a read-only presence check without recreating it", async () => {
    const f = await fixture();

    expect(f.session.view("recovery").status).toBe("connected");
    f.bytes.delete("vault/.moa-vault.json");
    f.writes.length = 0;
    f.creates.length = 0;

    const result = await f.session.checkRecoveryPresence();

    expect(result).toBe("missing");
    expect(f.session.view("recovery").status).not.toBe("connected");
    expect(f.writes).toEqual([]);
    expect(f.creates).toEqual([]);
    expect(f.vault.requestPermission).not.toHaveBeenCalled();
  });

  it("does not trust a detached deleted vault directory even if its handle remains saved", async () => {
    const f = await fixture();

    f.directories.delete("vault");
    expect(await f.session.checkRecoveryPresence()).toBe("missing");
    expect(f.session.view("recovery").status).toBe("needs-permission");
    expect(f.writes).toEqual([]);
  });
  it("RESTORE requires a private current preview, rejects mutation and consumes it once", async () => {
    const f = await fixture();

    await f.execute(await f.inspect());

    const signal = new AbortController().signal;
    const list = await f.session.readRecoveryArchiveList(signal);
    const item = list.items[0];
    const view = await f.session.prepareRecoveryRestore(item.id, ["to"], signal);

    await expect(f.session.executeRecoveryRestore({ ...view, name: "existing.txt" }, signal, () => { })).rejects.toThrow("restore-inspection-required");

    const result = await f.session.executeRecoveryRestore(view, signal, () => { });

    expect(result.phase).toBe("completed");
    await expect(f.session.executeRecoveryRestore(view, signal, () => { })).rejects.toThrow("restore-inspection-required");
  });

  it("RESTORE requires a final gesture and expires on reconnect", async () => {
    const f = await fixture();

    await f.execute(await f.inspect());

    const signal = new AbortController().signal;
    const list = await f.session.readRecoveryArchiveList(signal);
    const view = await f.session.prepareRecoveryRestore(list.items[0].id, ["to"], signal);

    f.writes.length = 0;
    vi.stubGlobal("navigator", { userActivation: { isActive: false } });
    await expect(f.session.executeRecoveryRestore(view, signal, () => { })).rejects.toThrow("restore-user-action-required");
    vi.unstubAllGlobals();
    await f.session.reconnectRecovery();
    await expect(f.session.executeRecoveryRestore(view, signal, () => { })).rejects.toThrow();
    expect(f.writes).toEqual([]);
  });
  it("ARCHIVE reads connected records but requires a current private list before payload inspection", async () => {
    const f = await fixture();

    await f.execute(await f.inspect());
    f.writes.length = 0;

    const signal = new AbortController().signal;

    await expect(f.session.inspectRecoveryArchiveDetail("../file", signal)).rejects.toThrow("archive-list-required");

    const list = await f.session.readRecoveryArchiveList(signal);

    expect(list.items).toHaveLength(3);
    expect(await f.session.inspectRecoveryArchiveDetail(list.items[0].id, signal)).toMatchObject({ status: "verified" });
    await f.session.reconnectRecovery();
    await expect(f.session.inspectRecoveryArchiveDetail(list.items[0].id, signal)).rejects.toThrow();
    expect(f.writes).toEqual([]);
  });
  it("REPLACE requires a private completed backup and consumes overwrite approval once", async () => {
    const f = await fixture();
    const signal = new AbortController().signal;
    const report = await f.session.inspectSourceBackup(f.plan, signal);
    const forged = await f.execute(report);

    await expect(f.session.executeSourceOverwrite(f.plan, report, forged, signal, () => { })).rejects.toThrow("overwrite-backup-required");

    const report2 = await f.session.inspectSourceBackup(f.plan, signal);
    const backup = await f.session.executeSourceBackup(f.plan, report2, signal, () => { });
    const result = await f.session.executeSourceOverwrite(f.plan, report2, backup, signal, () => { });

    expect(result.phase).toBe("completed");
    await expect(f.session.executeSourceOverwrite(f.plan, report2, backup, signal, () => { })).rejects.toThrow("overwrite-backup-required");
  });

  it("REPLACE requires a new gesture and expires after vault reconnect", async () => {
    const f = await fixture();
    const signal = new AbortController().signal;
    const report = await f.session.inspectSourceBackup(f.plan, signal);
    const backup = await f.session.executeSourceBackup(f.plan, report, signal, () => { });

    vi.stubGlobal("navigator", { userActivation: { isActive: false } });
    await expect(f.session.executeSourceOverwrite(f.plan, report, backup, signal, () => { })).rejects.toThrow("overwrite-user-action-required");
    vi.unstubAllGlobals();
    await f.session.reconnectRecovery();
    await expect(f.session.executeSourceOverwrite(f.plan, report, backup, signal, () => { })).rejects.toThrow("overwrite-backup-required");
    expect(f.writes.some(key => /^source\/to\/[^/]+$/u.test(key))).toBe(false);
  });

  it.each(["source/to/a.txt", "source/from/a.txt"])("REPLACE rejects same-byte identity replacement at %s since backup approval", async path => {
    const f = await fixture();
    const signal = new AbortController().signal;
    const report = await f.session.inspectSourceBackup(f.plan, signal);
    const backup = await f.session.executeSourceBackup(f.plan, report, signal, () => { });

    f.writes.length = 0;
    f.replaceFile(path);

    const result = await f.session.executeSourceOverwrite(f.plan, report, backup, signal, () => { });

    expect(result.phase).toBe("error");
    expect(f.writes.some(key => /^source\/to\/[^/]+$/u.test(key))).toBe(false);
  });
  it("requires a private inspection, rejects mutated reports and consumes valid approval once", async () => {
    const f = await fixture();
    const signal = new AbortController().signal;

    await expect(f.session.executeSourceBackup(f.plan, await f.inspect(), signal, () => { })).rejects.toThrow("backup-inspection-required");

    const approved = await f.session.inspectSourceBackup(f.plan, signal);
    const changed = structuredClone(approved);

    changed.files[0].target.sha256 = "0".repeat(64);
    await expect(f.session.executeSourceBackup(f.plan, changed, signal, () => { })).rejects.toThrow("backup-inspection-required");

    const result = await f.session.executeSourceBackup(f.plan, approved, signal, () => { });

    expect(result.phase).toBe("completed");
    await expect(f.session.executeSourceBackup(f.plan, approved, signal, () => { })).rejects.toThrow("backup-inspection-required");
  });

  it("requires an active user gesture and invalidates after recovery reconnect", async () => {
    const f = await fixture();
    const signal = new AbortController().signal;
    const approved = await f.session.inspectSourceBackup(f.plan, signal);

    vi.stubGlobal("navigator", { userActivation: { isActive: false } });
    await expect(f.session.executeSourceBackup(f.plan, approved, signal, () => { })).rejects.toThrow("backup-user-action-required");
    vi.unstubAllGlobals();
    await f.session.reconnectRecovery();
    await expect(f.session.executeSourceBackup(f.plan, approved, signal, () => { })).rejects.toThrow("backup-inspection-required");
    expect(f.writes).toEqual([]);
  });

  it("discards late completion after owner switch and publishes no further progress", async () => {
    const f = await fixture();
    const signal = new AbortController().signal;
    const approved = await f.session.inspectSourceBackup(f.plan, signal);

    f.onWrite(key => {
      if (key.endsWith(".bin")) void f.session.switchOwner(null);
    });

    const progress = vi.fn();

    await expect(f.session.executeSourceBackup(f.plan, approved, signal, progress)).rejects.toThrow("stale-connection-operation");
    expect(progress.mock.calls.at(-1)?.[0].items[0].status).toBe("uncertain");
    expect(f.writes.some(path => path.endsWith("stopped.json"))).toBe(false);
  });
});
