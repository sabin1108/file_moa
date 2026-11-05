import { describe, expect, it, vi } from "vitest";
import { CopyExecutionController } from "../../../src/features/local-folders/store/copy-execution-controller";
import type { CopyExecution } from "../../../src/features/local-folders/services/copy-execution";
import type { FileChangePlan } from "../../../src/features/local-folders/lib/file-change-plan";

const plan: FileChangePlan = { operation: "copy", rows: [], directoriesToCreate: [], conflictCount: 0 };
const report = { files: [], totalBytes: 0 };
const cancelled: CopyExecution = { id: "test", phase: "cancelled", items: [], issue: null, journalComplete: true };
describe("copy execution request lifetime", () => {
  it("prevents duplicate execution and retains settlement after cancel", async () => {
    let finish!: (r: CopyExecution) => void, signal!: AbortSignal;
    const run = vi.fn((_p, _r, s: AbortSignal) => { signal = s; return new Promise<CopyExecution>(r => { finish = r; }); });
    const controller = new CopyExecutionController(run);
    const pending = controller.start(plan, report); await controller.start(plan, report);
    controller.cancel(); expect(signal.aborted).toBe(true); expect(controller.getSnapshot().running).toBe(true);
    finish(cancelled); await pending;
    expect(controller.getSnapshot()).toMatchObject({ running: false, result: cancelled });
    await controller.start(plan, report); expect(run).toHaveBeenCalledOnce();
  });
  it("does not publish a result after owner/navigation teardown", async () => {
    let finish!: (r: CopyExecution) => void;
    const controller = new CopyExecutionController(() => new Promise(r => { finish = r; }));
    const pending = controller.start(plan, report); controller.reset(); finish(cancelled); await pending;
    expect(controller.getSnapshot()).toMatchObject({ running: false, result: null });
  });
});
