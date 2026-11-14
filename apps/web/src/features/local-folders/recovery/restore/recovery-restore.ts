import { comparableName } from "../../operations/planning/file-change-plan";
import {
  restoreDestinationPath,
  restoreFileName,
  parseRestoreRecord,
  type RestorePreview,
  type RestoreExecution,
  type RestoreRecord
} from "./recovery-restore-rules";
import type { ConnectionOwner } from "../../types";
import type { RecoveryArchiveSnapshot } from "../archive/recovery-archive";
import { openRestoreAsset } from "./recovery-restore-input";
import type { BackupHash } from "../backup/recovery-backup-input";
import { openCopyDirectory } from "../../operations/copying/copy-journal-storage";
import { readSourceFolderListing } from "../../browsing/source-folder-listing";
import { BackupDirectory } from "../backup/recovery-backup-storage";
import { RecoveryOperationJournal } from "../recovery-operation-journal";

export type PreparedRestore = Readonly<{
  view: RestorePreview;
  snapshot: RecoveryArchiveSnapshot;
  destination: FileSystemDirectoryHandle;
  payloadHandle: FileSystemFileHandle;
  payloadModified: number;
}>;

export async function prepareRecoveryRestore(
  snapshot: RecoveryArchiveSnapshot,
  id: string,
  path: readonly string[],
  assertCurrent: () => void,
  signal: AbortSignal,
  hash: BackupHash): Promise<PreparedRestore> {
  const destinationPath = restoreDestinationPath(path);
  const check = () => {
    assertCurrent();
    snapshot.check();

    if (signal.aborted) throw new DOMException("Restore cancelled", "AbortError");
  };

  check();

  const asset = await openRestoreAsset(snapshot, id, check, hash);
  const destination = await openCopyDirectory(snapshot.root, destinationPath, check);
  const listing = await readSourceFolderListing(snapshot.root, destinationPath, check);

  check();

  if (listing.truncated) throw Error("restore-incomplete-destination");

  const originalName = asset.item.to.at(-1)!;
  const name = restoreFileName(originalName, listing.entries.map(entry => entry.name));

  await asset.verify();

  const latest = await openCopyDirectory(snapshot.root, destinationPath, check);
  const same = await destination.isSameEntry(latest);

  check();

  if (!same) throw Error("restore-destination-changed");

  return {
    snapshot,
    destination,
    payloadHandle: asset.handle,
    payloadModified: asset.file.lastModified,
    view: {
      id,
      destination: destinationPath,
      name,
      originalName,
      size: asset.item.target.size,
      renamed: name !== originalName
    }
  };
}

/** 승인한 새 파일 하나만 복원한다. 기존 파일과 보관본은 갱신하지 않는다. */

