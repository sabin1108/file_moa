import { parseBackupManifest, type BackupInspection, type BackupPrepared } from "../lib/recovery-backup";
import type { BackupExecution } from "./recovery-backup";
import { BackupDirectory } from "./recovery-backup-storage";
import { openBackupInputs, type BackupHash, type BackupEntryIdentity } from "./recovery-backup-input";
import type { ConnectionOwner, FolderHandle } from "../types";

/** 백업 완료 DTO와 실제 두 저장소/보관 bytes/현재 입력을 함께 검사한다. */

export async function openOverwriteInputs(
  root: FolderHandle,
  vault: FolderHandle,
  plan: unknown,
  approved: BackupInspection,
  backup: BackupExecution,
  owner: ConnectionOwner,
  check: () => void,
  hash: BackupHash,
  identity?: BackupEntryIdentity) {
  if (backup.phase !== "completed" || !backup.journalComplete || backup.issue !== null
    || backup.items.length !== approved.files.length
    || backup.items.some(item => item.status !== "verified")) throw Error("overwrite-backup-required");

  const captured = await openBackupInputs(root, vault, plan, owner, check, hash);

  check();

  if (JSON.stringify(captured.report) !== JSON.stringify(approved)) throw Error("overwrite-input-changed");

  if (identity) {
    const pairs: (readonly [FileSystemHandle, FileSystemHandle | undefined])[] = [
      [captured.source, identity.source], [captured.destination, identity.destination],
      ...captured.sourceHandles.map((handle, index) => [handle, identity.sourceHandles[index]] as const),
      ...captured.targetHandles.map((handle, index) => [handle, identity.targetHandles[index]] as const),
    ];

    for (const [current, previous] of pairs) {
      const same = previous && await current.isSameEntry(previous);

      check();

      if (!same) throw Error("overwrite-input-changed");
    }
  }

  const history = await captured.destination.getDirectoryHandle(".moa-history", { create: false });

  check();

  const verifyHistory = async () => {
    await captured.parents();

    const current = await captured.destination.getDirectoryHandle(".moa-history", { create: false });

    check();

    const same = await history.isSameEntry(current);

    check();

    if (!same) throw Error("overwrite-record-changed");
  };
  // Validate the ID before deriving any filesystem segment from caller data.

  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u.test(backup.id)) throw Error("overwrite-backup-required");

  const name = `moa-backup-${backup.id}`;
  const vaultStore = await BackupDirectory.open(vault, name, check, captured.parents);
  const targetStore = await BackupDirectory.open(history, name, check, verifyHistory);
  const raw = await vaultStore.read("prepared.json");

  if (raw.file.size > 1024 * 1024) throw Error("overwrite-backup-invalid");

  const bytes = await raw.file.arrayBuffer();

  check();

  if (bytes.byteLength !== raw.file.size) throw Error("overwrite-backup-invalid");

  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const prepared = parseBackupManifest(JSON.parse(text));

  if (!prepared || prepared.type !== "prepared" || prepared.operationId !== backup.id || prepared.vaultId !== approved.vaultId
    || JSON.stringify(prepared.owner) !== JSON.stringify(owner)
    || JSON.stringify(prepared.items) !== JSON.stringify(approved.files.map((file, i) => ({ itemId: backup.items[i].itemId, recoveryId: backup.items[i].recoveryId, ...file })))) {
    throw Error("overwrite-backup-invalid");
  }

  const expected: BackupPrepared = prepared;
  const base = {
    schemaVersion: expected.schemaVersion,
    operation: expected.operation,
    operationId: expected.operationId,
    vaultId: expected.vaultId,
    owner: expected.owner,
    createdAt: expected.createdAt
  };
  const payloadHandles: FileSystemFileHandle[] = [];
  const verifyBackup = async () => {
    await captured.parents();

    for (const store of [vaultStore, targetStore]) {
      await store.verifyJson("prepared.json", expected);

      for (const item of expected.items) {
        await store.verifyJson(`${item.itemId}-verified.json`, {
          ...base,
          type: "item-verified",
          itemId: item.itemId,
          recoveryId: item.recoveryId,
          size: item.target.size,
          sha256: item.target.sha256
        });
      }

      await store.verifyJson("stopped.json", {
        ...base,
        type: "stopped",
        reason: "completed",
        issue: null,
        items: expected.items.map(item => ({ itemId: item.itemId, status: "verified" }))
      });
    }

    for (const [index, item] of expected.items.entries()) {
      const { handle, file } = await vaultStore.read(`${item.recoveryId}.bin`, payloadHandles[index]);

      if (file.size !== item.target.size || await hash(file) !== item.target.sha256) throw Error("overwrite-backup-changed");

      check();
      payloadHandles[index] = handle;
    }
  };

  await verifyBackup();

  const sourcePayloads: File[] = [];

  for (const [index, file] of captured.sourceFiles.entries()) {
    const bytes = await file.arrayBuffer();

    check();

    const fixed = new File([bytes], file.name, { lastModified: file.lastModified });

    if (fixed.size !== expected.items[index].source.size || await hash(fixed) !== expected.items[index].source.sha256) throw Error("overwrite-input-changed");

    check();
    sourcePayloads.push(fixed);
  }

  return { captured, expected, history, verifyHistory, verifyBackup, sourcePayloads };
}
