import { describe, expect, it } from "vitest";
import { backupFilesystem } from "../fixtures/backup-filesystem";
import { readSourceFolderListing } from "../../../src/features/local-folders/services/source-folder-listing";
import { openCopyDirectory } from "../../../src/features/local-folders/services/copy-journal-storage";
import { readSourceFilePreview } from "../../../src/features/local-folders/services/source-file-preview";
import { createEntry } from "../../../src/features/local-folders/services/create-entry";

describe("direct-child vault is a protected management directory", () => {
  it("excludes a marked child from source listing and blocks direct paths for list/copy/preview/create", async () => {
    const f = backupFilesystem();
    await f.root.getDirectoryHandle("보관함", { create: true });
    f.bytes.set("source/보관함/.moa-vault.json", new File(["{}"], ".moa-vault.json"));
    f.bytes.set("source/보관함/private.md", new File(["private"], "private.md"));
    f.creates.length = 0;
    const listing = await readSourceFolderListing(f.root, [], () => {});
    expect(listing.entries.some(entry => entry.name === "보관함")).toBe(false);
    await expect(readSourceFolderListing(f.root, ["보관함"], () => {})).rejects.toThrow("source-vault-protected");
    await expect(openCopyDirectory(f.root, ["보관함"], () => {})).rejects.toThrow("source-vault-protected");
    await expect(readSourceFilePreview(f.root, ["보관함", "private.md"], () => {})).rejects.toThrow("source-vault-protected");
    await expect(createEntry(f.root, ["보관함"], "new", () => {}, { put: async () => {}, assertWritable: async () => {} })).rejects.toThrow("source-vault-protected");
    expect(f.creates).toEqual([]);
    expect(f.writes).toEqual([]);
  });
});
