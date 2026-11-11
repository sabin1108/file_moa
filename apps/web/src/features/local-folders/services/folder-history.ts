import type { ConnectionOwner, FolderHandle } from "../types";
import { FOLDER_RECORDS_DIRECTORY } from "../lib/new-entry";
import { groupHistoryRecords, parseHistoryRecord, type HistoryGroup, type HistoryRecord } from "../lib/folder-history";
import { copyFolderPath } from "../lib/folder-path";
import type { CopyHistory } from "./copy-journal-storage";
import type { RestoreHistory } from "../lib/recovery-restore-history";

export type FolderHistory = Readonly<{
  copies?: CopyHistory;
  restores?: RestoreHistory;
  groups: readonly HistoryGroup[];
  missing: boolean;
  incomplete: boolean;
  truncated: boolean;
  invalid: number;
  unsupported: number;
  unreadable: number;
  oversized: number;
  excluded: number;
}>;

const MAX_ENTRIES = 1000;
const MAX_RECORDS = 200;
const MAX_FILE_BYTES = 64 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024;

/** 현재 부모의 기록만 읽는다. 생성 옵션/권한 요청/사용자 파일 읽기는 이 서비스에 없다. */

export async function readFolderHistory(root: FolderHandle, path: readonly string[], owner: ConnectionOwner,
  assertCurrent: () => void): Promise<FolderHistory> {
  const parentPath = copyFolderPath(path);
  const result = {
    missing: false,
    truncated: false,
    invalid: 0,
    unsupported: 0,
    unreadable: 0,
    oversized: 0,
    excluded: 0
  };
  const records: HistoryRecord[] = [];
  const checkPermission = async () => {
    assertCurrent();

    const permission = await root.queryPermission({ mode: "read" });

    assertCurrent();

    if (permission !== "granted") throw new DOMException("History read permission required", "NotAllowedError");
  };

  await checkPermission();

  let parent: FileSystemDirectoryHandle = root;

  for (const part of parentPath) {
    parent = await parent.getDirectoryHandle(part, { create: false });
    assertCurrent();
  }

  let directory: FileSystemDirectoryHandle;

  try {
    directory = await parent.getDirectoryHandle(FOLDER_RECORDS_DIRECTORY, { create: false });
    assertCurrent();
  } catch (error) {
    assertCurrent();

    if (error instanceof DOMException && error.name === "NotFoundError") {
      await checkPermission();

      return { ...result, groups: [], missing: true, incomplete: false };
    }

    if (error instanceof DOMException && error.name === "TypeMismatchError") throw new Error("history-not-directory");

    throw error;
  }

  let entries = 0, files = 0, bytes = 0;

  for await (const handle of directory.values()) {
    assertCurrent();

    if (++entries > MAX_ENTRIES) {
      result.truncated = true;

      break;
    }

    if (handle.kind !== "file" || !/^moa-folder-.+\.json$/.test(handle.name)) continue;

    if (++files > MAX_RECORDS) {
      result.truncated = true;

      break;
    }

    let content: ArrayBuffer;

    try {
      const file = await (handle as FileSystemFileHandle).getFile();

      assertCurrent();

      if (file.size > MAX_FILE_BYTES) {
        result.oversized++;

        continue;
      }

      if (bytes + file.size > MAX_TOTAL_BYTES) {
        result.truncated = true;

        break;
      }

      bytes += file.size;
      content = await file.arrayBuffer();
      assertCurrent();

      if (content.byteLength !== file.size) {
        result.unreadable++;

        continue;
      }
    } catch (error) {
      assertCurrent();

      if (error instanceof DOMException && ["NotAllowedError", "SecurityError", "AbortError"].includes(error.name)) throw error;

      result.unreadable++;

      continue;
    }

    let value: unknown;

    try {
      value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(content));
    }
    catch {
      result.invalid++;

      continue;
    }

    const parsed = parseHistoryRecord(value);

    if ("issue" in parsed) {
      result[parsed.issue]++;

      continue;
    }

    const record = parsed.record;

    if (record.owner.userId !== owner.userId || record.owner.workspaceId !== owner.workspaceId) {
      result.excluded++;

      continue;
    }

    if (record.path.length !== parentPath.length + 1 || !parentPath.every((part, index) => record.path[index] === part)) {
      result.invalid++;

      continue;
    }

    records.push(record);
  }

  await checkPermission();

  const incomplete = result.truncated || result.invalid + result.unsupported + result.unreadable + result.oversized > 0;

  return { ...result, incomplete, groups: groupHistoryRecords(records, incomplete) };
}
