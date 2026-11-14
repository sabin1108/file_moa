import { describe, expect, it, vi } from "vitest";
import { SourceListingController } from "../../../src/features/local-folders/browsing/file-list/source-listing-controller";
import { FolderTrailController } from "../../../src/features/local-folders/browsing/navigation/folder-trail-controller";
import { EntryCreationController } from "../../../src/features/local-folders/creation/entry-creation-controller";

describe("folder workspace state", () => {
  it("cancel selection clears hidden search selections and closes tools without reading", async () => {
    const read = vi.fn(async (path: readonly string[]) => ({
      path,
      entries: [{ name: "a.md", kind: "file" as const }, { name: "b.txt", kind: "file" as const }],
      truncated: false
    }));
    const listing = new SourceListingController(read, vi.fn());

    listing.reset(true);
    await listing.open([]);
    listing.selectAll();
    listing.setQuery("a");
    listing.exitSelection();
    expect(listing.getSnapshot()).toMatchObject({ selectionOpen: false, selectedNames: [], query: "a" });
    expect(read).toHaveBeenCalledTimes(1);
  });
  it("ancestor columns use visited data only and expire with connection", async () => {
    const read = vi.fn(async (path: readonly string[]) => ({ path, entries: [], truncated: false }));
    const listing = new SourceListingController(read, vi.fn()), trail = new FolderTrailController(listing);

    listing.reset(true);
    await listing.open([]);
    await listing.open(["a"]);
    await listing.open(["a", "b"]);
    expect(trail.getSnapshot().map(item => item.path)).toEqual([[], ["a"]]);
    expect(read).toHaveBeenCalledTimes(3);
    listing.reset(false);
    expect(trail.getSnapshot()).toEqual([]);
  });
  it("blocks duplicate submission and suppresses results after form unmount", async () => {
    let finish!: (value: readonly string[]) => void;
    const create = vi.fn(() => new Promise<readonly string[]>(resolve => {
      finish = resolve;
    }));
    const controller = new EntryCreationController(create);
    const task = controller.run([], "a");

    expect(await controller.run([], "a")).toBe(false);
    controller.dispose();
    finish(["a"]);
    expect(await task).toBe(false);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