export async function executeRecoveryRestore(
  approved: PreparedRestore,
  owner: ConnectionOwner,
  assertCurrent: () => void,
  signal: AbortSignal,
  progress: (value: RestoreExecution) => void,
  hash: BackupHash,
  lock: (work: () => Promise<void>) => Promise<void> = async work => {
    await navigator.locks.request("moa-folder-creation", work);
  }): Promise<RestoreExecution> {
  const view = structuredClone(approved.view);
  const capturedOwner = { ...owner };
  const id = crypto.randomUUID();
  const path = [...view.destination, view.name];
  let phase: RestoreExecution["phase"] = "preparing";
  let status: RestoreExecution["status"] = "not-run";
  let issue: string | null = null;
  let journalComplete = false;
  let recordingFailure = false;
  let recordFailed = false;
  let journal: RecoveryOperationJournal<RestoreRecord> | undefined;
  let base: Omit<Extract<RestoreRecord, { type: "stopped" }>, "type" | "reason" | "status" | "issue"> | undefined;
  const result = (): RestoreExecution => ({ id, phase, status, issue, path: [...path], journalComplete });
  const check = () => {
    assertCurrent();
    approved.snapshot.check();

    if (signal.aborted && !recordingFailure) throw new DOMException("Restore cancelled", "AbortError");
  };
  const notify = () => {
    check();
    progress(result());
  };
  const append = async (name: string, value: RestoreRecord) => {
    try {
      await journal!.append(name, value);
    }
    catch (error) {
      recordFailed = true;

      throw error;
    }
  };
  const stop = (reason: "completed" | "cancelled" | "error") => append("stopped.json", { ...base!, type: "stopped", reason, status, issue });

  try {
    check();

    const { root, vault } = approved.snapshot;
    // Start both requests in the final user action, before any await.
    const permissions = [root.requestPermission({ mode: "readwrite" }), vault.requestPermission({ mode: "readwrite" })];

    notify();

    if ((await Promise.all(permissions)).some(value => value !== "granted")) throw new DOMException("permission", "NotAllowedError");

    check();
    await lock(async () => {
      const asset = await openRestoreAsset(approved.snapshot, view.id, check, hash);
      const samePayload = await asset.handle.isSameEntry(approved.payloadHandle);

      check();

      if (!samePayload || asset.file.lastModified !== approved.payloadModified) throw Error("restore-source-changed");

      const destination = await openCopyDirectory(root, view.destination, check);
      const sameParent = await destination.isSameEntry(approved.destination);

      check();

      if (!sameParent) throw Error("restore-destination-changed");

      const parents = async () => {
        check();
        await asset.current();

        const current = await openCopyDirectory(root, view.destination, check);
        const same = await destination.isSameEntry(current);

        check();

        if (!same) throw Error("restore-destination-changed");

        for (const folder of [root, vault]) {
          const permission = await folder.queryPermission({ mode: "readwrite" });

          check();

          if (permission !== "granted") throw new DOMException("permission", "NotAllowedError");
        }
      };
      const absent = async () => {
        await parents();

        const listing = await readSourceFolderListing(root, view.destination, check);

        check();

        if (listing.truncated || listing.entries.some(entry => comparableName(entry.name) === comparableName(view.name))) throw Error("restore-conflict");
      };

      await absent();

      const bytes = await asset.file.arrayBuffer();

      check();

      const fixed = new File([bytes], view.name);

      if (fixed.size !== asset.item.target.size || await hash(fixed) !== asset.item.target.sha256) throw Error("restore-source-changed");

      check();
      await asset.verify();
      base = {
        schemaVersion: 1,
        operation: "recovery-restore",
        operationId: id,
        backupOperationId: asset.prepared.operationId,
        itemId: asset.item.itemId,
        recoveryId: asset.item.recoveryId,
        vaultId: asset.prepared.vaultId,
        owner: capturedOwner,
        createdAt: new Date().toISOString()
      };

      const vaultStore = await BackupDirectory.create(vault, `moa-restore-${id}`, check, parents);
      const history = await destination.getDirectoryHandle(".moa-history", { create: true });

      check();

      const historyCurrent = async () => {
        await parents();

        const current = await destination.getDirectoryHandle(".moa-history", { create: false });

        check();

        const same = await history.isSameEntry(current);

        check();

        if (!same) throw Error("restore-record-changed");
      };
      const targetStore = await BackupDirectory.create(history, `moa-restore-${id}`, check, historyCurrent);

      journal = new RecoveryOperationJournal([vaultStore, targetStore], check, parseRestoreRecord, "restore");
      await append("prepared.json", {
        ...base,
        type: "prepared",
        from: asset.item.to,
        to: path,
        size: asset.item.target.size,
        sha256: asset.item.target.sha256
      });
      await append(`${base.itemId}-target-started.json`, { ...base, type: "target-started" });
      await asset.verify();
      await journal.audit();
      await absent();
      status = "uncertain";
      phase = "restoring";
      notify();

      const target = await destination.getFileHandle(view.name, { create: true });

      check();

      const verifyTarget = async (empty: boolean) => {
        await parents();

        const listing = await readSourceFolderListing(root, view.destination, check);
        const matches = listing.entries.filter(entry => comparableName(entry.name) === comparableName(view.name));

        if (listing.truncated || matches.length !== 1 || matches[0].name !== view.name || matches[0].kind !== "file") throw Error("restore-conflict");

        const latest = await destination.getFileHandle(view.name, { create: false });

        check();

        const same = await target.isSameEntry(latest);

        check();

        const file = await latest.getFile();

        check();

        if (!same || file.size !== (empty ? 0 : view.size)) throw Error("restore-verification");

        if (!empty) {
          const digest = await hash(file);

          check();

          if (digest !== asset.item.target.sha256) throw Error("restore-verification");
        }
      };

      await verifyTarget(true);

      const options = { keepExistingData: false, mode: "exclusive" };
      const stream = await target.createWritable(options);

      try {
        check();
        await verifyTarget(true);

        for (let offset = 0; offset < fixed.size; offset += 64 * 1024) {
          await stream.write(fixed.slice(offset, offset + 64 * 1024));
          check();
        }

        await verifyTarget(true);
        await asset.verify();
        await journal.audit();
        await stream.close();
        check();
      } catch (error) {
        await stream.abort().catch(() => { });

        throw error;
      }

      await verifyTarget(false);
      await append(`${base.itemId}-target-verified.json`, { ...base, type: "target-verified" });
      await asset.verify();
      await verifyTarget(false);
      status = "verified";
      await stop("completed");
      await journal.audit();
      check();
      journalComplete = true;
      phase = "completed";
    });
  } catch (error) {
    phase = signal.aborted || (error instanceof Error && error.name === "AbortError") ? "cancelled" : "error";

    if (status !== "not-run") status = "uncertain";

    const message = error instanceof Error ? error.message : "";

    issue = error instanceof Error && error.name === "NotAllowedError"
      ? "permission"
      : /^(?:restore|backup)-[a-z-]{1,44}$/u.test(message) ? message : phase === "cancelled" ? "cancelled" : "restore-failed";

    if (journal && base) {
      recordingFailure = true;

      try {
        check();
        await stop(phase);
        await journal.audit();
        journalComplete = !recordFailed;
      }
      catch {
        journalComplete = false;
      }
    }
  }

  return result();
}
