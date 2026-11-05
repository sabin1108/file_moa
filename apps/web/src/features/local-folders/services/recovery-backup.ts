import { backupPlanInput, parseBackupManifest, type BackupInspection, type BackupManifest, type BackupPrepared, type BackupStatus } from "../lib/recovery-backup";
import type { ConnectionOwner, FolderHandle } from "../types";
import { createCopyHasher } from "./copy-hash";
import { openBackupInputs, type BackupHash, type BackupEntryIdentity } from "./recovery-backup-input";
import { BackupDirectory } from "./recovery-backup-storage";

export type BackupExecution = Readonly<{
  id: string; phase: "preparing" | "backing-up" | "completed" | "cancelled" | "error";
  items: readonly { itemId: string; recoveryId: string; status: BackupStatus }[];
  issue: string | null; journalComplete: boolean;
}>;

/** 기존 목적지는 읽고 새 복구본만 쓴다. 성공 결과도 이후 덮어쓰기의 실행 권한으로 사용하지 않는다. */
export async function executeRecoveryBackup(root: FolderHandle, vault: FolderHandle, plan: unknown, approved: BackupInspection,
  owner: ConnectionOwner, assertCurrent: () => void, signal: AbortSignal, progress: (result: BackupExecution) => void,
  hashOverride?: BackupHash, lock: (work: () => Promise<void>) => Promise<void> = async work => {
    await navigator.locks.request("moa-folder-creation", work);
  }, verifiedIdentity?: (value: BackupEntryIdentity) => void): Promise<BackupExecution> {
  const fixedPlan = structuredClone(plan);
  const snapshot = structuredClone(approved);
  const capturedOwner = { userId: owner.userId, workspaceId: owner.workspaceId };
  const input = backupPlanInput(fixedPlan);
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const items = input.rows.map((_row, index) => ({ itemId: `item-${String(index + 1).padStart(4, "0")}`,
    recoveryId: crypto.randomUUID(), status: "not-run" as BackupStatus }));
  let phase: BackupExecution["phase"] = "preparing";
  let issue: string | null = null;
  let journalComplete = false;
  let recordingFailure = false;
  let recordFailure = false;
  const result = (): BackupExecution => ({ id, phase, issue, journalComplete, items: items.map(item => ({ ...item })) });
  const check = () => {
    assertCurrent();
    if (!recordingFailure && signal.aborted) throw new DOMException("Backup cancelled", "AbortError");
  };
  const notify = () => {
    check();
    progress(result());
  };
  let vaultStore: BackupDirectory | undefined;
  let targetStore: BackupDirectory | undefined;
  let prepared: BackupPrepared | undefined;
  let currentItem: typeof items[number] | undefined;
  const records: { name: string; value: BackupManifest; vaultHandle: FileSystemFileHandle; targetHandle: FileSystemFileHandle }[] = [];
  const base = () => ({ schemaVersion: 1 as const, operation: "recovery-backup" as const, operationId: id,
    vaultId: snapshot.vaultId, owner: capturedOwner, createdAt });
  const append = async (name: string, value: BackupManifest) => {
    try {
      const vaultHandle = await vaultStore!.json(name, value);
      check();
      const targetHandle = await targetStore!.json(name, value);
      check();
      records.push({ name, value, vaultHandle, targetHandle });
    } catch (error) {
      recordFailure = true;
      throw error;
    }
  };
  const stop = async (reason: "completed" | "cancelled" | "error") => {
    await append("stopped.json", { ...base(), type: "stopped", reason, issue,
      items: items.map(item => ({ itemId: item.itemId, status: item.status })) });
  };

  try {
    check();
    // Both requests start in the explicit caller gesture, before the first await.
    const permissions = [root.requestPermission({ mode: "readwrite" }), vault.requestPermission({ mode: "readwrite" })];
    notify();
    if ((await Promise.all(permissions)).some(value => value !== "granted")) throw new DOMException("permission", "NotAllowedError");
    check();
    await lock(async () => {
      check();
      const hasher = hashOverride ? null : createCopyHasher(signal);
      const hash = hashOverride ?? hasher!.hash;
      try {
        const captured = await openBackupInputs(root, vault, fixedPlan, capturedOwner, check, hash);
        check();
        if (JSON.stringify(captured.report) !== JSON.stringify(snapshot)) throw Error("backup-input-changed");
        const value = parseBackupManifest({ ...base(), type: "prepared",
          retention: { policy: "undecided", expiresAt: null },
          items: captured.report.files.map((file, index) => ({ itemId: items[index].itemId, recoveryId: items[index].recoveryId, ...file })) });
        if (!value || value.type !== "prepared") throw Error("backup-manifest-invalid");
        prepared = value;

        const verify = async () => {
          check();
          await captured.parents();
          for (const directory of [root, vault]) {
            const permission = await directory.queryPermission({ mode: "readwrite" });
            check();
            if (permission !== "granted") throw new DOMException("permission", "NotAllowedError");
          }
        };
        await verify();
        vaultStore = await BackupDirectory.create(vault, `moa-backup-${id}`, check, verify);
        const history = await captured.destination.getDirectoryHandle(".moa-history", { create: true });
        check();
        const verifyHistory = async () => {
          await verify();
          const latest = await captured.destination.getDirectoryHandle(".moa-history", { create: false });
          check();
          const same = await history.isSameEntry(latest);
          check();
          if (!same) throw Error("backup-storage-changed");
        };
        targetStore = await BackupDirectory.create(history, `moa-backup-${id}`, check, verifyHistory);
        await append("prepared.json", prepared);
        phase = "backing-up";
        notify();
        const payloads: { name: string; handle: FileSystemFileHandle; index: number }[] = [];

        const verifyPayload = async (name: string, handle: FileSystemFileHandle, index: number) => {
          const expected = prepared!.items[index].target;
          for (let observation = 0; observation < 2; observation++) {
            const { file } = await vaultStore!.read(name, handle);
            if (file.size !== expected.size) throw Error("backup-verification");
            const sha256 = await hash(file);
            check();
            if (sha256 !== expected.sha256) throw Error("backup-verification");
          }
        };
        for (const [index, item] of items.entries()) {
          await captured.verifyItem(index);
          check();
          currentItem = item;
          item.status = "uncertain";
          notify();
          const name = `${item.recoveryId}.bin`;
          const handle = await vaultStore.write(name, captured.payloads[index]);
          check();
          await verifyPayload(name, handle, index);
          await captured.verifyItem(index);
          await append(`${item.itemId}-verified.json`, { ...base(), type: "item-verified",
            itemId: item.itemId, recoveryId: item.recoveryId,
            size: prepared.items[index].target.size, sha256: prepared.items[index].target.sha256 });
          payloads.push({ name, handle, index });
          item.status = "verified";
          currentItem = undefined;
          notify();
        }
        // Earlier records and payloads can change while later items are written.
        for (const payload of payloads) {
          currentItem = items[payload.index];
          await verifyPayload(payload.name, payload.handle, payload.index);
          await captured.verifyItem(payload.index);
          currentItem = undefined;
        }
        await stop("completed");
        try {
          for (const record of records) {
            await vaultStore.verifyJson(record.name, record.value, record.vaultHandle);
            await targetStore.verifyJson(record.name, record.value, record.targetHandle);
          }
        } catch (error) {
          for (const item of items) if (item.status === "verified") item.status = "uncertain";
          throw error;
        }
        check();
        journalComplete = true;
        phase = "completed";
        verifiedIdentity?.({ source: captured.source, destination: captured.destination,
          sourceHandles: [...captured.sourceHandles], targetHandles: [...captured.targetHandles] });
      } finally {
        hasher?.dispose();
      }
    });
  } catch (error) {
    phase = signal.aborted || (error instanceof Error && error.name === "AbortError") ? "cancelled" : "error";
    const reason = error instanceof Error ? error.message : "";
    // Persist only bounded codes, never an arbitrary exception message containing file contents/absolute paths.
    issue = error instanceof Error && error.name === "NotAllowedError" ? "permission"
      : /^backup-[a-z-]{1,48}$/u.test(reason) ? reason : phase === "cancelled" ? "cancelled" : "backup-failed";
    if (currentItem) currentItem.status = "uncertain";
    if (prepared && vaultStore && targetStore) {
      recordingFailure = true;
      try {
        check();
        await stop(phase);
        for (const record of records) {
          await vaultStore.verifyJson(record.name, record.value, record.vaultHandle);
          await targetStore.verifyJson(record.name, record.value, record.targetHandle);
        }
        journalComplete = !recordFailure && records.some(record => record.name === "prepared.json");
      } catch {
        journalComplete = false;
      }
    }
  }
  return result();
}
