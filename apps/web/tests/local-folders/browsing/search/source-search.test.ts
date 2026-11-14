import { describe, expect, it, vi } from "vitest";
import { SourceListingController } from "../../../../src/features/local-folders/browsing/file-list/source-listing-controller";
import { SourcePlanController } from "../../../../src/features/local-folders/operations/planning/source-plan-controller";
import { filterFolderEntries } from "../../../../src/features/local-folders/browsing/search/file-name-search";
import type { FolderListing } from "../../../../src/features/local-folders/browsing/source-folder-listing";

// Fixed synthetic source. Only I/O is replaced; actual selection/search/plan lifetimes run.

const entries: FolderListing["entries"] = [
  { name: "회의 자료", kind: "directory" },
  { name: "회의.MD", kind: "file" },
  { name: "기록.txt", kind: "file" },
  { name: "é[1].md", kind: "file" },
];

async function setup() {
  const read = vi.fn(async (path: readonly string[]): Promise<FolderListing> => ({ path, entries, truncated: false }));
  const listing = new SourceListingController(read, vi.fn());

  listing.reset(true);
  await listing.open([]);

  return { listing, read };
}

describe("current folder name search", () => {
  it("SEARCH-001 matches literal NFC/case-folded substrings with trimmed query", () => {
    expect(filterFolderEntries(entries, " .md ").map(entry => entry.name)).toEqual(["회의.MD", "é[1].md"]);
    expect(filterFolderEntries(entries, "e\u0301[").map(entry => entry.name)).toEqual(["é[1].md"]);
    expect(filterFolderEntries(entries, "회의").map(entry => entry.kind)).toEqual(["directory", "file"]);
    expect(filterFolderEntries(entries, "  ")).toBe(entries);
    expect(filterFolderEntries(entries, ".*")).toEqual([]);
    expect(entries[1].name).toBe("회의.MD");
  });
  it("SEARCH-003 changes filter without I/O and cannot find items outside the read result", async () => {
    const { listing, read } = await setup();

    listing.setQuery("없는 이름");
    expect(filterFolderEntries(listing.getSnapshot().result!.entries, listing.getSnapshot().query)).toEqual([]);
    expect(read).toHaveBeenCalledTimes(1);
    expect(listing.getSnapshot().result!.entries).toBe(entries);
  });
  it("SEARCH-004 select-all adds only matching files while preserving hidden selections", async () => {
    const { listing } = await setup();

    listing.toggleSelection("기록.txt");
    listing.setQuery("회의");
    listing.selectAll();
    listing.selectAll();
    expect(listing.getSnapshot().selectedNames).toEqual(["기록.txt", "회의.MD"]);
    listing.clearVisibleSelection();
    expect(listing.getSnapshot().selectedNames).toEqual(["기록.txt"]);
    listing.clearSelection();
    expect(listing.getSnapshot().selectedNames).toEqual([]);
  });
  it("SEARCH-004 hidden files cannot be toggled through stale UI callbacks", async () => {
    const { listing } = await setup();

    listing.setQuery("회의");
    listing.toggleSelection("기록.txt");
    expect(listing.getSnapshot().selectedNames).toEqual([]);
    listing.toggleSelection("회의 자료");
    expect(listing.getSnapshot().selectedNames).toEqual(["회의 자료"]);
  });
  it("SEARCH-004 zero matches do not clear or silently add selections", async () => {
    const { listing } = await setup();

    listing.selectAll();
    listing.setQuery("absent");
    listing.selectAll();
    listing.clearVisibleSelection();
    expect(listing.getSnapshot().selectedNames).toHaveLength(3);
    listing.setQuery("");
    expect(listing.getSnapshot().selectedNames).toHaveLength(3);
  });
  it("SEARCH-002 preserves query through route readers, refresh and permission recovery", async () => {
    const { listing } = await setup();

    listing.setQuery("회의");

    const leave = listing.activate();

    leave();
    listing.activate();
    await listing.refresh();
    listing.permissionLost();
    listing.resume(true, true);
    await vi.waitFor(() => expect(listing.getSnapshot().phase).toBe("ready"));
    expect(listing.getSnapshot().query).toBe("회의");
  });
  it("SEARCH-002 resets on attempted folder change, even a failed navigation", async () => {
    const { listing, read } = await setup();

    listing.setQuery("회의");
    read.mockRejectedValueOnce(new Error("missing"));
    await listing.open(["missing"]);
    expect(listing.getSnapshot().query).toBe("");
  });
  it("SEARCH-002 connection/owner reset clears query and selection", async () => {
    const { listing } = await setup();

    listing.setQuery("회의");
    listing.selectAll();
    listing.reset(false);
    expect(listing.getSnapshot()).toMatchObject({ query: "", selectedNames: [] });
  });
  it("SEARCH-003 stale result may be filtered but cannot select or create a plan", async () => {
    const { listing, read } = await setup();

    listing.toggleSelection("기록.txt");

    const plan = new SourcePlanController(listing, read, vi.fn());

    read.mockRejectedValueOnce(new Error("read"));
    await listing.refresh();
    listing.setQuery("회의");
    listing.selectAll();
    plan.open();
    expect(listing.getSnapshot()).toMatchObject({ query: "회의", stale: true, selectedNames: ["기록.txt"] });
    expect(plan.getSnapshot().open).toBe(false);
  });
  it("SEARCH-002 ignores input callbacks during navigation and preserves refreshed current query", async () => {
    const { listing, read } = await setup();

    listing.setQuery("회의");

    let finish!: (value: FolderListing) => void;

    read.mockImplementationOnce(() => new Promise(resolve => {
      finish = resolve;
    }));

    const pending = listing.refresh();

    listing.setQuery("기록");
    finish({ path: [], entries, truncated: false });
    await pending;
    expect(listing.getSnapshot().query).toBe("회의");
  });
  it("SEARCH-006 plan includes hidden selections and query changes discard old plan", async () => {
    const { listing, read } = await setup();

    listing.toggleSelection("기록.txt");
    listing.setQuery("회의");
    listing.selectAll();

    const plan = new SourcePlanController(listing, read, vi.fn());

    plan.open();
    expect(plan.getSnapshot().selectedNames).toEqual(["기록.txt", "회의.MD"]);
    listing.setQuery("기록");
    expect(plan.getSnapshot()).toMatchObject({ open: false, result: null });
  });
});
