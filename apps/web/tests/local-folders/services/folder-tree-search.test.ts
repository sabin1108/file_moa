import { describe, expect, it, vi } from "vitest";
import { searchFolderTree } from "../../../src/features/local-folders/services/folder-tree-search";
import type { FolderListing } from "../../../src/features/local-folders/services/source-folder-listing";

const tree: Record<string, FolderListing["entries"]> = {
  "": [{ name: "child", kind: "directory" }, { name: "note.txt", kind: "file" }, { name: ".moa-history", kind: "directory" }],
  child: [{ name: "deep", kind: "directory" }, { name: "note.txt", kind: "file" }],
  "child/deep": [{ name: "NOTE.md", kind: "file" }],
};
const reader = () => vi.fn(async (path: readonly string[]) => ({ path, entries: tree[path.join("/")] ?? [], truncated: false }));

describe("recursive filename search", () => {
  it("finds duplicate names by full path across descendants without reading history", async () => {
    const read = reader();
    const result = await searchFolderTree([], "note", read, () => { });

    expect(result.entries.map(e => e.path)).toEqual([["note.txt"], ["child", "note.txt"], ["child", "deep", "NOTE.md"]]);
    expect(read.mock.calls.map(c => c[0])).not.toContainEqual([".moa-history"]);
    expect(result.incomplete).toBe(false);
  });
  it("stays inside the requested base and does not scan empty queries", async () => {
    const read = reader();

    expect((await searchFolderTree(["child"], "note", read, () => { })).entries).toHaveLength(2);
    read.mockClear();
    expect((await searchFolderTree([], " ", read, () => { })).entries).toEqual([]);
    expect(read).not.toHaveBeenCalled();
  });
  it("marks read failures and truncated directory listings partial", async () => {
    const read = reader();

    read.mockRejectedValueOnce(new DOMException("missing", "NotFoundError"));
    expect((await searchFolderTree([], "note", read, () => { })).incomplete).toBe(true);
    read.mockResolvedValueOnce({ path: [], entries: tree[""], truncated: true });
    expect((await searchFolderTree([], "note", read, () => { })).incomplete).toBe(true);
  });
  it("propagates cancellation and permission loss instead of publishing partial success", async () => {
    for (const name of ["AbortError", "NotAllowedError"]) {
      const read = reader();

      read.mockRejectedValueOnce(new DOMException("stop", name));
      await expect(searchFolderTree([], "note", read, () => { })).rejects.toMatchObject({ name });
    }
  });
  it("caps results and traversal with explicit partial status", async () => {
    const read = vi.fn(async (path: readonly string[]) => ({
      path,
      entries: Array.from({ length: 1000 }, (_, i) => ({ name: `note${i}`, kind: "file" as const })),
      truncated: true
    }));
    const result = await searchFolderTree([], "note", read, () => { });

    expect(result.entries).toHaveLength(1000);
    expect(result.incomplete).toBe(true);
  });
});
