import { describe, expect, it } from "vitest";
import { backupFilesystem } from "../fixtures/backup-filesystem";
import { parseBackupManifest } from "../../../src/features/local-folders/lib/recovery-backup";

describe("BACKUP-001..007 verified recovery backup", () => {
  it("backs up old destination bytes including empty files and persists matching dual records without target/source writes", async () => {
    const f = backupFilesystem();
    const originals = [...f.bytes].filter(([path]) => path.startsWith("source/"));
    const approved = await f.inspect();

    expect(f.writes).toEqual([]);
    expect(f.root.requestPermission).not.toHaveBeenCalled();

    const result = await f.execute(approved);

    expect(result.phase).toBe("completed");
    expect(result.journalComplete).toBe(true);
    expect(result.items.map(item => item.status)).toEqual(["verified", "verified", "verified"]);

    for (const [path, file] of originals) expect(f.bytes.get(path)).toBe(file);

    for (const [index, item] of result.items.entries()) {
      const payload = f.bytes.get(`vault/moa-backup-${result.id}/${item.recoveryId}.bin`)!;

      expect(await payload.text()).toBe(await f.bytes.get(`source/to/${f.plan.rows[index].to.at(-1)}`)!.text());
    }

    const events = [...f.bytes].filter(([path]) => path.includes("moa-backup-") && path.endsWith(".json"));

    expect(events).toHaveLength(10);

    for (const [, file] of events) expect(parseBackupManifest(JSON.parse(await file.text()))).not.toBeNull();

    expect(f.writes.every(path => path.startsWith("vault/moa-backup-") || path.startsWith("source/to/.moa-history/moa-backup-"))).toBe(true);
    expect(f.removes).not.toHaveBeenCalled();
  });

  it("rejects stale approved contents with unchanged size/mtime before any write", async () => {
    const f = backupFilesystem();
    const approved = await f.inspect();
    const file = f.bytes.get("source/to/a.txt")!;

    f.bytes.set(
      "source/to/a.txt",
      new File(["x".repeat(file.size)], file.name, { lastModified: file.lastModified })
    );

    const result = await f.execute(approved);

    expect(result.phase).toBe("error");
    expect(f.writes).toEqual([]);
    expect(f.creates).toEqual([]);
  });

  it.each(["open", "write", "close", "read"] as const)("stops on backup %s failure and keeps target files intact", async step => {
    const f = backupFilesystem();
    const approved = await f.inspect();
    const target = f.bytes.get("source/to/a.txt");

    f.fail((key, phase) => key.endsWith(".bin") && phase === step);

    const result = await f.execute(approved);

    expect(result.phase).toBe("error");
    expect(result.items.map(item => item.status)).toEqual(["uncertain", "not-run", "not-run"]);
    expect(f.bytes.get("source/to/a.txt")).toBe(target);
    expect(f.removes).not.toHaveBeenCalled();
  });

  it("does not start the third file after the second payload fails", async () => {
    const f = backupFilesystem();
    const approved = await f.inspect();
    let count = 0;

    f.fail((key, phase) => key.endsWith(".bin") && phase === "open" && ++count === 2);

    const result = await f.execute(approved);

    expect(result.items.map(item => item.status)).toEqual(["verified", "uncertain", "not-run"]);
    expect(f.writes.filter(path => path.endsWith(".bin"))).toHaveLength(2);
  });

  it("catches corrupted readback and replacement handles without reporting verified", async () => {
    for (const replacement of [false, true]) {
      const f = backupFilesystem();
      const approved = await f.inspect();

      f.onClose(key => {
        if (!key.endsWith(".bin")) return;

        if (replacement) f.replaceFile(key);
        else f.bytes.set(key, new File(["bad"], "bad.bin"));
      });

      const result = await f.execute(approved);

      expect(result.phase).toBe("error");
      expect(result.items[0].status).toBe("uncertain");
    }
  });

  it("never marks success when one side's verified record fails", async () => {
    const f = backupFilesystem();
    const approved = await f.inspect();

    f.fail((key, phase) => key.startsWith("source/to/") && key.endsWith("-verified.json") && phase === "write");

    const result = await f.execute(approved);

    expect(result.phase).toBe("error");
    expect(result.items.map(item => item.status)).toEqual(["uncertain", "not-run", "not-run"]);
    expect(result.journalComplete).toBe(false);
  });

  it("cancels during payload write, records a stop and never deletes partial files", async () => {
    const f = backupFilesystem();
    const approved = await f.inspect();

    f.onWrite(key => {
      if (key.endsWith(".bin")) f.abort.abort();
    });

    const result = await f.execute(approved);

    expect(result.phase).toBe("cancelled");
    expect(result.items.map(item => item.status)).toEqual(["uncertain", "not-run", "not-run"]);
    expect(result.journalComplete).toBe(true);
    expect(f.removes).not.toHaveBeenCalled();
  });

  it("blocks denied permission or a pre-cancelled run without creating anything", async () => {
    for (const cancel of [false, true]) {
      const f = backupFilesystem();
      const approved = await f.inspect();

      if (cancel) f.abort.abort();
      else f.deny();

      const result = await f.execute(approved);

      expect(result.phase).toBe(cancel ? "cancelled" : "error");
      expect(f.creates).toEqual([]);
      expect(f.writes).toEqual([]);
    }
  });

  it("detects a changed input, parent or vault identity after payload close", async () => {
    for (const change of ["target", "source", "parent", "vault"] as const) {
      const f = backupFilesystem();
      const approved = await f.inspect();

      f.onClose(key => {
        if (!key.endsWith(".bin")) return;

        if (change === "parent") f.replaceDirectory("source/to");
        else if (change === "vault") f.bytes.set("vault/.moa-vault.json", new File(["broken"], ".moa-vault.json"));
        else {
          const path = change === "target" ? "source/to/a.txt" : "source/from/a.txt";
          const old = f.bytes.get(path)!;

          f.bytes.set(path, new File(["x".repeat(old.size)], old.name, { lastModified: old.lastModified }));
        }
      });

      const result = await f.execute(approved);

      expect(result.phase).toBe("error");
      expect(result.items.map(item => item.status)).toEqual(["uncertain", "not-run", "not-run"]);
      expect(f.writes.filter(path => path.endsWith(".bin"))).toHaveLength(1);
    }
  });

  it("detects changes to earlier prepared records at final audit", async () => {
    const f = backupFilesystem();
    const approved = await f.inspect();

    f.onClose(key => {
      if (key.endsWith("item-0003-verified.json")) {
        const first = [...f.bytes.keys()].find(path => path.startsWith("vault/") && path.endsWith("prepared.json"))!;

        f.bytes.set(first, new File(["{}"], "prepared.json"));
      }
    });

    const result = await f.execute(approved);

    expect(result.phase).toBe("error");
    expect(result.items.every(item => item.status === "uncertain")).toBe(true);
    expect(result.journalComplete).toBe(false);
  });

  it("rejects a payload changed during its hash readback with unchanged metadata", async () => {
    const f = backupFilesystem();
    const approved = await f.inspect();
    const counts = new Map<string, number>();

    f.onHash(file => {
      if (!file.name.endsWith(".bin")) return;

      const count = (counts.get(file.name) ?? 0) + 1;

      counts.set(file.name, count);

      if (count !== 2) return;

      const key = [...f.bytes.keys()].find(path => path.endsWith(file.name))!;

      f.bytes.set(key, new File(["x".repeat(file.size)], file.name, { lastModified: file.lastModified }));
    });

    const result = await f.execute(approved);

    expect(result.phase).toBe("error");
    expect(result.items[0].status).toBe("uncertain");
  });

  it("does not write failure records after owner/connection lifetime ends", async () => {
    const f = backupFilesystem();
    const approved = await f.inspect();
    let atStop = 0;

    f.onWrite(key => {
      if (key.endsWith(".bin")) {
        atStop = f.writes.length;
        f.stale();
      }
    });

    const result = await f.execute(approved);

    expect(result.phase).toBe("error");
    expect(result.journalComplete).toBe(false);
    expect(f.writes).toHaveLength(atStop);
  });

  it("rejects metadata size limits and ambiguous names before hashing any bytes", async () => {
    for (const change of ["oversize", "batch", "ambiguous", "folder"] as const) {
      const f = backupFilesystem();
      let hashes = 0;

      f.onHash(() => {
        hashes++;
      });

      if (change === "oversize" || change === "batch") {
        const files = change === "oversize"
          ? [f.bytes.get("source/to/empty.txt")!]
          : [...f.bytes].filter(([path]) => path.startsWith("source/")).map(([, file]) => file);

        for (const file of files) Object.defineProperty(file, "size", { value: 16 * 1024 * 1024 + (change === "oversize" ? 1 : 0) });
      } else if (change === "ambiguous") {
        f.bytes.set("source/to/A.txt", new File(["private"], "A.txt"));
      } else {
        f.bytes.delete("source/to/a.txt");
        f.replaceDirectory("source/to/a.txt");
      }

      await expect(f.inspect()).rejects.toThrow();
      expect(hashes).toBe(0);
      expect(f.writes).toEqual([]);
    }
  });
});
