import { BACKUP_LIMITS, type BackupManifest } from "../lib/recovery-backup";
import type { RecoveryArchiveSnapshot } from "./recovery-archive";
import { BackupDirectory } from "./recovery-backup-storage";
import type { BackupHash } from "./recovery-backup-input";

/** 원래 목적지와 독립적으로 보관함의 완료 기록/현재 사본만 엄격히 검증한다. */

export async function openRestoreAsset(snapshot: RecoveryArchiveSnapshot, id: string, check: () => void, hash: BackupHash) {
  const proof = snapshot.proofs.get(id);

  if (!proof?.item || !proof.prepared) throw Error("restore-item-required");

  const prepared = structuredClone(proof.prepared);
  const item = structuredClone(proof.item);
  const current = async () => {
    check();
    await snapshot.current();
    check();

    const latest = await snapshot.vault.getDirectoryHandle(proof.operationName, { create: false });

    check();

    const same = await proof.directory.isSameEntry(latest);

    check();

    if (!same) throw Error("restore-source-changed");
  };

  await current();

  const store = await BackupDirectory.open(snapshot.vault, proof.operationName, check, current);
  const base = {
    schemaVersion: prepared.schemaVersion,
    operation: prepared.operation,
    operationId: prepared.operationId,
    vaultId: prepared.vaultId,
    owner: prepared.owner,
    createdAt: prepared.createdAt
  };
  const expected: {
    name: string;
    value: BackupManifest;
    handle?: FileSystemFileHandle
  }[] = [
      { name: "prepared.json", value: prepared, handle: proof.preparedHandle },
      {
        name: `${item.itemId}-verified.json`,
        value: {
          ...base,
          type: "item-verified",
          itemId: item.itemId,
          recoveryId: item.recoveryId,
          size: item.target.size,
          sha256: item.target.sha256
        }
      },
      {
        name: "stopped.json",
        value: {
          ...base,
          type: "stopped",
          reason: "completed",
          issue: null,
          items: prepared.items.map(item => ({ itemId: item.itemId, status: "verified" }))
        }
      },
    ];
  const records = async () => {
    for (const record of expected) {
      const read = await store.read(record.name, record.handle);

      check();
      record.handle = read.handle;
      await store.verifyJson(record.name, record.value, record.handle);
      check();
    }
  };

  await records();

  const payloadName = `${item.recoveryId}.bin`;
  const first = await store.read(payloadName);

  check();

  const verify = async () => {
    await records();

    const latest = await store.read(payloadName, first.handle);

    check();

    if (latest.file.size !== item.target.size || latest.file.size > BACKUP_LIMITS.fileBytes
      || latest.file.lastModified !== first.file.lastModified) throw Error("restore-source-changed");

    const digest = await hash(latest.file);

    check();

    if (digest !== item.target.sha256) throw Error("restore-source-changed");

    await current();

    return latest.file;
  };
  const file = await verify();

  return { prepared, item, handle: first.handle, file, verify, current };
}
