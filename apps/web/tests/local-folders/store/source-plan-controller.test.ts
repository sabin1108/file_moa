import { afterEach, describe, expect, it, vi } from "vitest";
import { SourceListingController } from "../../../src/features/local-folders/store/source-listing-controller";
import { SourcePlanController } from "../../../src/features/local-folders/store/source-plan-controller";
import type { FolderListing } from "../../../src/features/local-folders/services/source-folder-listing";
import type { CopyExecution } from "../../../src/features/local-folders/services/copy-execution";
import { RecoveryBackupController } from "../../../src/features/local-folders/store/recovery-backup-controller";
import type { BackupExecution } from "../../../src/features/local-folders/services/recovery-backup";

const folder = (path: readonly string[] = []): FolderListing => ({ path, entries: [{ name: "a.md", kind: "file" }, { name: "b.txt", kind: "file" }], truncated: false });
afterEach(() => vi.useRealTimers());
async function setup() {
  const listing = new SourceListingController(async path => folder(path), vi.fn());
  listing.reset(true);
  await listing.open([]);
  listing.toggleSelection("a.md");
  // Only the async filesystem read is replaced; real listing and plan lifecycles run together.
  const read = vi.fn<(path: readonly string[], signal: AbortSignal) => Promise<FolderListing>>(async path => path.length ? { path, entries: [], truncated: false } : folder());
  const permissionLost = vi.fn(() => listing.permissionLost());
  const plan = new SourcePlanController(listing, read, permissionLost);
  return { listing, read, plan, permissionLost };
}

