import { describe, expect, it, vi } from "vitest";
import { ManagedFilesController } from "../../../../src/features/local-folders/operations/managed/managed-files-controller";
import type { ManagedPreview, ManagedResult } from "../../../../src/features/local-folders/operations/managed/managed-files";

const preview: ManagedPreview = {
  id: "one",
  kind: "trash",
  roots: [["a.txt"]],
  destination: [],
  files: 1,
  folders: 0,
  bytes: 5,
  paths: [["a.txt"]],
  skipped: false
};
const result: ManagedResult = {
  id: "one",
  phase: "completed",
  status: "verified",
  copied: 0,
  removed: 1,
  preserved: true,
  issue: null
};

function controller(prepare = vi.fn(async () => preview), run = vi.fn(async () => result)) {
  return new ManagedFilesController(vi.fn(), vi.fn(), prepare, run, vi.fn(), vi.fn());
}

describe("managed screen lifetime", () => {
  it("invalidates inspection when changing operation and restores destination confirmation without approval", async () => {
    const read = vi.fn(async () => ({ path: [], entries: [], truncated: false }));
    const prepare = vi.fn(async () => preview);
    const run = vi.fn(async () => result);
    const c = new ManagedFilesController(read, vi.fn(), prepare, run, vi.fn(), vi.fn());

    await c.resume(
      { kind: "copy", source: [], names: ["folder"], destination: [] },
      "destination",
      false,
      undefined,
      true
    );
    expect(c.getSnapshot()).toMatchObject({ phase: "draft", destinationConfirmed: true, preview: null });
    await c.start();
    expect(run).not.toHaveBeenCalled();
    await c.review();
    c.setOperation("move");
    expect(c.getSnapshot()).toMatchObject({ phase: "draft", preview: null, request: { kind: "move" }, destinationConfirmed: true });
    await c.start();
    expect(run).not.toHaveBeenCalled();
    await c.resume(
      { kind: "copy", source: [], names: ["folder"], destination: ["confirmed"] },
      "destination",
      false,
      undefined,
      true,
      true,
      ["browsing"]
    );
    expect(c.getSnapshot().request?.destination).toEqual(["confirmed"]);
    expect(c.picker.getSnapshot().requestedPath).toEqual(["browsing"]);
    c.picker.close();
    expect(c.getSnapshot().destinationConfirmed).toBe(true);
  });
  it("starts copy and move at the shared plan and requires destination confirmation before inspection", async () => {
    const read = vi.fn(async () => ({ path: [], entries: [], truncated: false }));
    const prepare = vi.fn(async () => preview);
    const c = new ManagedFilesController(read, vi.fn(), prepare, vi.fn(), vi.fn(), vi.fn());

    for (const kind of ["copy", "move"] as const) {
      await c.open({ kind, source: [], names: ["folder"], destination: [] });
      expect(c.picker.getSnapshot().open).toBe(false);
      await c.review();
      expect(prepare).not.toHaveBeenCalled();
      await c.browse();
      await c.choose();
      expect(c.getSnapshot()).toMatchObject({ phase: "draft", destinationConfirmed: true });
      expect(prepare).not.toHaveBeenCalled();
      await c.review();
      expect(c.getSnapshot().phase).toBe("ready");
      prepare.mockClear();
    }
  });
  it("discards preparation that finishes after dialog close", async () => {
    let finish!: (value: ManagedPreview) => void;
    const c = controller(vi.fn(() => new Promise(resolve => {
      finish = resolve;
    })));

    await c.open({ kind: "trash", source: [], names: ["a.txt"], destination: [] });

    const pending = c.review();

    c.close();
    finish(preview);
    await pending;
    expect(c.getSnapshot()).toMatchObject({ open: false, preview: null });
  });
  it("ignores double execution and retains cancellation until the service settles", async () => {
    let finish!: (value: ManagedResult) => void;
    const run = vi.fn(() => new Promise<ManagedResult>(resolve => {
      finish = resolve;
    }));
    const c = controller(undefined, run);

    await c.open({ kind: "trash", source: [], names: ["a.txt"], destination: [] });
    await c.review();

    const pending = c.start();

    await c.start();
    expect(run).toHaveBeenCalledTimes(1);
    expect(c.close()).toBe(false);
    expect(c.getSnapshot()).toMatchObject({ open: true, phase: "running", cancelling: true });
    finish({ ...result, phase: "cancelled", status: "uncertain" });
    await pending;
    expect(c.getSnapshot()).toMatchObject({ open: true, phase: "cancelled" });
  });
});
