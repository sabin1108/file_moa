import { filterFolderEntries } from "../lib/file-name-search";
import { copyFolderPath } from "../lib/folder-path";
import type { FolderListing, FolderListEntry } from "./source-folder-listing";

export type FolderSearchEntry = FolderListEntry & Readonly<{
  path: readonly string[];
}>;

export type FolderSearchResult = Readonly<{
  entries: readonly FolderSearchEntry[];
  incomplete: boolean;
  scanned: number;
}>;
/** 이름만 너비 우선으로 검색한다. 본문/쓰기/권한 요청을 하지 않고 큰 트리는 일부임을 알린다. */
export async function searchFolderTree(
  base: readonly string[],
  query: string,
  read: (path: readonly string[]) => Promise<FolderListing>,
  check: () => void,
): Promise<FolderSearchResult> {
  const root = copyFolderPath(base);
  const entries: FolderSearchEntry[] = [];
  const queue = [root];
  let scanned = 0;
  let incomplete = false;
  const started = Date.now();

  if (!query.trim()) {
    return {
      entries, incomplete, scanned
    };
  }

  for (let index = 0; index < queue.length; index++) {
    check();

    if (index >= 1000 || scanned >= 20000 || Date.now() - started > 15000) {
      incomplete = true;
      break;
    }

    const path = queue[index];
    let listing: FolderListing;

    try {
      listing = await read(path);
      check();
    } catch (error) {
      check();

      if (!(error instanceof DOMException) || !["NotFoundError", "NotReadableError", "TypeMismatchError"].includes(error.name)) {
        throw error;
      }

      incomplete = true;
      continue;
    }

    incomplete ||= listing.truncated;

    for (const entry of listing.entries) {
      check();

      if (scanned >= 20000 || entries.length >= 1000) {
        return {
          entries, incomplete: true, scanned
        };
      }

      scanned++;

      if (entry.name === ".moa-history") {
        continue;
      }

      const child = [...path, entry.name];

      if (filterFolderEntries([entry], query).length) {
        entries.push({ ...entry, path: child });
      }

      if (entry.kind === "directory") {
        if (child.length - root.length <= 64 && queue.length < 1000) {
          queue.push(child);
        } else {
          incomplete = true;
        }
      }
    }
  }

  return {
    entries, incomplete, scanned
  };
}
