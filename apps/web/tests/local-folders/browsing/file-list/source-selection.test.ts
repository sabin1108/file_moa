import { describe, expect, it, vi } from "vitest";
import { SourceListingController } from "../../../../src/features/local-folders/browsing/file-list/source-listing-controller";
import type { FolderListing } from "../../../../src/features/local-folders/browsing/source-folder-listing";

const result = (path: string[] = [], names = ["a.md", "b.pdf"]): FolderListing => ({
  path,
  entries: [...names.map(name => ({ name, kind: "file" as const })), { name: "child", kind: "directory" }],
  truncated: false,
});

async function setup() {
  const read = vi.fn(async (path: readonly string[]) => result([...path]));
  const controller = new SourceListingController(read, vi.fn());

  controller.reset(true);
  await controller.open([]);

  return { controller, read };
}

describe("current-folder file selection", () => {
  it("SELECT-024 exits on last individual uncheck and keeps bulk-clear mode", async () => {
    const { controller } = await setup();

    controller.toggleSelection("a.md");
    expect(controller.getSnapshot().selectionOpen).toBe(true);
    controller.toggleSelection("b.pdf");
    controller.toggleSelection("a.md");
    expect(controller.getSnapshot().selectionOpen).toBe(true);
    controller.toggleSelection("b.pdf");
    expect(controller.getSnapshot()).toMatchObject({ selectionOpen: false, selectedNames: [] });
    controller.selectAll();
    controller.clearSelection();
    expect(controller.getSnapshot()).toMatchObject({ selectionOpen: true, selectedNames: [] });
    controller.selectAll();
    controller.clearVisibleSelection();
    expect(controller.getSnapshot().selectionOpen).toBe(true);
  });
  it("SELECT-001 toggles visible files and folders, never unknown names", async () => {
    const { controller, read } = await setup();

    controller.toggleSelection("a.md");
    controller.toggleSelection("b.pdf");
    controller.toggleSelection("child");
    controller.toggleSelection("absent.txt");
    expect(controller.getSnapshot().selectedNames).toEqual(["a.md", "b.pdf", "child"]);
    controller.toggleSelection("a.md");
    expect(controller.getSnapshot().selectedNames).toEqual(["b.pdf", "child"]);
    expect(read).toHaveBeenCalledTimes(1);
  });
  it("SELECT-002/003 selects only displayed files, then clears without I/O", async () => {
    const { controller, read } = await setup();

    read.mockResolvedValueOnce({ ...result(), truncated: true });
    await controller.refresh();
    controller.selectAll();
    controller.selectAll();
    expect(controller.getSnapshot().selectedNames).toEqual(["a.md", "b.pdf"]);
    controller.clearSelection();
    expect(controller.getSnapshot().selectedNames).toEqual([]);
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("SELECT-004 preserves selection through reader unmount/remount", async () => {
    const { controller } = await setup();

    controller.toggleSelection("a.md");

    const leave = controller.activate();

    leave();
    controller.activate();
    expect(controller.getSnapshot().selectedNames).toEqual(["a.md"]);
  });
  it("SELECT-004 clears immediately on a different path, even when navigation fails", async () => {
    const { controller, read } = await setup();

    controller.selectAll();
    read.mockRejectedValueOnce(new Error("missing"));

    const task = controller.open(["child"]);

    expect(controller.getSnapshot().selectedNames).toEqual([]);
    await task;
    expect(controller.getSnapshot().selectedNames).toEqual([]);
  });
  it("SELECT-005 prunes deleted files and files that became directories on successful refresh", async () => {
    const { controller, read } = await setup();

    controller.selectAll();
    read.mockResolvedValueOnce({
      ...result([], ["b.pdf", "new.txt"]),
      entries: [{ name: "a.md", kind: "directory" }, { name: "b.pdf", kind: "file" }]
    });
    await controller.refresh();
    expect(controller.getSnapshot().selectedNames).toEqual(["b.pdf"]);
  });
  it("SELECT-005 preserves stale selection on failure and blocks additions, but permits clearing", async () => {
    const { controller, read } = await setup();

    controller.toggleSelection("a.md");
    read.mockRejectedValueOnce(new Error("I/O"));
    await controller.refresh();
    controller.toggleSelection("b.pdf");
    controller.selectAll();
    expect(controller.getSnapshot().selectedNames).toEqual(["a.md"]);
    controller.clearSelection();
    expect(controller.getSnapshot().selectedNames).toEqual([]);
  });
  it("SELECT-002/005 limits selection to the refreshed partial display without inferring source deletion", async () => {
    const { controller, read } = await setup();

    controller.selectAll();
    read.mockResolvedValueOnce({ ...result([], ["b.pdf", "c.txt"]), truncated: true });
    await controller.refresh();
    expect(controller.getSnapshot().selectedNames).toEqual(["b.pdf"]);
    controller.selectAll();
    expect(controller.getSnapshot().selectedNames).toEqual(["b.pdf", "c.txt"]);
  });
  it("SELECT-005 blocks changes during refresh and keeps selection after cancellation", async () => {
    const { controller, read } = await setup();

    controller.toggleSelection("a.md");

    let finish!: (value: FolderListing) => void;

    read.mockReturnValueOnce(new Promise(resolve => {
      finish = resolve;
    }));

    const task = controller.refresh();

    controller.toggleSelection("b.pdf");
    controller.selectAll();
    expect(controller.getSnapshot().selectedNames).toEqual(["a.md"]);
    controller.cancel();
    finish(result([], []));
    await task;
    expect(controller.getSnapshot().selectedNames).toEqual(["a.md"]);
  });
  it("SELECT-005/006 preserves selection across permission loss and revalidates on reconnect refresh", async () => {
    const { controller } = await setup();

    controller.toggleSelection("a.md");
    controller.permissionLost();
    controller.selectAll();
    expect(controller.getSnapshot().selectedNames).toEqual(["a.md"]);
    controller.resume(true);
    await controller.refresh();
    expect(controller.getSnapshot().selectedNames).toEqual(["a.md"]);
  });
  it("SELECT-006 retains selection for cancelled replacement but reset clears connection-scoped data", async () => {
    const { controller } = await setup();

    controller.toggleSelection("a.md");
    controller.suspend();
    controller.resume(true);
    expect(controller.getSnapshot().selectedNames).toEqual(["a.md"]);
    controller.toggleSelection("b.pdf");
    expect(controller.getSnapshot().selectedNames).toEqual(["a.md"]);
    controller.reset(true);
    expect(controller.getSnapshot().selectedNames).toEqual([]);
  });
});
