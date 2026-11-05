import { afterEach, describe, expect, it, vi } from "vitest";
import { CopyInspectionController } from "../../../src/features/local-folders/store/copy-inspection-controller";
import type { CopyInspection } from "../../../src/features/local-folders/lib/copy-inspection";
import type { FileChangePlan } from "../../../src/features/local-folders/lib/file-change-plan";

const plan: FileChangePlan = { operation: "copy", rows: [{ from: ["a"], to: ["to", "a"], issues: [] }], conflictCount: 0, directoriesToCreate: [] };
const result: CopyInspection = { files: [{ from: ["a"], to: ["to", "a"], size: 3, lastModified: 0, sha256: "a".repeat(64) }], totalBytes: 3 };
afterEach(() => vi.useRealTimers());

describe("copy inspection controller", () => {
  it("FEEDBACK-003 keeps a fast success pending for 360ms without an intermediate idle", async () => {
    vi.useFakeTimers();
    const controller = new CopyInspectionController(async () => result, vi.fn());
    const phases: string[] = [];
    controller.subscribe(() => phases.push(controller.getSnapshot().phase));
    const pending = controller.inspect(plan);
    await vi.advanceTimersByTimeAsync(359);
    expect(controller.getSnapshot()).toMatchObject({ phase: "loading", result: null });
    expect(phases).toEqual(["loading"]);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(controller.getSnapshot().phase).toBe("ready");
    phases.length = 0;
    const repeat = controller.inspect(plan);
    expect(phases).toEqual(["loading"]);
    controller.reset();
    await vi.advanceTimersByTimeAsync(360);
    await repeat;
    expect(controller.getSnapshot()).toMatchObject({ phase: "idle", result: null });
    expect(vi.getTimerCount()).toBe(0);
  });
  it("INSPECT-001/006 publishes only actual read completion", async () => {
    const read = vi.fn(async () => result); const controller = new CopyInspectionController(read, vi.fn());
    expect(read).not.toHaveBeenCalled();
    await controller.inspect(plan);
    expect(controller.getSnapshot()).toMatchObject({ phase: "ready", result, issue: null });
  });
  it("INSPECT-005 reset aborts and discards a late success or permission failure", async () => {
    for (const fail of [false, true]) {
      let done!: (value: CopyInspection) => void; let reject!: (error: Error) => void;
      const read = vi.fn<(plan: FileChangePlan, signal: AbortSignal) => Promise<CopyInspection>>(() => new Promise((resolve, fail) => { done = resolve; reject = fail; }));
      const permissionLost = vi.fn(); const controller = new CopyInspectionController(read, permissionLost);
      const pending = controller.inspect(plan); controller.reset();
      expect(read.mock.calls[0][1].aborted).toBe(true);
      if (fail) reject(new DOMException("old", "NotAllowedError")); else done(result);
      await pending;
      expect(controller.getSnapshot()).toMatchObject({ phase: "idle", result: null });
      expect(permissionLost).not.toHaveBeenCalled();
    }
  });
  it("INSPECT-005 reports permission loss and allows generic failure retry", async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error("copy-limit")).mockResolvedValueOnce(result).mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"));
    const lost = vi.fn(); const controller = new CopyInspectionController(read, lost);
    await controller.inspect(plan); expect(controller.getSnapshot().issue).toBe("copy-limit");
    await controller.inspect(plan); expect(controller.getSnapshot().result).toEqual(result);
    await controller.inspect(plan); expect(lost).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().result).toBeNull();
  });
});
