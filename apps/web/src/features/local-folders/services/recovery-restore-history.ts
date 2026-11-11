import { parseRestoreRecord, restoreDestinationPath, type RestoreRecord } from "../lib/recovery-restore";
import { BACKUP_LIMITS } from "../lib/recovery-backup";
import { recoveryIdSchema } from "../lib/recovery-vault";
import { summarizeRestoreRecords, type RestoreHistory } from "../lib/recovery-restore-history";
import type { ConnectionOwner, FolderHandle } from "../types";
import { openSourceDirectory } from "./source-directory";

const limits = {
  entries: 1000,
  operations: 100,
  fileBytes: BACKUP_LIMITS.manifestBytes,
  totalBytes: 2 * 1024 * 1024
};

function propagateReadFailure(error: unknown, check: () => void) {
  check();

  if (error instanceof Error && ["NotAllowedError", "SecurityError", "AbortError"].includes(error.name)) {
    throw error;
  }
}

/** 목적지에 남은 복원 JSON만 읽는다. 보관함/사용자 본문/쓰기 API는 사용하지 않는다. */

export async function readRestoreHistory(root: FolderHandle, path: readonly string[], owner: ConnectionOwner,
  check: () => void): Promise<RestoreHistory> {
  const parentPath = restoreDestinationPath(path);
  const permission = async () => {
    check();

    const state = await root.queryPermission({ mode: "read" });

    check();

    if (state !== "granted") throw new DOMException("History read permission required", "NotAllowedError");
  };

  await permission();

  const parent = await openSourceDirectory(root, parentPath, check);
  let history: FileSystemDirectoryHandle;

  try {
    history = await parent.getDirectoryHandle(".moa-history", { create: false });
    check();
  } catch (error) {
    propagateReadFailure(error, check);

    if (!(error instanceof Error && error.name === "NotFoundError")) throw error;

    await permission();

    return { groups: [], missing: true, incomplete: false, excluded: 0 };
  }

  let bytes = 0;
  let entries = 0;
  let incomplete = false;
  let excluded = 0;
  const groups: ReturnType<typeof summarizeRestoreRecords>[] = [];
  const belongsToOwner = (record: RestoreRecord) => record.owner.userId === owner.userId
    && record.owner.workspaceId === owner.workspaceId;
  const currentHistory = async () => {
    const latestParent = await openSourceDirectory(root, parentPath, check);
    const sameParent = await parent.isSameEntry(latestParent);

    check();

    const latest = await latestParent.getDirectoryHandle(".moa-history", { create: false });
    const sameHistory = await history.isSameEntry(latest);

    check();

    if (!sameParent || !sameHistory) throw Error("restore-history-changed");
  };

  for await (const entry of history.values()) {
    check();

    if (++entries > limits.entries || bytes >= limits.totalBytes) {
      incomplete = true;

      break;
    }

    if (!entry.name.startsWith("moa-restore-")) continue;

    const id = entry.name.slice("moa-restore-".length);

    if (!recoveryIdSchema.safeParse(id).success) {
      incomplete = true;

      continue;
    }

    if (groups.length + excluded >= limits.operations) {
      incomplete = true;

      break;
    }

    const records: RestoreRecord[] = [];
    let damaged = entry.kind !== "directory";
    const readRecord = async (directory: FileSystemDirectoryHandle, name: string, type: RestoreRecord["type"]) => {
      try {
        const handle = await directory.getFileHandle(name, { create: false });
        const file = await handle.getFile();

        check();

        if (file.size > limits.fileBytes || bytes + file.size * 2 > limits.totalBytes) {
          damaged = true;
          incomplete = true;

          return null;
        }

        bytes += file.size * 2;

        const buffer = await file.arrayBuffer();

        check();

        const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
        const record = parseRestoreRecord(value);
        const reopened = await directory.getFileHandle(name, { create: false });
        const same = await handle.isSameEntry(reopened);
        const latest = await reopened.getFile();

        check();

        if (!same || buffer.byteLength !== file.size || latest.size !== file.size || latest.lastModified !== file.lastModified) {
          throw Error("restore-history-changed");
        }

        const currentBytes = await latest.arrayBuffer();

        check();

        const current = new Uint8Array(currentBytes);

        if (current.length !== buffer.byteLength || new Uint8Array(buffer).some((value, index) => value !== current[index])) {
          throw Error("restore-history-changed");
        }

        if (!record || record.type !== type || record.operationId !== id) throw Error("restore-history-invalid");

        records.push(record);

        return record;
      } catch (error) {
        propagateReadFailure(error, check);
        damaged = true;

        return null;
      }
    };

    if (entry.kind === "directory") {
      const directory = entry as FileSystemDirectoryHandle;
      const prepared = await readRecord(directory, "prepared.json", "prepared");

      if (prepared && !belongsToOwner(prepared)) {
        excluded++;

        continue;
      }

      const stopped = await readRecord(directory, "stopped.json", "stopped");

      if (!prepared && stopped && !belongsToOwner(stopped)) {
        excluded++;

        continue;
      }

      const anchor = prepared ?? stopped;

      if (anchor) {
        // 미실행으로 중단된 작업은 시작/검증 기록이 없을 수 있다.
        for (const type of ["target-started", "target-verified"] as const) {
          const name = `${anchor.itemId}-${type}.json`;

          try {
            await directory.getFileHandle(name, { create: false });
            check();
            await readRecord(directory, name, type);
          } catch (error) {
            propagateReadFailure(error, check);

            if (!(error instanceof Error && error.name === "NotFoundError")) damaged = true;
          }
        }
      }

      const current = await history.getDirectoryHandle(entry.name, { create: false });
      const same = await directory.isSameEntry(current);

      check();

      if (!same) damaged = true;
    }

    const group = summarizeRestoreRecords(id, records, parentPath, damaged);

    groups.push(group);
  }

  await currentHistory();
  await permission();

  return {
    groups: groups.map(group => incomplete ? { ...group, status: "uncertain" as const, fileStatus: "uncertain" as const } : group)
      .sort((left, right) => (right.time ?? "").localeCompare(left.time ?? "") || left.id.localeCompare(right.id)),
    missing: false,
    incomplete,
    excluded,
  };
}
