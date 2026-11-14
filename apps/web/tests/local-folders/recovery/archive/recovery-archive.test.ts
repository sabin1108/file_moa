import { describe, expect, it, vi } from "vitest";
import { backupFilesystem, backupOwner } from "../../fixtures/backup-filesystem";
import { readRecoveryArchive, inspectRecoveryArchiveItem } from "../../../../src/features/local-folders/recovery/archive/recovery-archive";

async function fixture() {
  const fs = backupFilesystem();

  await fs.execute(await fs.inspect());
  fs.writes.length = 0;
  fs.creates.length = 0;
  vi.mocked(fs.root.requestPermission).mockClear();
  vi.mocked(fs.vault.requestPermission).mockClear();

  let current = true;
  const check = () => {
    if (!current) throw Error("stale-connection-operation");
  };
  const read = () => readRecoveryArchive(fs.root, fs.vault, backupOwner, check, fs.abort.signal);
  const inspect = (snapshot: Awaited<ReturnType<typeof read>>, id = snapshot.view.items[0].id) =>
    inspectRecoveryArchiveItem(snapshot, id, fs.hash, fs.abort.signal);

  return {
    ...fs,
    read,
    inspect,
    invalidate: () => {
      current = false;
    }
  };
}

describe("ARCHIVE read-only list and current payload inspection", () => {
  it("lists metadata without payload reads and verifies one current item without mutations or permission prompts", async () => {
    const f = await fixture();
    let payloadReads = 0;

    f.fail((key, step) => {
      if (key.endsWith(".bin") && step === "read") payloadReads++;

      return false;
    });

    const snapshot = await f.read();

    expect(snapshot.view.items).toHaveLength(3);
    expect(snapshot.view.items.every(item => item.recorded === "completed")).toBe(true);
    expect(snapshot.view.items.some(item => item.fileName === "한글 파일.txt")).toBe(true);
    expect(payloadReads).toBe(0);
    expect(await f.inspect(snapshot)).toMatchObject({ status: "verified", payload: "verified", journal: "verified" });
    expect(payloadReads).toBeGreaterThan(0);
    expect(f.writes).toEqual([]);
    expect(f.creates).toEqual([]);
    expect(f.removes).not.toHaveBeenCalled();
    expect(f.root.requestPermission).not.toHaveBeenCalled();
    expect(f.vault.requestPermission).not.toHaveBeenCalled();
  });

  it.each(["missing", "corrupt"])("marks %s payload as damaged", async fault => {
    const f = await fixture();
    const snapshot = await f.read();
    const proof = snapshot.proofs.get(snapshot.view.items[0].id)!;
    const key = [...f.bytes.keys()].find(key => key.endsWith(`${proof.item!.recoveryId}.bin`))!;

    if (fault === "missing") f.bytes.delete(key);
    else f.bytes.set(key, new File(["broken"], "bad.bin"));

    expect(await f.inspect(snapshot)).toMatchObject({ status: "damaged", payload: fault === "missing" ? "missing" : "damaged" });
  });

  it("does not call a valid payload normal when destination journals are unavailable", async () => {
    const f = await fixture();
    const snapshot = await f.read();

    for (const key of [...f.bytes.keys()]) if (key.startsWith("source/to/.moa-history/")) f.bytes.delete(key);

    expect(await f.inspect(snapshot)).toMatchObject({ status: "uncertain", payload: "verified", journal: "unavailable" });
  });

  it("shows incomplete operations without fabricating a successful backup", async () => {
    const f = await fixture();

    for (const key of [...f.bytes.keys()]) if (key.endsWith("stopped.json")) f.bytes.delete(key);

    const snapshot = await f.read();

    expect(snapshot.view.items.every(item => item.recorded === "incomplete")).toBe(true);
    expect(await f.inspect(snapshot)).toMatchObject({ status: "uncertain", payload: "verified", journal: "incomplete" });
  });

  it.each(["bad-json", "foreign-owner", "oversized"])("shows %s metadata as untrusted without reading any payload", async fault => {
    const f = await fixture();
    const key = [...f.bytes.keys()].find(key => key.startsWith("vault/") && key.endsWith("prepared.json"))!;
    const original = f.bytes.get(key)!;

    if (fault === "bad-json") f.bytes.set(key, new File(["{"], "prepared.json"));
    else if (fault === "foreign-owner") {
      const value = JSON.parse(await original.text());

      value.owner.userId = "other";
      f.bytes.set(key, new File([JSON.stringify(value)], "prepared.json"));
    } else {
      const file = new File(["{}"], "prepared.json");

      Object.defineProperty(file, "size", { value: 1024 * 1024 + 1 });
      f.bytes.set(key, file);
    }

    let payloadReads = 0;

    f.fail((key, step) => {
      if (key.endsWith(".bin") && step === "read") payloadReads++;

      return false;
    });

    const snapshot = await f.read();

    expect(snapshot.view.items).toHaveLength(1);
    expect(snapshot.view.items[0]).toMatchObject({ recorded: "invalid", canInspect: false, fileName: null, bytes: null });
    expect(JSON.stringify(snapshot.view)).not.toContain("other");
    expect(payloadReads).toBe(0);
  });

  it("rejects an unknown item ID without deriving a filesystem path", async () => {
    const f = await fixture();
    const snapshot = await f.read();

    await expect(f.inspect(snapshot, "../../private")).rejects.toThrow("archive-item-required");
    expect(f.writes).toEqual([]);
  });

  it("detects operation replacement and changed prepared records after listing", async () => {
    const f = await fixture();
    const snapshot = await f.read();
    const proof = snapshot.proofs.get(snapshot.view.items[0].id)!;

    f.replaceDirectory(`vault/${proof.operationName}`);
    expect(await f.inspect(snapshot)).toMatchObject({ status: "uncertain", payload: "not-checked" });
  });

  it("cancels reads and rejects owner changes during hashing", async () => {
    const f = await fixture();
    const snapshot = await f.read();

    f.onHash(() => f.invalidate());
    await expect(f.inspect(snapshot)).rejects.toThrow("stale-connection-operation");
    f.abort.abort();
    await expect(f.read()).rejects.toThrow();
    expect(f.writes).toEqual([]);
  });

  it("keeps a scan limit visible instead of reporting a complete empty vault", async () => {
    const f = await fixture();

    for (let i = 0; i < 101; i++) await f.vault.getDirectoryHandle(`moa-backup-${crypto.randomUUID()}`, { create: true });

    f.creates.length = 0;

    const snapshot = await f.read();

    expect(snapshot.view.truncated).toBe(true);
    expect(snapshot.view.items.length).toBeGreaterThan(0);
    expect(f.creates).toEqual([]);
  });

  it("verifies an existing empty payload without inventing a missing file", async () => {
    const f = await fixture();
    const snapshot = await f.read();
    const row = snapshot.view.items.find(item => item.fileName === "empty.txt")!;

    expect(row.bytes).toBe(0);
    expect(await f.inspect(snapshot, row.id)).toMatchObject({ status: "verified" });
  });

  it("detects same-size corruption with unchanged metadata by hashing", async () => {
    const f = await fixture();
    const snapshot = await f.read();
    const item = snapshot.proofs.get(snapshot.view.items[0].id)!.item!;
    const key = [...f.bytes.keys()].find(key => key.endsWith(`${item.recoveryId}.bin`))!;
    const file = f.bytes.get(key)!;

    f.bytes.set(key, new File(["X".repeat(file.size)], file.name, { lastModified: file.lastModified }));
    expect(await f.inspect(snapshot)).toMatchObject({ status: "damaged", payload: "damaged" });
  });

  it("does not retain normal status when records change during the final payload hash", async () => {
    const f = await fixture();
    const snapshot = await f.read();
    let count = 0;

    f.onHash(() => {
      if (++count === 2) {
        const key = [...f.bytes.keys()].find(key => key.startsWith("vault/") && key.endsWith("stopped.json"))!;

        f.bytes.set(key, new File(["{}"], "stopped.json"));
      }
    });
    expect(await f.inspect(snapshot)).toMatchObject({ status: "uncertain", journal: "changed" });
  });

  it("rejects changed prepared metadata without hashing an untrusted item", async () => {
    const f = await fixture();
    const snapshot = await f.read();
    const key = [...f.bytes.keys()].find(key => key.startsWith("vault/") && key.endsWith("prepared.json"))!;
    const value = JSON.parse(await f.bytes.get(key)!.text());

    value.items[0].target.sha256 = "0".repeat(64);
    f.bytes.set(key, new File([JSON.stringify(value)], "prepared.json"));

    const hash = vi.fn();

    f.onHash(hash);
    expect(await f.inspect(snapshot)).toMatchObject({ status: "uncertain", payload: "not-checked" });
    expect(hash).not.toHaveBeenCalled();
  });

  it("reports a JSON byte budget stop as a partial list", async () => {
    const f = await fixture();

    for (let i = 0; i < 5; i++) {
      const name = `moa-backup-${crypto.randomUUID()}`;

      await f.vault.getDirectoryHandle(name, { create: true });
      f.bytes.set(
        `vault/${name}/prepared.json`,
        new File(["{}", " ".repeat(1024 * 1024 - 2)], "prepared.json")
      );
    }

    f.creates.length = 0;

    const snapshot = await f.read();

    expect(snapshot.view.truncated).toBe(true);
    expect(snapshot.view.items.length).toBeGreaterThan(0);
    expect(f.creates).toEqual([]);
  });

  it("does not expose write journals or unrelated files as recovery payloads", async () => {
    const f = await fixture();

    await f.vault.getDirectoryHandle(`moa-overwrite-${crypto.randomUUID()}`, { create: true });
    f.bytes.set("vault/private.txt", new File(["unrelated text"], "private.txt"));
    f.creates.length = 0;

    const snapshot = await f.read();

    expect(snapshot.view.items).toHaveLength(3);
    expect(JSON.stringify(snapshot.view)).not.toContain("unrelated");
    expect(f.creates).toEqual([]);
  });
});
