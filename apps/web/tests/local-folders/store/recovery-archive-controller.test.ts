import { describe, expect, it, vi } from "vitest";
import { RecoveryArchiveController } from "../../../src/features/local-folders/store/recovery-archive-controller";
import type { RecoveryArchiveDetail, RecoveryArchiveList } from "../../../src/features/local-folders/lib/recovery-archive";

const list: RecoveryArchiveList = { truncated: false, items: [{ id: "item", fileName: "a.txt", originalPath: ["to", "a.txt"],
  bytes: 1, createdAt: "2026-11-04T00:00:00.000Z", recorded: "completed", canInspect: true }] };
const detail: RecoveryArchiveDetail = { status: "verified", payload: "verified", journal: "verified", issue: null, checkedAt: "now" };

describe("archive UI request lifetime", () => {
  it("does not inspect a payload on open and uses explicit selection", async () => {
    const inspect = vi.fn(async () => detail);
    const controller = new RecoveryArchiveController(async () => list, inspect);
    await controller.open();
    expect(inspect).not.toHaveBeenCalled();
    await controller.inspect("foreign");
    expect(inspect).not.toHaveBeenCalled();
    await controller.inspect("item");
    expect(controller.getSnapshot().detail).toMatchObject({ id: "item", phase: "ready", result: detail });
  });

  it("discards a late list after closing", async () => {
    let resolve!: (value: RecoveryArchiveList) => void;
    const controller = new RecoveryArchiveController(() => new Promise(done => { resolve = done; }), async () => detail);
    const task = controller.open();
    controller.close();
    resolve(list);
    await task;
    expect(controller.getSnapshot()).toMatchObject({ open: false, list: null });
  });

  it("cancels detail reads and discards late verification", async () => {
    let resolve!: (value: RecoveryArchiveDetail) => void;
    let signal!: AbortSignal;
    const controller = new RecoveryArchiveController(async () => list, (_id, abort) => {
      signal = abort;
      return new Promise(done => { resolve = done; });
    });
    await controller.open();
    const task = controller.inspect("item");
    controller.cancel();
    expect(signal.aborted).toBe(true);
    resolve(detail);
    await task;
    expect(controller.getSnapshot().detail).toMatchObject({ phase: "cancelled", result: null });
  });

  it("clears prior data after stale ownership rather than publishing an old result", async () => {
    const controller = new RecoveryArchiveController(async () => list, async () => { throw Error("stale-connection-operation"); });
    await controller.open();
    await controller.inspect("item");
    expect(controller.getSnapshot()).toMatchObject({ open: false, list: null, detail: null });
  });
});