describe("source plan lifetime", () => {
  it("keeps a running backup stable and removes stale results when the source disconnects", async () => {
    const { listing, read, permissionLost } = await setup();
    let finish!: (value: BackupExecution) => void;
    const backup = new RecoveryBackupController(async () => ({ vaultId: "v", files: [], totalBytes: 0 }),
      async () => new Promise(done => { finish = done; }), () => true);
    read.mockImplementation(async path => folder(path));
    const controller = new SourcePlanController(listing, read, permissionLost, undefined, undefined, backup);
    controller.open("copy");
    controller.setDestination("destination");
    await controller.generate();
    await controller.inspectBackup();
    const task = backup.start();
    controller.setDestination("other");
    expect(controller.getSnapshot().destination).toBe("destination");
    controller.close();
    expect(controller.getSnapshot().open).toBe(true);
    expect(backup.getSnapshot().cancelling).toBe(true);
    listing.reset(false);
    expect(controller.getSnapshot().open).toBe(false);
    finish({ id: "old", phase: "completed", issue: null, journalComplete: true, items: [] });
    await task;
    expect(backup.getSnapshot()).toMatchObject({ phase: "idle", result: null });
  });
  it("FEEDBACK-002 retains the prior plan during a 360ms recheck, but cannot inspect it", async () => {
    vi.useFakeTimers();
    const { plan, read } = await setup();
    plan.open("copy"); plan.setDestination("보관");
    const first = plan.generate();
    await vi.advanceTimersByTimeAsync(359);
    expect(plan.getSnapshot().phase).toBe("loading");
    await vi.advanceTimersByTimeAsync(1); await first;
    const previous = plan.getSnapshot().result;
    const repeat = plan.generate();
    expect(plan.getSnapshot()).toMatchObject({ phase: "loading", result: previous });
    await plan.inspectCopy();
    expect(plan.inspection.getSnapshot().phase).toBe("idle");
    await vi.advanceTimersByTimeAsync(359);
    expect(plan.getSnapshot().phase).toBe("loading");
    plan.cancel();
    await vi.advanceTimersByTimeAsync(1); await repeat;
    expect(plan.getSnapshot()).toMatchObject({ phase: "draft", result: null });
    expect(read).toHaveBeenCalledTimes(4);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("requires an explicit destination before any plan I/O", async () => {
    const { plan, read } = await setup(); plan.open("copy"); await plan.generate();
    expect(read).not.toHaveBeenCalled(); expect(plan.getSnapshot()).toMatchObject({ destinationConfirmed: false, phase: "draft" });
    plan.setDestination("보관"); await plan.generate(); expect(plan.getSnapshot().destinationConfirmed).toBe(true);
  });
  it("acknowledges only a fully recorded copy and captures its destination before closing", async () => {
    const { listing, read, permissionLost } = await setup();
    let phase: CopyExecution["phase"] = "cancelled";
    const plan = new SourcePlanController(listing, read, permissionLost, async () => ({ files: [], totalBytes: 0 }),
      async () => ({ id: "test", phase, items: [], issue: null, journalComplete: phase === "completed" }));
    expect(plan.completeCopy()).toBeNull();
    plan.open("copy"); plan.setDestination("보관"); await plan.generate(); await plan.inspectCopy(); await plan.executeCopy();
    expect(plan.completeCopy()).toBeNull(); expect(plan.getSnapshot().open).toBe(true);
    phase = "completed"; plan.close(); plan.open("copy"); plan.setDestination("보관");
    await plan.generate(); await plan.inspectCopy(); await plan.executeCopy();
    expect(plan.completeCopy()).toEqual(["보관"]); expect(plan.getSnapshot().open).toBe(false);
    expect(plan.completeCopy()).toBeNull();
  });
  it.each(["copy", "move"] as const)("opens the directly chosen %s action without I/O or stale results", async operation => {
    const { plan, read, listing } = await setup();
    plan.open(); plan.setDestination("보관"); await plan.generate(); plan.close(); read.mockClear();
    plan.open(operation);
    expect(plan.getSnapshot()).toMatchObject({ open: true, operation, phase: "draft", result: null });
    expect(listing.getSnapshot().selectedNames).toEqual(["a.md"]);
    expect(read).not.toHaveBeenCalled();
  });
  it("keeps cancellation settlement visible during a same-connection listing refresh", async () => {
    const { listing, read, permissionLost } = await setup();
    let finish!: (result: CopyExecution) => void, signal!: AbortSignal;
    const plan = new SourcePlanController(listing, read, permissionLost, async () => ({ files: [], totalBytes: 0 }),
      (_plan, _report, requested) => { signal = requested; return new Promise(resolve => { finish = resolve; }); });
    plan.open(); plan.setOperation("copy"); plan.setDestination("보관"); await plan.generate(); await plan.inspectCopy();
    const pending = plan.executeCopy(); listing.toggleSelection("b.txt");
    expect(signal.aborted).toBe(true); expect(plan.getSnapshot().open).toBe(true);
    expect(plan.execution.getSnapshot()).toMatchObject({ running: true, cancelling: true });
    finish({ id: "test", phase: "cancelled", items: [], issue: null, journalComplete: true }); await pending;
    expect(plan.execution.getSnapshot().result?.phase).toBe("cancelled");
    plan.close(); expect(plan.getSnapshot().open).toBe(false);
  });
  it("INSPECT-001/005 inspects only a ready copy and invalidates on input or listing changes", async () => {
    const { listing, read, permissionLost } = await setup();
    const inspect = vi.fn(async () => ({ files: [], totalBytes: 0 }));
    const plan = new SourcePlanController(listing, read, permissionLost, inspect);
    plan.open(); plan.setDestination("보관"); await plan.generate();
    await plan.inspectCopy(); expect(inspect).not.toHaveBeenCalled();
    plan.setOperation("copy"); await plan.generate(); await plan.inspectCopy();
    expect(plan.inspection.getSnapshot().phase).toBe("ready");
    plan.setDestination("새 보관"); expect(plan.inspection.getSnapshot().phase).toBe("idle");
    await plan.generate(); await plan.inspectCopy();
    listing.clearSelection(); expect(plan.inspection.getSnapshot().phase).toBe("idle");
  });
  it("PLAN-001 opens only fresh selected files without I/O", async () => {
    const { plan, listing, read } = await setup();
    plan.open();
    expect(plan.getSnapshot().open).toBe(true);
    expect(read).not.toHaveBeenCalled();
    plan.close(); listing.clearSelection(); plan.open();
    expect(plan.getSnapshot().open).toBe(false);
    listing.toggleSelection("a.md"); listing.suspend(); plan.open();
    expect(plan.getSnapshot().open).toBe(false);
  });
  it("PLAN-003/004 rereads source and destination, preserving selection", async () => {
    const { plan, listing, read } = await setup();
    plan.open(); plan.setDestination("보관"); await plan.generate();
    expect(read.mock.calls.map(call => call[0])).toEqual([[], ["보관"]]);
    expect(plan.getSnapshot().result?.rows[0].to).toEqual(["보관", "a.md"]);
    expect(listing.getSnapshot().selectedNames).toEqual(["a.md"]);
    expect(listing.getSnapshot().result?.path).toEqual([]);
  });
  it("PLAN-004 refuses a selected file missing from the refreshed source", async () => {
    const { plan, read } = await setup();
    read.mockResolvedValueOnce({ path: [], entries: [], truncated: false });
    plan.open(); plan.setDestination(""); await plan.generate();
    expect(plan.getSnapshot()).toMatchObject({ phase: "error", issue: "source-changed", result: null });
  });
  it("PLAN-003 proposes absent classification folders without a creation read", async () => {
    const { plan, read } = await setup();
    plan.open(); plan.setOperation("classify"); plan.setDestination("보관"); await plan.generate();
    expect(plan.getSnapshot().result?.directoriesToCreate).toEqual([["보관", "마크다운"]]);
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("PLAN-005 leaves absent classification folders unconfirmed in a partial parent", async () => {
    const { plan, read } = await setup();
    read.mockResolvedValueOnce(folder()).mockResolvedValueOnce({ path: ["보관"], entries: [], truncated: true });
    plan.open(); plan.setOperation("classify"); plan.setDestination("보관"); await plan.generate();
    expect(plan.getSnapshot().result?.directoriesToCreate).toEqual([]);
    expect(plan.getSnapshot().result?.rows[0].issues).toContain("incomplete-destination");
  });
  it("PLAN-007 cancel and input changes abort and discard late results", async () => {
    for (const action of ["cancel", "destination", "operation", "close"] as const) {
      const { plan, read } = await setup();
      let finish!: (value: FolderListing) => void;
      read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
      plan.open(); plan.setDestination(""); const pending = plan.generate();
      if (action === "cancel") plan.cancel();
      if (action === "destination") plan.setDestination("새 폴더");
      if (action === "operation") plan.setOperation("copy");
      if (action === "close") plan.close();
      expect(read.mock.calls[0][1].aborted).toBe(true);
      finish(folder()); await pending;
      expect(plan.getSnapshot().result).toBeNull();
      expect(read).toHaveBeenCalledTimes(1);
    }
  });
  it("PLAN-007 any listing reset/refresh/selection change clears an old plan", async () => {
    for (const action of ["reset", "refresh", "selection", "permission"] as const) {
      const { plan, listing } = await setup();
      plan.open(); plan.setDestination("보관"); await plan.generate();
      if (action === "reset") listing.reset(false); // connection/owner reset uses this exact path
      if (action === "refresh") await listing.refresh();
      if (action === "selection") listing.clearSelection();
      if (action === "permission") listing.permissionLost();
      expect(plan.getSnapshot()).toMatchObject({ open: false, result: null });
    }
  });
  it("PLAN-007 owner reset while awaiting a read discards success and old permission errors", async () => {
    const { plan, listing, read, permissionLost } = await setup();
    let fail!: (reason: Error) => void;
    read.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
    plan.open(); plan.setDestination(""); const pending = plan.generate(); listing.reset(false);
    fail(new DOMException("old", "NotAllowedError")); await pending;
    expect(plan.getSnapshot().open).toBe(false);
    expect(permissionLost).not.toHaveBeenCalled();
  });
  it("PLAN-008 permission loss reaches shared connection; read errors allow retry", async () => {
    const { plan, read, permissionLost } = await setup();
    plan.open(); plan.setDestination("보관");
    read.mockRejectedValueOnce(new DOMException("missing", "NotFoundError"));
    await plan.generate();
    expect(plan.getSnapshot()).toMatchObject({ open: true, issue: "missing", destination: "보관" });
    await plan.generate(); expect(plan.getSnapshot().phase).toBe("ready");
    read.mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"));
    await plan.generate();
    expect(permissionLost).toHaveBeenCalledOnce();
    expect(plan.getSnapshot().open).toBe(false);
  });
});
