import { BACKUP_LIMITS, backupPlanInput, type BackupInspection } from "../lib/recovery-backup";
import { comparableName } from "../lib/file-change-plan";
import type { ConnectionOwner, FolderHandle } from "../types";
import { createCopyHasher } from "./copy-hash";
import { openCopyDirectory } from "./copy-journal-storage";
import { readSourceFolderListing } from "./source-folder-listing";
import { readVaultIdentity } from "./recovery-vault";
import { assertVaultLocation } from "./recovery-vault-location";

export type BackupHash = (file: File) => Promise<string>;

export type BackupEntryIdentity = Readonly<{
  source: FileSystemDirectoryHandle;
  destination: FileSystemDirectoryHandle;
  sourceHandles: readonly FileSystemFileHandle[];
  targetHandles: readonly FileSystemFileHandle[];
}>;

/** 백업 검사/실행이 공유하는 읽기 전용 입력 고정. bytes는 실행 작업 범위에서만 유지한다. */

export async function openBackupInputs(
  root: FolderHandle,
  vault: FolderHandle,
  plan: unknown,
  owner: ConnectionOwner,
  check: () => void,
  hash: BackupHash) {
  const input = backupPlanInput(plan);

  await assertVaultLocation(vault, [root], check);

  const identity = await readVaultIdentity(vault, owner, check);

  check();

  if (identity.status !== "ready") throw Error("backup-vault-invalid");

  const source = await openCopyDirectory(root, input.sourcePath, check);
  const destination = await openCopyDirectory(root, input.destinationPath, check);
  const sameParent = await source.isSameEntry(destination);

  check();

  if (sameParent) throw Error("backup-conflict");

  for (const folderPath of [input.sourcePath, input.destinationPath]) {
    const listing = await readSourceFolderListing(root, folderPath, check);

    check();

    if (listing.truncated) throw Error("backup-incomplete");

    for (const row of input.rows) {
      const name = row.from.at(-1)!;
      const matches = listing.entries.filter(entry => comparableName(entry.name) === comparableName(name));

      if (matches.length !== 1 || matches[0].name !== name || matches[0].kind !== "file") throw Error("backup-conflict");
    }
  }

  let totalBytes = 0;
  const files: {
    row: typeof input.rows[number];
    sourceHandle: FileSystemFileHandle;
    targetHandle: FileSystemFileHandle;
    sourceFile: File;
    targetFile: File
  }[] = [];
  // Reject all metadata limits before hashing or capturing an early file's bytes.

  for (const row of input.rows) {
    const sourceHandle = await source.getFileHandle(row.from.at(-1)!, { create: false });

    check();

    const targetHandle = await destination.getFileHandle(row.to.at(-1)!, { create: false });

    check();

    const sourceFile = await sourceHandle.getFile();

    check();

    const targetFile = await targetHandle.getFile();

    check();

    for (const file of [sourceFile, targetFile]) {
      totalBytes += file.size;

      if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > BACKUP_LIMITS.fileBytes
        || totalBytes > BACKUP_LIMITS.totalBytes) {
        throw Error("backup-limit");
      }
    }

    const sameFile = await sourceHandle.isSameEntry(targetHandle);

    check();

    if (sameFile) throw Error("backup-conflict");

    files.push({ row, sourceHandle, targetHandle, sourceFile, targetFile });
  }

  const parents = async () => {
    check();

    const sourceNow = await openCopyDirectory(root, input.sourcePath, check);
    const targetNow = await openCopyDirectory(root, input.destinationPath, check);
    const sameSource = await source.isSameEntry(sourceNow);

    check();

    const sameTarget = await destination.isSameEntry(targetNow);

    check();

    if (!sameSource || !sameTarget) throw Error("backup-input-changed");

    await assertVaultLocation(vault, [root], check);

    const latest = await readVaultIdentity(vault, owner, check);

    check();

    if (JSON.stringify(latest) !== JSON.stringify(identity)) throw Error("backup-vault-changed");
  };

  const report: BackupInspection = { vaultId: identity.identity.vaultId, files: [], totalBytes };
  const rows: BackupInspection["files"][number][] = [];
  const payloads: File[] = [];

  for (const file of files) {
    const bytes = await file.targetFile.arrayBuffer();

    check();

    if (bytes.byteLength !== file.targetFile.size) throw Error("backup-input-changed");

    const fixed = new File([bytes], file.targetFile.name, { lastModified: file.targetFile.lastModified });
    const sourceHash = await hash(file.sourceFile);

    check();

    const targetHash = await hash(fixed);

    check();

    if (![sourceHash, targetHash].every(value => /^[a-f0-9]{64}$/u.test(value))) throw Error("backup-hash-invalid");

    rows.push({
      from: [...file.row.from],
      to: [...file.row.to],
      source: { size: file.sourceFile.size, lastModified: file.sourceFile.lastModified, sha256: sourceHash },
      target: { size: fixed.size, lastModified: fixed.lastModified, sha256: targetHash }
    });
    payloads.push(fixed);
  }

  const verifyItem = async (index: number) => {
    await parents();

    for (const [directory, original, before, expected] of [
      [source, files[index].sourceHandle, files[index].sourceFile, rows[index].source],
      [destination, files[index].targetHandle, files[index].targetFile, rows[index].target],
    ] as const) {
      const current = await directory.getFileHandle(original.name, { create: false });

      check();

      const same = await original.isSameEntry(current);

      check();

      const latest = await current.getFile();

      check();

      if (!same || latest.size !== before.size || latest.lastModified !== before.lastModified) throw Error("backup-input-changed");

      const sha256 = await hash(latest);

      check();

      if (sha256 !== expected.sha256) throw Error("backup-input-changed");
    }
  };

  for (let index = 0; index < files.length; index++) await verifyItem(index);

  return {
    report: { ...report, files: rows },
    payloads,
    source,
    destination,
    parents,
    verifyItem,
    sourceFiles: files.map(file => file.sourceFile),
    sourceHandles: files.map(file => file.sourceHandle),
    targetHandles: files.map(file => file.targetHandle)
  };
}

/** 검사 자체는 권한 요청/생성/쓰기를 하지 않으며 결과는 session이 별도로 보관한다. */

export async function inspectRecoveryBackup(
  root: FolderHandle,
  vault: FolderHandle,
  plan: unknown,
  owner: ConnectionOwner,
  assertCurrent: () => void,
  signal: AbortSignal,
  hashOverride?: BackupHash): Promise<BackupInspection> {
  const fixedPlan = structuredClone(plan);
  const fixedOwner = { ...owner };
  const check = () => {
    assertCurrent();

    if (signal.aborted) throw new DOMException("Backup cancelled", "AbortError");
  };

  check();

  const hasher = hashOverride ? null : createCopyHasher(signal);

  try {
    const input = await openBackupInputs(root, vault, fixedPlan, fixedOwner, check, hashOverride ?? hasher!.hash);

    check();

    return structuredClone(input.report);
  } finally {
    hasher?.dispose();
  }
}
