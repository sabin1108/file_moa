import { afterEach, describe, expect, it, vi } from "vitest";
import { FolderSearchController } from "../../../src/features/local-folders/store/folder-search-controller";
import { SourceListingController } from "../../../src/features/local-folders/store/source-listing-controller";
import type { FolderSearchResult } from "../../../src/features/local-folders/services/folder-tree-search";

async function setup() {
  vi.useFakeTimers();

  const listing = new SourceListingController(async path => ({ path, entries: [], truncated: false }), vi.fn());
  const read = vi.fn<(path: readonly string[], query: string, signal: AbortSignal) => Promise<FolderSearchResult>>(async () => ({ entries: [], scanned: 0, incomplete: false }));
  const lost = vi.fn();
  const search = new FolderSearchController(listing, read, lost);

  listing.reset(true);
  await listing.open([]);
  listing.setSearchOpen(true);

  return { listing, read, lost, search };
}

afterEach(() => vi.useRealTimers());
describe("search request lifetime", () => {
  it("debounces edits and never starts a cleared query", async () => {
    const s = await setup();

    s.listing.setQuery("a");
    s.listing.setQuery("ab");
    await vi.advanceTimersByTimeAsync(180);
    expect(s.read).toHaveBeenCalledTimes(1);
    expect(s.read.mock.calls[0][1]).toBe("ab");
    s.listing.setQuery("late");
    s.listing.setSearchOpen(false);
    await vi.advanceTimersByTimeAsync(180);
    expect(s.read).toHaveBeenCalledTimes(1);
    expect(s.search.getSnapshot().phase).toBe("idle");
  });
  it.each(["query", "folder", "reset", "cancel"])("discards a late result after %s changes", async change => {
    const s = await setup();
    let finish!: (value: FolderSearchResult) => void;

    s.read.mockImplementationOnce(() => new Promise(resolve => {
      finish = resolve;
    }));
    s.listing.setQuery("a");
    await vi.advanceTimersByTimeAsync(180);

    const signal = s.read.mock.calls[0][2];

    if (change === "query") s.listing.setQuery("b");
    else if (change === "folder") await s.listing.open(["child"]);
    else if (change === "reset") s.listing.reset(true);
    else s.search.cancel();

    expect(signal.aborted).toBe(true);
    finish({ entries: [{ name: "late", kind: "file", path: ["late"] }], scanned: 1, incomplete: false });
    await Promise.resolve();
    await Promise.resolve();
    expect(s.search.getSnapshot().result).toBeNull();
  });
  it("retries cancellation and propagates permission loss", async () => {
    const s = await setup();

    s.listing.setQuery("a");
    s.search.cancel();
    s.search.retry();
    await vi.advanceTimersByTimeAsync(180);
    expect(s.search.getSnapshot().phase).toBe("ready");
    s.read.mockRejectedValueOnce(new DOMException("lost", "NotAllowedError"));
    s.search.retry();
    await vi.advanceTimersByTimeAsync(180);
    expect(s.search.getSnapshot().phase).toBe("error");
    expect(s.lost).toHaveBeenCalledOnce();
  });
});
