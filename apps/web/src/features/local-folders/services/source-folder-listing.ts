/**
 * 연결된 폴더의 직계 파일·하위 폴더 이름을 읽는 서비스다. connection-session에서 호출한다.
 * 상대 경로/읽기 권한을 검증하고 표시 상한을 적용한다. 재귀 탐색이나 파일 본문 읽기는 하지 않는다.
 */
import type { FolderHandle, FolderListEntry } from "../types";
import { copyFolderPath } from "../lib/folder-path";
import { openSourceDirectory, isRecoveryDirectory } from "./source-directory";

export type { FolderListEntry } from "../types";

// A browsing bound, separate from the domain's document processing limits.

export const FOLDER_LISTING_LIMIT = 1000;

export type FolderListing = Readonly<{
  path: readonly string[];
  entries: readonly FolderListEntry[];
  truncated: boolean;
}>;

function compareEntries(left: FolderListEntry, right: FolderListEntry): number {
  if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;

  if (left.name === right.name) return 0;

  return left.name < right.name ? -1 : 1;
}

/** Internal browser reader. The connection session owns authorization and result lifetime. */

export async function readSourceFolderListing(
  root: FolderHandle,
  path: readonly string[],
  assertCurrent: () => void,
): Promise<FolderListing> {
  const requestedPath = copyFolderPath(path);
  const assertReadPermission = async () => {
    assertCurrent();

    const permission = await root.queryPermission({ mode: "read" });

    assertCurrent();

    if (permission !== "granted") {
      throw new DOMException("Folder read permission required", "NotAllowedError");
    }
  };

  await assertReadPermission();
  assertCurrent();

  const directory = await openSourceDirectory(root, requestedPath, assertCurrent);

  const entries: FolderListEntry[] = [];
  let truncated = false;
  let scanned = 0;

  for await (const handle of directory.values()) {
    assertCurrent();

    if (++scanned > FOLDER_LISTING_LIMIT) {
      truncated = true;

      break;
    }

    if (handle.kind === "directory") {
      const child = await directory.getDirectoryHandle(handle.name, { create: false });

      assertCurrent();

      if (await isRecoveryDirectory(child, assertCurrent)) continue;
    }

    entries.push({ name: handle.name, kind: handle.kind });
  }

  // Recheck even for empty directories and after the iterator's final await.

  await assertReadPermission();
  assertCurrent();
  entries.sort(compareEntries);

  return { path: requestedPath, entries, truncated };
}
