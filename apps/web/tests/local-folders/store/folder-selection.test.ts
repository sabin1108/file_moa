import { describe, expect, it, vi } from "vitest";
import { SourceListingController } from "../../../src/features/local-folders/store/source-listing-controller";
import { SourcePlanController } from "../../../src/features/local-folders/store/source-plan-controller";
import type { FolderListing } from "../../../src/features/local-folders/services/source-folder-listing";

async function setup() {
  const value: FolderListing = {
    path: [],
    entries: [{ name: "문서.md", kind: "file" }, { name: "하위", kind: "directory" }],
    truncated: false
  };
  const read = vi.fn(async () => value);
  const listing = new SourceListingController(read, vi.fn());

  listing.reset(true);
  await listing.open([]);

  return { listing, read };
}

describe("folder selection boundary", () => {
  it("selects a directory but blocks a mixed plan without silently excluding it", async () => {
    const { listing, read } = await setup();

    listing.toggleSelection("하위");
    listing.toggleSelection("문서.md");
    expect(listing.getSnapshot().selectedNames).toEqual(["하위", "문서.md"]);

    const plan = new SourcePlanController(listing, read, vi.fn());

    read.mockClear();
    plan.open("copy");
    expect(plan.getSnapshot().open).toBe(false);
    expect(read).not.toHaveBeenCalled();
    listing.toggleSelection("하위");
    plan.open("copy");
    expect(plan.getSnapshot().open).toBe(true);
  });
  it("preserves directory selection on refresh and view restoration; select-all remains files only", async () => {
    const { listing } = await setup();

    listing.toggleSelection("하위");
    await listing.refresh();
    expect(listing.getSnapshot().selectedNames).toEqual(["하위"]);
    listing.restoreView({
      query: "",
      selectionOpen: true,
      searchOpen: false,
      selectedNames: ["하위", "사라짐"],
      selectedKinds: { "하위": "directory", "사라짐": "file" }
    });
    expect(listing.getSnapshot().selectedNames).toEqual(["하위"]);
    listing.selectAll();
    expect(listing.getSnapshot().selectedNames).toEqual(["하위", "문서.md"]);
    listing.clearVisibleSelection();
    expect(listing.getSnapshot().selectedNames).toEqual(["하위"]);
    listing.clearSelection();
    expect(listing.getSnapshot().selectedNames).toEqual([]);
  });
  it("does not select hidden or stale directory entries", async () => {
    const { listing } = await setup();

    listing.setQuery("문서");
    listing.toggleSelection("하위");
    expect(listing.getSnapshot().selectedNames).toEqual([]);
    listing.setQuery("");
    listing.suspend();
    listing.toggleSelection("하위");
    expect(listing.getSnapshot().selectedNames).toEqual([]);
  });
  it("drops a selected folder whose name now belongs to a file", async () => {
    const { listing, read } = await setup();

    listing.toggleSelection("하위");
    read.mockResolvedValueOnce({ path: [], entries: [{ name: "하위", kind: "file" }], truncated: false });
    await listing.refresh();
    expect(listing.getSnapshot().selectedNames).toEqual([]);
  });
});
