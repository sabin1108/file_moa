import type { BackupInspection } from "../lib/recovery-backup";
import type { OverwriteExecution, OverwriteRecord } from "../lib/recovery-overwrite";
import type { ConnectionOwner, FolderHandle } from "../types";
import type { BackupExecution } from "./recovery-backup";
import type { BackupHash, BackupEntryIdentity } from "./recovery-backup-input";
import { createCopyHasher } from "./copy-hash";
import { BackupDirectory } from "./recovery-backup-storage";
import { openOverwriteInputs } from "./recovery-overwrite-input";
import { OverwriteJournal } from "./recovery-overwrite-journal";
import { comparableName } from "../lib/file-change-plan";
import { readSourceFolderListing } from "./source-folder-listing";

export type { OverwriteExecution } from "../lib/recovery-overwrite";

/** 완료 백업과 현재 입력을 재검증한 뒤 정확한 기존 목적지만 교체한다. */
export async function executeRecoveryOverwrite(root: FolderHandle, vault: FolderHandle, plan: unknown, approved: BackupInspection,
  backup: BackupExecution, owner: ConnectionOwner, assertCurrent: () => void, signal: AbortSignal,
  progress: (value: OverwriteExecution) => void, hashOverride?: BackupHash,
  lock: (work: () => Promise<void>) => Promise<void> = async work => { await navigator.locks.request("moa-folder-creation", work); },
  identity?: BackupEntryIdentity): Promise<OverwriteExecution> {
  const fixedPlan = structuredClone(plan);
  const snapshot = structuredClone(approved);
  const receipt = structuredClone(backup);
  const capturedOwner = { ...owner };
  const id = crypto.randomUUID();
  const items = snapshot.files.map((_file, index) => ({ itemId: `item-${String(index + 1).padStart(4, "0")}`, status: "not-run" as OverwriteExecution["items"][number]["status"] }));
  let phase: OverwriteExecution["phase"] = "preparing";
  let issue: string | null = null;
  let journalComplete = false;
  let recordingFailure = false;
  let recordFailed = false;
  let currentItem: typeof items[number] | undefined;
  let journal: OverwriteJournal | undefined;
  const base = { schemaVersion: 1 as const, operation: "recovery-overwrite" as const, operationId: id,
    backupOperationId: receipt.id, vaultId: snapshot.vaultId, owner: capturedOwner, createdAt: new Date().toISOString() };
  const result = (): OverwriteExecution => ({ id, phase, issue, journalComplete, items: items.map(item => ({ ...item })) });
  const check = () => {
    assertCurrent();
    if (signal.aborted && !recordingFailure) throw new DOMException("Overwrite cancelled", "AbortError");
  };
  const notify = () => { check(); progress(result()); };
  const append = async (name: string, value: OverwriteRecord) => {
    try { await journal!.append(name, value); }
    catch (error) { recordFailed = true; throw error; }
  };
  const stop = (reason: "completed" | "cancelled" | "error") => append("stopped.json", { ...base, type: "stopped", reason, issue,
    items: items.map(item => ({ ...item })) });

  try {
    check();
    // Both permission requests begin in the final explicit action before any await.
    const requests = [root.requestPermission({ mode: "readwrite" }), vault.requestPermission({ mode: "readwrite" })];
    notify();
    if ((await Promise.all(requests)).some(value => value !== "granted")) throw new DOMException("permission", "NotAllowedError");
    check();
    await lock(async () => {
      const hasher = hashOverride ? null : createCopyHasher(signal);
      const hash = hashOverride ?? hasher!.hash;
      try {
        const input = await openOverwriteInputs(root, vault, fixedPlan, snapshot, receipt, capturedOwner, check, hash, identity);
        const { captured, expected, sourcePayloads } = input;
        const verifyCurrentItem = async (index: number) => {
          for (const path of [expected.items[index].from, expected.items[index].to]) {
            const listing = await readSourceFolderListing(root, path.slice(0, -1), check);
            check();
            const name = path.at(-1)!;
            const matches = listing.entries.filter(entry => comparableName(entry.name) === comparableName(name));
            if (listing.truncated || matches.length !== 1 || matches[0].name !== name || matches[0].kind !== "file") throw Error("overwrite-input-changed");
          }
          await captured.verifyItem(index);
        };
        const parents = async () => {
          await captured.parents();
          for (const folder of [root, vault]) {
            const permission = await folder.queryPermission({ mode: "readwrite" });
            check();
            if (permission !== "granted") throw new DOMException("permission", "NotAllowedError");
          }
        };
        await parents();
        const stores = [await BackupDirectory.create(vault, `moa-overwrite-${id}`, check, parents),
          await BackupDirectory.create(input.history, `moa-overwrite-${id}`, check, input.verifyHistory)];
        journal = new OverwriteJournal(stores, check);
        await append("prepared.json", { ...base, type: "prepared", backup: expected });
        phase = "replacing";
        notify();

        const verifyTarget = async (index: number, changed: boolean) => {
          await parents();
          const target = await captured.destination.getFileHandle(expected.items[index].to.at(-1)!, { create: false });
          check();
          const same = await captured.targetHandles[index].isSameEntry(target);
          check();
          const file = await target.getFile();
          check();
          const expectedFile = changed ? expected.items[index].source : expected.items[index].target;
          if (!same || file.size !== expectedFile.size || (!changed && file.lastModified !== expectedFile.lastModified)) throw Error("overwrite-target-changed");
          const digest = await hash(file);
          check();
          if (digest !== expectedFile.sha256) throw Error("overwrite-verification");
        };

        for (const [index, item] of items.entries()) {
          await parents();
          await input.verifyBackup();
          await verifyCurrentItem(index);
          await journal.audit();
          await append(`${item.itemId}-target-started.json`, { ...base, type: "target-started", itemId: item.itemId });
          await verifyCurrentItem(index);
          await parents();
          check();
          const target = await captured.destination.getFileHandle(expected.items[index].to.at(-1)!, { create: false });
          check();
          if (!await target.isSameEntry(captured.targetHandles[index])) throw Error("overwrite-target-changed");
          check();
          // Any attempted target writable is conservatively uncertain until readback and records verify.
          currentItem = item;
          item.status = "uncertain";
          notify();
          const options = { keepExistingData: false, mode: "exclusive" };
          const stream = await target.createWritable(options);
          try {
            check();
            await verifyCurrentItem(index);
            for (let offset = 0; offset < sourcePayloads[index].size; offset += 64 * 1024) {
              await stream.write(sourcePayloads[index].slice(offset, offset + 64 * 1024));
              check();
            }
            await verifyCurrentItem(index);
            await input.verifyBackup();
            await journal.audit();
            await parents();
            await stream.close();
            check();
          } catch (error) {
            await stream.abort().catch(() => {});
            throw error;
          }
          await verifyTarget(index, true);
          await append(`${item.itemId}-target-verified.json`, { ...base, type: "target-verified", itemId: item.itemId });
          item.status = "verified";
          currentItem = undefined;
          notify();
        }
        for (const index of items.keys()) {
          currentItem = items[index];
          await verifyTarget(index, true);
          currentItem = undefined;
        }
        await input.verifyBackup();
        await stop("completed");
        try { await journal.audit(); }
        catch (error) {
          for (const item of items) if (item.status === "verified") item.status = "uncertain";
          throw error;
        }
        check();
        journalComplete = true;
        phase = "completed";
      } finally {
        hasher?.dispose();
      }
    });
  } catch (error) {
    phase = signal.aborted || (error instanceof Error && error.name === "AbortError") ? "cancelled" : "error";
    const reason = error instanceof Error ? error.message : "";
    issue = error instanceof Error && error.name === "NotAllowedError" ? "permission"
      : /^(?:overwrite|backup)-[a-z-]{1,44}$/u.test(reason) ? reason : phase === "cancelled" ? "cancelled" : "overwrite-failed";
    if (currentItem) currentItem.status = "uncertain";
    if (journal) {
      recordingFailure = true;
      try {
        check();
        await stop(phase);
        await journal.audit();
        journalComplete = !recordFailed;
      } catch { journalComplete = false; }
    }
  }
  return result();
}
