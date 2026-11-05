import { describe, expect, it, vi } from "vitest";
import { RecoveryBackupController } from "../../../src/features/local-folders/store/recovery-backup-controller";
import type { BackupInspection } from "../../../src/features/local-folders/lib/recovery-backup";
import type { BackupExecution } from "../../../src/features/local-folders/services/recovery-backup";
import type { FileChangePlan } from "../../../src/features/local-folders/lib/file-change-plan";

const plan: FileChangePlan = { operation: "copy", conflictCount: 1, directoriesToCreate: [],
  rows: [{ from: ["from", "a.txt"], to: ["to", "a.txt"], issues: ["name-conflict"] }] };
const report: BackupInspection = { vaultId: "vault", totalBytes: 2, files: [] };
const result: BackupExecution = { id: "op", phase: "completed", issue: null, journalComplete: true, items: [] };

describe("backup UI lifetime", () => {
  it("discards private reports when overwrite rejects a stale connection", async () => {
    const controller = new RecoveryBackupController(async () => report, async () => result, () => true,
      async () => { throw Error("stale-connection-operation"); });
    await controller.inspect(plan);
    await controller.start();
    controller.confirmOverwrite();
    await controller.startOverwrite();
    expect(controller.getSnapshot()).toMatchObject({ phase: "idle", report: null, result: null, overwrite: null });
  });
  it("REPLACE requires a separate confirmation, prevents double execution and resets late results", async () => {
    let resolve!: (value: import("../../../src/features/local-folders/lib/recovery-overwrite").OverwriteExecution) => void;
    let signal!: AbortSignal;
    const overwrite = vi.fn(async (_plan, _report, _backup, abort: AbortSignal) => {
      signal = abort;
      return new Promise<import("../../../src/features/local-folders/lib/recovery-overwrite").OverwriteExecution>(done => { resolve = done; });
    });
    const discard = vi.fn();
    const controller = new RecoveryBackupController(async () => report, async () => result, () => true, overwrite, discard);
    await controller.startOverwrite();
    expect(overwrite).not.toHaveBeenCalled();
    await controller.inspect(plan);
    await controller.start();
    await controller.startOverwrite();
    expect(overwrite).not.toHaveBeenCalled();
    controller.confirmOverwrite();
    expect(controller.getSnapshot()).toMatchObject({ phase: "confirming", mode: "overwrite" });
    const task = controller.startOverwrite();
    await controller.startOverwrite();
    expect(overwrite).toHaveBeenCalledOnce();
    controller.cancel();
    expect(signal.aborted).toBe(true);
    expect(controller.getSnapshot()).toMatchObject({ phase: "running", cancelling: true });
    controller.reset();
    resolve({ ...result, phase: "cancelled" });
    await task;
    expect(controller.getSnapshot().phase).toBe("idle");
    expect(discard).toHaveBeenCalled();
  });
  it("requires inspection and starts exactly once from the inspected plan", async () => {
    const run = vi.fn(async () => result);
    const controller = new RecoveryBackupController(async () => report, run, () => true);
    await controller.start();
    expect(run).not.toHaveBeenCalled();
    await controller.inspect(plan);
    expect(controller.getSnapshot().phase).toBe("ready");
    await controller.start();
    await controller.start();
    expect(run).toHaveBeenCalledOnce();
    expect(controller.getSnapshot()).toMatchObject({ phase: "completed", result });
  });

  it("blocks I/O if the recovery connection is unavailable", async () => {
    const inspect = vi.fn(async () => report);
    const controller = new RecoveryBackupController(inspect, async () => result, () => false);
    await controller.inspect(plan);
    expect(inspect).not.toHaveBeenCalled();
    expect(controller.getSnapshot().issue).toBe("connection");
  });

  it("discards late inspection after reset", async () => {
    let resolve!: (value: BackupInspection) => void;
    const controller = new RecoveryBackupController(() => new Promise(done => { resolve = done; }), async () => result, () => true);
    const task = controller.inspect(plan);
    controller.reset();
    resolve(report);
    await task;
    expect(controller.getSnapshot()).toMatchObject({ phase: "idle", report: null });
  });

  it("waits for cancellation settlement instead of restoring an executable approval", async () => {
    let resolve!: (value: BackupExecution) => void;
    let signal!: AbortSignal;
    const controller = new RecoveryBackupController(async () => report, async (_plan, _report, abort) => {
      signal = abort;
      return new Promise(done => { resolve = done; });
    }, () => true);
    await controller.inspect(plan);
    const task = controller.start();
    controller.cancel();
    expect(signal.aborted).toBe(true);
    expect(controller.getSnapshot()).toMatchObject({ phase: "running", cancelling: true });
    resolve({ ...result, phase: "cancelled" });
    await task;
    expect(controller.getSnapshot()).toMatchObject({ phase: "cancelled", cancelling: false });
  });
});
