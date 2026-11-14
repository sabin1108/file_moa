import { describe, expect, it, vi } from "vitest";
import { RecoveryRestoreController } from "../../../../src/features/local-folders/recovery/restore/recovery-restore-controller";
import type { RestoreExecution, RestorePreview } from "../../../../src/features/local-folders/recovery/restore/recovery-restore-rules";

const preview: RestorePreview = { id: "item", name: "a.txt", originalName: "a.txt", destination: [], renamed: false, size: 1 };
const result: RestoreExecution = {
  id: "op",
  path: ["a.txt"],
  phase: "completed",
  status: "verified",
  issue: null,
  journalComplete: true
};
const listing = { path: [], entries: [], truncated: false };

describe("restore UI execution lifetime", () => {
  it("restores a result or interrupted stage without recreating execution approval", async () => {
    const prepare = vi.fn(async () => preview);
    const run = vi.fn(async () => result);
    const controller = new RecoveryRestoreController(async () => listing, prepare, run);

    await controller.resume("item", [], "result", false, result);
    expect(controller.getSnapshot()).toMatchObject({ phase: "completed", result, preview: null });
    await controller.start();
    await controller.resume("item", [], "execute", true);
    expect(controller.getSnapshot()).toMatchObject({ phase: "error", issue: "interrupted", preview: null });
    await controller.start();
    expect(prepare).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
  it("prepares only a selected destination and executes once after a final action", async () => {
    const run = vi.fn(async () => result);
    const controller = new RecoveryRestoreController(async () => listing, async () => preview, run);

    await controller.start();
    expect(run).not.toHaveBeenCalled();
    await controller.open("item", []);
    await controller.chooseDestination();
    expect(controller.getSnapshot()).toMatchObject({ phase: "ready", preview });
    await controller.start();
    await controller.start();
    expect(run).toHaveBeenCalledOnce();
    expect(controller.getSnapshot()).toMatchObject({ phase: "completed", result });
  });

  it("waits for cancellation settlement and does not permit editing a running operation", async () => {
    let resolve!: (value: RestoreExecution) => void;
    let signal!: AbortSignal;
    const controller = new RecoveryRestoreController(async () => listing, async () => preview, async (_view, abort) => {
      signal = abort;

      return new Promise(done => {
        resolve = done;
      });
    });

    await controller.open("item", []);
    await controller.chooseDestination();

    const task = controller.start();

    await controller.open("other", []);
    controller.cancel();
    expect(signal.aborted).toBe(true);
    expect(controller.getSnapshot()).toMatchObject({ phase: "running", id: "item", cancelling: true });
    resolve({ ...result, phase: "cancelled", status: "uncertain" });
    await task;
    expect(controller.getSnapshot()).toMatchObject({ phase: "cancelled", cancelling: false });
  });

  it("discards a late preview after disposal", async () => {
    let resolve!: (value: RestorePreview) => void;
    const discard = vi.fn();
    const controller = new RecoveryRestoreController(
      async () => listing,
      () => new Promise(done => {
        resolve = done;
      }),
      async () => result,
      discard
    );

    await controller.open("item", []);

    const task = controller.chooseDestination();

    controller.dispose();
    resolve(preview);
    await task;
    expect(controller.getSnapshot().phase).toBe("idle");
    expect(discard).toHaveBeenCalled();
  });
});
