import { expect, it, vi } from "vitest";
import { SourceListingController } from "../../../../src/features/local-folders/browsing/file-list/source-listing-controller";

it("keeps bulk-clear mode, but exits after the last individual deselection", async () => {
  const controller = new SourceListingController(
    async () => ({ path: [], entries: [{ name: "a.md", kind: "file" }], truncated: false }),
    vi.fn()
  );

  controller.reset(true);
  await controller.open([]);
  controller.toggleSelection("a.md");
  expect(controller.getSnapshot().selectionOpen).toBe(true);
  controller.clearSelection();
  expect(controller.getSnapshot()).toMatchObject({ selectedNames: [], selectionOpen: true });
  controller.toggleSelection("a.md");
  controller.toggleSelection("a.md");
  expect(controller.getSnapshot().selectionOpen).toBe(false);
  controller.selectAll();
  controller.clearVisibleSelection();
  expect(controller.getSnapshot()).toMatchObject({ selectedNames: [], selectionOpen: true });
  controller.reset(false);
  expect(controller.getSnapshot().selectionOpen).toBe(false);
});
