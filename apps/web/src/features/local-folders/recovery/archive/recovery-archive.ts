import { ARCHIVE_LIMITS, type RecoveryArchiveDetail, type RecoveryArchiveList, type RecoveryArchiveRow } from "./recovery-archive-rules";
import { BACKUP_LIMITS, parseBackupManifest, type BackupItem, type BackupPrepared } from "../backup/recovery-backup-rules";
import type { ConnectionOwner, FolderHandle } from "../../types";
import { readVaultIdentity } from "../recovery-vault";
import { assertVaultLocation } from "../recovery-vault-location";
import { readArchiveRecord, type ArchiveReadBudget } from "./recovery-archive-records";
import type { BackupHash } from "../backup/recovery-backup-input";
import { openCopyDirectory } from "../../operations/copying/copy-journal-storage";

type Proof = Readonly<{
  operationName: string;
  directory: FileSystemDirectoryHandle;
  prepared: BackupPrepared | null;
  preparedHandle?: FileSystemFileHandle;
  item: BackupItem | null;
}>;

export type RecoveryArchiveSnapshot = Readonly<{
  view: RecoveryArchiveList;
  proofs: ReadonlyMap<string, Proof>;
  root: FolderHandle;
  vault: FolderHandle;
  check: () => void;
  current: () => Promise<void>;
}>;

function propagate(error: unknown, check: () => void) {
  check();

  if (error instanceof Error
    && (error.name === "AbortError" || error.name === "NotAllowedError" || error.name === "SecurityError"
      || error.message === "stale-connection-operation"
      || error.message === "archive-scan-limit")) throw error;
}

/** 목록은 JSON metadata만 읽는다. payload와 과거 성공의 현재 무결성을 추정하지 않는다. */

export async function readRecoveryArchive(
  root: FolderHandle,
  vault: FolderHandle,
  owner: ConnectionOwner,
  assertCurrent: () => void,
  signal: AbortSignal): Promise<RecoveryArchiveSnapshot> {
  const capturedOwner = { ...owner };
  const check = () => {
    assertCurrent();

    if (signal.aborted) throw new DOMException("Archive cancelled", "AbortError");
  };

  check();
  await assertVaultLocation(vault, [root], check);

  const identity = await readVaultIdentity(vault, capturedOwner, check);

  if (identity.status !== "ready") throw Error("archive-vault-invalid");

  const current = async () => {
    check();
    await assertVaultLocation(vault, [root], check);

    const latest = await readVaultIdentity(vault, capturedOwner, check);

    check();

    if (JSON.stringify(latest) !== JSON.stringify(identity)) throw Error("stale-connection-operation");
  };
  const items: RecoveryArchiveRow[] = [];
  const proofs = new Map<string, Proof>();
  const budget: ArchiveReadBudget = { bytes: 0 };
  let truncated = false;
  let entries = 0;
  let operations = 0;

  for await (const entry of vault.values()) {
    check();

    if (++entries > ARCHIVE_LIMITS.entries) {
      truncated = true;

      break;
    }

    if (entry.kind !== "directory" || !/^moa-backup-[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u.test(entry.name)) continue;

    if (++operations > ARCHIVE_LIMITS.operations || items.length >= ARCHIVE_LIMITS.items) {
      truncated = true;

      break;
    }

    const directory = await vault.getDirectoryHandle(entry.name, { create: false });

    check();

    const same = await directory.isSameEntry(entry);

    check();

    if (!same) throw Error("stale-connection-operation");

    const operationCurrent = async () => {
      check();

      const latest = await vault.getDirectoryHandle(entry.name, { create: false });

      check();

      const sameEntry = await directory.isSameEntry(latest);

      check();

      if (!sameEntry) throw Error("archive-record-changed");
    };

    try {
      const raw = await readArchiveRecord(directory, "prepared.json", check, operationCurrent, budget);
      const prepared = parseBackupManifest(raw.value);

      if (!prepared || prepared.type !== "prepared" || `moa-backup-${prepared.operationId}` !== entry.name
        || prepared.vaultId !== identity.identity.vaultId
        || JSON.stringify(prepared.owner) !== JSON.stringify(capturedOwner)) throw Error("archive-record-invalid");

      let completed = false;

      try {
        const rawStop = await readArchiveRecord(directory, "stopped.json", check, operationCurrent, budget);
        const stopped = parseBackupManifest(rawStop.value);

        completed = !!stopped && stopped.type === "stopped" && stopped.reason === "completed"
          && stopped.operationId === prepared.operationId
          && stopped.vaultId === prepared.vaultId
          && stopped.createdAt === prepared.createdAt
          && JSON.stringify(stopped.owner) === JSON.stringify(prepared.owner)
          && JSON.stringify(stopped.items) === JSON.stringify(prepared.items.map(item => ({ itemId: item.itemId, status: "verified" })));
      } catch (error) {
        propagate(error, check);
      }

      for (const item of prepared.items) {
        if (items.length >= ARCHIVE_LIMITS.items) {
          truncated = true;

          break;
        }

        const id = `${prepared.operationId}/${item.itemId}`;

        items.push({
          id,
          fileName: item.to.at(-1)!,
          originalPath: [...item.to],
          createdAt: prepared.createdAt,
          bytes: item.target.size,
          recorded: completed ? "completed" : "incomplete",
          canInspect: true
        });
        proofs.set(id, { operationName: entry.name, directory, prepared, preparedHandle: raw.handle, item });
      }
    } catch (error) {
      if (error instanceof Error && error.message === "archive-scan-limit") {
        truncated = true;

        break;
      }

      propagate(error, check);

      const id = entry.name;

      items.push({
        id,
        fileName: null,
        originalPath: null,
        createdAt: null,
        bytes: null,
        recorded: "invalid",
        canInspect: false
      });
      proofs.set(id, { operationName: entry.name, directory, prepared: null, item: null });
    }
  }

  await current();
  items.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || a.id.localeCompare(b.id));

  return { view: { items, truncated }, proofs, root, vault, check, current };
}

