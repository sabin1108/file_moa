import { expect, it, vi } from "vitest";
import { readOrganizationFolders } from "../../../src/features/local-folders/organization/organization-reference";
import type { FolderHandle } from "../../../src/features/local-folders/types";

const listing = vi.hoisted(() => vi.fn());

vi.mock("../../../src/features/local-folders/browsing/source-folder-listing", () => ({
  readSourceFolderListing: listing
}));

it("reads only bounded directory metadata and reports incomplete traversal", async () => {
  listing.mockImplementation(async (_root, path) => ({
    path,
    truncated: false,
    entries:
      path.length < 2
        ? [
          { kind: "directory", name: "월별" },
          { kind: "file", name: "개인.txt" }
        ]
        : []
  }));

  const check = vi.fn();
  const tree = await readOrganizationFolders(
    {} as FolderHandle,
    ["보고서"],
    check,
    new AbortController().signal
  );

  expect(tree).toMatchObject({
    root: ["보고서"],
    directories: [["보고서"], ["보고서", "월별"]],
    complete: true
  });
  expect(JSON.stringify(tree)).not.toContain("개인.txt");
  listing.mockResolvedValue({ path: [], truncated: true, entries: [] });
  expect(
    (await readOrganizationFolders({} as FolderHandle, [], check, new AbortController().signal))
      .complete
  ).toBe(false);

  const abort = new AbortController();

  abort.abort();
  await expect(
    readOrganizationFolders({} as FolderHandle, [], check, abort.signal)
  ).rejects.toMatchObject({ name: "AbortError" });
});
