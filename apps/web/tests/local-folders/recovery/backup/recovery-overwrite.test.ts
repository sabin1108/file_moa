import { describe, expect, it } from "vitest";
import { backupFilesystem, backupOwner } from "../../fixtures/backup-filesystem";
import { executeRecoveryOverwrite } from "../../../../src/features/local-folders/recovery/backup/recovery-overwrite";

async function fixture() {
  const fs = backupFilesystem();
  const report = await fs.inspect();
  const backup = await fs.execute(report);

  expect(backup.phase).toBe("completed");
  fs.writes.length = 0;

  let current = true;
  const check = () => {
    if (!current) throw Error("stale-connection-operation");
  };
  const run = (plan: unknown = fs.plan) => executeRecoveryOverwrite(fs.root, fs.vault, plan, report, backup, backupOwner,
    check, fs.abort.signal, () => { }, fs.hash, async work => work());
  const targetWrites = () => fs.writes.filter(key => /^source\/to\/[^/]+$/u.test(key));

  return {
    ...fs,
    report,
    backup,
    run,
    targetWrites,
    invalidate: () => {
      current = false;
    }
  };
}

describe("REPLACE verified overwrite", () => {
  it("replaces exact conflicts, preserves sources and old backup bytes, including empty files", async () => {
    const f = await fixture();
    const before = new Map(f.bytes);
    const result = await f.run();

    expect(result.phase).toBe("completed");
    expect(result.journalComplete).toBe(true);
    expect(result.items.map(item => item.status)).toEqual(["verified", "verified", "verified"]);

    for (const row of f.plan.rows) {
      expect(await f.bytes.get(`source/${row.to.join("/")}`)!.text()).toBe(await before.get(`source/${row.from.join("/")}`)!.text());
      expect(f.bytes.get(`source/${row.from.join("/")}`)).toBe(before.get(`source/${row.from.join("/")}`));
    }

    for (const [key, value] of before) if (key.endsWith(".bin")) expect(f.bytes.get(key)).toBe(value);

    expect(f.removes).not.toHaveBeenCalled();
  });

  it.each(["payload", "target-record", "vault-record", "target-change", "source-change", "denied", "incomplete", "start-record"])("blocks %s before any target writable", async fault => {
    const f = await fixture();

    if (fault === "payload") {
      const key = [...f.bytes.keys()].find(key => key.endsWith(".bin"))!;

      f.bytes.set(key, new File(["corrupt"], "broken"));
    } else if (fault === "target-record" || fault === "vault-record") {
      const prefix = fault === "target-record" ? "source/to/.moa-history/" : "vault/";
      const key = [...f.bytes.keys()].find(key => key.startsWith(prefix) && key.endsWith("stopped.json"))!;

      f.bytes.set(key, new File(["{}"], "stopped.json"));
    } else if (fault === "target-change" || fault === "source-change") {
      const key = `source/${fault === "target-change" ? "to" : "from"}/a.txt`;
      const old = f.bytes.get(key)!;

      f.bytes.set(key, new File(["X".repeat(old.size)], old.name, { lastModified: old.lastModified }));
    } else if (fault === "denied") f.deny();
    else if (fault === "incomplete") Object.assign(f.backup, { journalComplete: false });
    else f.fail((key, step) => key.includes("moa-overwrite-") && key.endsWith("target-started.json") && step === "write");

    const result = await f.run();

    expect(result.phase).toBe("error");
    expect(f.targetWrites()).toEqual([]);
  });

  it.each(["write", "close", "read"] as const)("stops on second target %s failure and retains first success", async step => {
    const f = await fixture();
    let targetClosed = false;

    f.onClose(key => {
      if (key === "source/to/한글 파일.txt") targetClosed = true;
    });
    f.fail((key, action) => key === "source/to/한글 파일.txt" && action === step && (step !== "read" || targetClosed));

    const result = await f.run();

    expect(result.phase).toBe("error");
    expect(result.items.map(item => item.status)).toEqual(["verified", "uncertain", "not-run"]);
    expect(f.targetWrites()).not.toContain("source/to/empty.txt");
  });

  it("aborts a target stream on cancellation and never starts the next item", async () => {
    const f = await fixture();

    f.onWrite(key => {
      if (key === "source/to/a.txt") f.abort.abort();
    });

    const result = await f.run();

    expect(result.phase).toBe("cancelled");
    expect(result.items.map(item => item.status)).toEqual(["uncertain", "not-run", "not-run"]);
    expect(await f.bytes.get("source/to/a.txt")!.text()).toBe("OLD_a.txt");
  });

  it("does not write failure records or publish progress after owner invalidation", async () => {
    const f = await fixture();

    f.onWrite(key => {
      if (key === "source/to/a.txt") f.invalidate();
    });

    const result = await f.run();

    expect(result.phase).toBe("error");
    expect(f.writes.filter(key => key.includes("moa-overwrite-") && key.endsWith("stopped.json"))).toEqual([]);
    expect(f.targetWrites()).toEqual(["source/to/a.txt"]);
  });

  it("detects parent replacement after the start record and refuses target open", async () => {
    const f = await fixture();

    f.onClose(key => {
      if (key.endsWith("target-started.json")) f.replaceDirectory("source/to");
    });

    const result = await f.run();

    expect(result.phase).toBe("error");
    expect(f.targetWrites()).toEqual([]);
  });

  it("replaces with an empty source using close and verified empty readback", async () => {
    const f = backupFilesystem();

    f.bytes.set("source/from/a.txt", new File([], "a.txt", { lastModified: 10 }));

    const approved = await f.inspect();
    const backup = await f.execute(approved);
    const result = await executeRecoveryOverwrite(f.root, f.vault, f.plan, approved, backup, backupOwner,
      () => { }, f.abort.signal, () => { }, f.hash, async work => work());

    expect(result.phase).toBe("completed");
    expect(f.bytes.get("source/to/a.txt")!.size).toBe(0);
  });

  it("blocks metadata limits and path escape before target writes", async () => {
    const f = await fixture();
    const plan = { ...f.plan, rows: [{ ...f.plan.rows[0], to: ["..", "a.txt"] }, ...f.plan.rows.slice(1)] };

    expect((await f.run(plan)).phase).toBe("error");
    expect(f.targetWrites()).toEqual([]);
  });

  it("rejects an oversized later source before hashing or writing a target", async () => {
    const f = await fixture();
    const large = new File(["synthetic"], "empty.txt", { lastModified: 10 });

    Object.defineProperty(large, "size", { value: 16 * 1024 * 1024 + 1 });
    f.bytes.set("source/from/empty.txt", large);

    let hashes = 0;

    f.onHash(() => {
      hashes++;
    });
    expect((await f.run()).phase).toBe("error");
    expect(hashes).toBe(0);
    expect(f.targetWrites()).toEqual([]);
  });

  it("aborts before close when the destination changes during streaming", async () => {
    const f = await fixture();

    f.onWrite(key => {
      if (key === "source/to/a.txt") f.bytes.set(key, new File(["EXTERNAL"], "a.txt", { lastModified: 30 }));
    });

    const result = await f.run();

    expect(result.phase).toBe("error");
    expect(result.items.map(item => item.status)).toEqual(["uncertain", "not-run", "not-run"]);
    expect(await f.bytes.get("source/to/a.txt")!.text()).toBe("EXTERNAL");
  });

  it("detects an earlier destination modified while a later file runs", async () => {
    const f = await fixture();

    f.onWrite(key => {
      if (key === "source/to/empty.txt") f.bytes.set("source/to/a.txt", new File(["EXTERNAL"], "a.txt"));
    });

    const result = await f.run();

    expect(result.phase).toBe("error");
    expect(result.items[0].status).toBe("uncertain");
  });

  it("marks final record audit mismatch as uncertain without retrying targets", async () => {
    const f = await fixture();

    f.onClose(key => {
      if (key.includes("moa-overwrite-") && key.endsWith("stopped.json")) {
        const name = [...f.bytes.keys()].find(path => path.includes("moa-overwrite-") && path.endsWith("prepared.json"))!;

        f.bytes.set(name, new File(["{}"], "prepared.json"));
      }
    });

    const result = await f.run();

    expect(result.phase).toBe("error");
    expect(result.journalComplete).toBe(false);
    expect(result.items.every(item => item.status === "uncertain")).toBe(true);
    expect(f.targetWrites()).toHaveLength(3);
  });
});
