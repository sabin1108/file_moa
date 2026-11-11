import type { ReferenceSnapshot } from "../lib/source-snapshot";
import { copyFolderPath } from "../lib/folder-path";
import type { FolderHandle } from "../types";
import { readSourceFolderListing } from "./source-folder-listing";

/** Folder names only. No document content, permission prompt, network or writes. */

export async function readOrganizationFolders(
  root: FolderHandle,
  path: readonly string[],
  assertCurrent: () => void,
  signal: AbortSignal,
  depth = 3
): Promise<ReferenceSnapshot> {
  const start = copyFolderPath(path);
  const queue = [start];
  const directories: string[][] = [];
  let complete = true;
  let bytes = 0;
  const started = Date.now();
  const check = () => {
    assertCurrent();
    signal.throwIfAborted();
  };

  for (let index = 0; index < queue.length; index++) {
    check();

    if (directories.length >= 80 || Date.now() - started > 5000) {
      complete = false;

      break;
    }

    const current = queue[index];

    bytes += new TextEncoder().encode(JSON.stringify(current)).byteLength;

    if (bytes > 16384) {
      complete = false;

      break;
    }

    const listing = await readSourceFolderListing(root, current, check);

    check();
    directories.push(current);

    if (listing.truncated) complete = false;

    for (const entry of listing.entries.filter(entry => entry.kind === "directory")) {
      if (current.length - start.length >= depth || queue.length >= 200) {
        complete = false;

        continue;
      }

      if (entry.name.toLowerCase() !== ".moa-history") queue.push([...current, entry.name]);
    }
  }

  check();

  return { root: start, directories, complete };
}