/** 선택한 내부 snapshot만 검사한다. 파일 본문은 UI로 반환하지 않는다. */

export async function inspectRecoveryArchiveItem(snapshot: RecoveryArchiveSnapshot, id: string, hash: BackupHash,
  signal: AbortSignal): Promise<RecoveryArchiveDetail> {
  const proof = snapshot.proofs.get(id);

  if (!proof?.prepared || !proof.item) throw Error("archive-item-required");

  const prepared = proof.prepared;
  const item = proof.item;
  const check = () => {
    snapshot.check();

    if (signal.aborted) throw new DOMException("Archive cancelled", "AbortError");
  };
  let payload: RecoveryArchiveDetail["payload"] = "not-checked";
  let journal: RecoveryArchiveDetail["journal"] = "incomplete";
  let status: RecoveryArchiveDetail["status"] = "uncertain";
  let issue: RecoveryArchiveDetail["issue"] = null;
  const budget = { bytes: 0 };
  let finalAudit: (() => Promise<void>) | null = null;
  const current = async () => {
    await snapshot.current();
    check();

    const latest = await snapshot.vault.getDirectoryHandle(proof.operationName, { create: false });

    check();

    const same = await proof.directory.isSameEntry(latest);

    check();

    if (!same) throw Error("archive-record-changed");
  };

  try {
    await current();

    const fresh = await readArchiveRecord(proof.directory, "prepared.json", check, current, budget, proof.preparedHandle);

    if (JSON.stringify(parseBackupManifest(fresh.value)) !== JSON.stringify(prepared)) throw Error("archive-record-changed");

    let handle: FileSystemFileHandle;

    try {
      handle = await proof.directory.getFileHandle(`${item.recoveryId}.bin`, { create: false });
      check();
    } catch (error) {
      propagate(error, check);

      if (error instanceof Error && (error.name === "NotFoundError" || error.name === "TypeMismatchError")) {
        return {
          status: "damaged",
          payload: "missing",
          journal,
          issue: "missing",
          checkedAt: new Date().toISOString()
        };
      }

      throw error;
    }

    let initial: File | undefined;
    const verifyPayload = async (): Promise<"verified" | "damaged"> => {
      await current();

      const now = await proof.directory.getFileHandle(`${item.recoveryId}.bin`, { create: false });

      check();

      const same = await handle.isSameEntry(now);

      check();

      const file = await now.getFile();

      check();

      if (!same || (initial && (file.size !== initial.size || file.lastModified !== initial.lastModified))) throw Error("archive-payload-changed");

      if (file.size !== item.target.size || file.size > BACKUP_LIMITS.fileBytes) return "damaged";

      const digest = await hash(file);

      check();
      initial = file;

      return digest === item.target.sha256 ? "verified" : "damaged";
    };

    payload = await verifyPayload();

    if (payload === "damaged") status = "damaged";
    else {
      const base = {
        schemaVersion: prepared.schemaVersion,
        operation: prepared.operation,
        operationId: prepared.operationId,
        vaultId: prepared.vaultId,
        owner: prepared.owner,
        createdAt: prepared.createdAt
      };
      const verified = {
        ...base,
        type: "item-verified",
        itemId: item.itemId,
        recoveryId: item.recoveryId,
        size: item.target.size,
        sha256: item.target.sha256
      };
      const stopped = {
        ...base,
        type: "stopped",
        reason: "completed",
        issue: null,
        items: prepared.items.map(item => ({ itemId: item.itemId, status: "verified" }))
      };
      const expected = [{ name: "prepared.json", value: prepared }, { name: `${item.itemId}-verified.json`, value: verified }, { name: "stopped.json", value: stopped }];
      const verifyRecords = async (directory: FileSystemDirectoryHandle, assertDirectory: () => Promise<void>) => {
        for (const record of expected) {
          const raw = await readArchiveRecord(directory, record.name, check, assertDirectory, budget);

          if (JSON.stringify(parseBackupManifest(raw.value)) !== JSON.stringify(record.value)) throw Error("archive-record-changed");
        }
      };

      try {
        await verifyRecords(proof.directory, current);
        journal = "unavailable";

        const permission = await snapshot.root.queryPermission({ mode: "read" });

        check();

        if (permission !== "granted") throw new DOMException("permission", "NotAllowedError");

        const destination = await openCopyDirectory(snapshot.root, item.to.slice(0, -1), check);
        const history = await destination.getDirectoryHandle(".moa-history", { create: false });

        check();

        const paired = await history.getDirectoryHandle(proof.operationName, { create: false });

        check();

        const targetCurrent = async () => {
          await current();

          const parent = await openCopyDirectory(snapshot.root, item.to.slice(0, -1), check);
          const latestHistory = await parent.getDirectoryHandle(".moa-history", { create: false });

          check();

          const latest = await latestHistory.getDirectoryHandle(proof.operationName, { create: false });

          check();

          const same = await paired.isSameEntry(latest);

          check();

          if (!same) throw Error("archive-record-changed");
        };

        await verifyRecords(paired, targetCurrent);
        finalAudit = async () => {
          await verifyRecords(proof.directory, current);
          await verifyRecords(paired, targetCurrent);
        };
        journal = "verified";
      } catch (error) {
        propagate(error, check);

        if (error instanceof Error && error.message.includes("changed")) journal = "changed";

        issue = "record";
      }

      payload = await verifyPayload();

      if (finalAudit) await finalAudit();

      if (payload === "damaged") status = "damaged";
      else if (journal === "verified") status = "verified";
    }

    await current();
  } catch (error) {
    // Cancellation and ownership changes must not publish an earlier owner's data.
    check();

    if (error instanceof Error && (error.name === "AbortError" || error.message === "stale-connection-operation")) throw error;

    issue = error instanceof Error && (error.name === "NotAllowedError" || error.name === "SecurityError")
      ? "permission"
      : error instanceof Error && error.message.includes("changed") ? "changed" : "read";
    status = "uncertain";

    if (issue === "changed") payload = "not-checked";

    if (issue === "changed" || journal === "verified") journal = "changed";
  }

  return { status, payload, journal, issue, checkedAt: new Date().toISOString() };
}
