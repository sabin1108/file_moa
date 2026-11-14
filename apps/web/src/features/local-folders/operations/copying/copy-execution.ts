/** 사용자의 명시적 복사를 순차 실행한다. 원본은 읽기만 하며 기록/대상 쓰기는 목적지 아래로 제한한다. */
import { copyInspectionInput, type CopyInspection } from "./copy-inspection-rules";
import { type CopyEvent, type CopyItem, type CopyItemStatus } from "./copy-journal";
import { comparableName, type FileChangePlan } from "../planning/file-change-plan";
import type { ConnectionOwner, FolderHandle } from "../../types";
import { inspectCopyPlan } from "./copy-inspection";
import { createCopyHasher } from "../../content/copy-hash";
import { CopyJournalWriter, openCopyDirectory } from "./copy-journal-storage";

export type CopyExecution = Readonly<{
  id: string;
  phase: "preparing" | "copying" | "completed" | "cancelled" | "error";
  items: readonly (CopyItem & { status: CopyItemStatus })[];
  issue: string | null;
  journalComplete: boolean;
}>;

export async function executeCopy(
  root: FolderHandle,
  plan: FileChangePlan,
  approved: CopyInspection,
  owner: ConnectionOwner,
  assertCurrent: () => void,
  signal: AbortSignal,
  progress: (result: CopyExecution) => void,
  hashOverride?: (file: File) => Promise<string>,
  lock: (work: () => Promise<void>) => Promise<void> = async work => {
    await navigator.locks.request("moa-folder-creation", work);
  },
): Promise<CopyExecution> {
  // Capture trusted approval before awaiting permission; later caller mutations cannot change the work.
  const input = copyInspectionInput(plan), snapshot = structuredClone(approved);
  const fixedPlan = structuredClone(plan), capturedOwner = { ...owner };
  const items = snapshot.files.map((file, index) => ({
    ...file,
    itemId: `item-${String(index + 1).padStart(4, "0")}`,
    status: "not-run" as CopyItemStatus
  }));
  const id = crypto.randomUUID();
  let phase: CopyExecution["phase"] = "preparing", issue: string | null = null, journalComplete = false;
  const result = (): CopyExecution => ({ id, phase, issue, journalComplete, items: items.map(i => ({ ...i })) });
  const check = () => {
    assertCurrent();

    if (signal.aborted) throw new DOMException("Copy cancelled", "AbortError");
  };
  const notify = () => {
    assertCurrent();
    progress(result());
  };
  let journal: CopyJournalWriter | null = null, revision = 0, previousEventId: string | null = null;
  let started = false;
  const inFlight: { item: typeof items[number] | null } = { item: null };
  const makeEvent = (event: Pick<CopyEvent, "type" | "payload">): CopyEvent => ({
    schemaVersion: 1 as const,
    operation: "copy" as const,
    operationId: id,
    eventId: crypto.randomUUID(),
    revision,
    previousEventId,
    owner: capturedOwner,
    sourceParent: input.sourcePath,
    destinationParent: input.destinationPath,
    createdAt: new Date().toISOString(),
    ...event
  } as CopyEvent);
  const appendEvent = async (next: CopyEvent) => {
    await journal!.append(next);
    previousEventId = next.eventId;
    revision++;
  };
  const append = (event: Pick<CopyEvent, "type" | "payload">) => appendEvent(makeEvent(event));
  const stop = async (reason: "completed" | "cancelled" | "error") => {
    await append({
      type: "stopped",
      payload: { reason, notRunItemIds: items.filter(i => i.status === "not-run").map(i => i.itemId) }
    });
    journalComplete = true;
  };

  try {
    check();
    // No await before this call: permission originates from the explicit copy button gesture.

    const permission = root.requestPermission({ mode: "readwrite" });

    notify();

    if (await permission !== "granted") throw new DOMException("Write permission required", "NotAllowedError");

    check();
    await lock(async () => {
      check();

      const fresh = await inspectCopyPlan(root, fixedPlan, check, signal, hashOverride);

      check();

      if (JSON.stringify(fresh) !== JSON.stringify(snapshot)) throw Error("source-changed");

      const source = await openCopyDirectory(root, input.sourcePath, check), destination = await openCopyDirectory(root, input.destinationPath, check);

      if (await source.isSameEntry(destination)) throw Error("copy-conflict");

      check();

      const hasher = hashOverride ? null : createCopyHasher(signal), hash = hashOverride ?? hasher!.hash;
      const fixed: File[] = [];
      const parents = async () => {
        check();

        const latest = await openCopyDirectory(root, input.destinationPath, check);

        if (!await destination.isSameEntry(latest)) throw Error("copy-conflict");

        const sourceNow = await openCopyDirectory(root, input.sourcePath, check);

        if (!await source.isSameEntry(sourceNow)) throw Error("source-changed");

        check();

        if (await root.queryPermission({ mode: "readwrite" }) !== "granted") throw new DOMException("permission", "NotAllowedError");

        check();
      };

      try {
        for (const item of items) {
          check();

          const handle = await source.getFileHandle(item.from.at(-1)!, { create: false });

          check();

          const file = await handle.getFile();

          check();

          if (file.size !== item.size || file.lastModified !== item.lastModified) throw Error("source-changed");

          const buffer = await file.arrayBuffer();

          check();

          const payload = new File([buffer], file.name, { lastModified: file.lastModified });

          if (await hash(payload) !== item.sha256) throw Error("source-changed");

          check();
          fixed.push(payload);
        }

        const rechecked = await inspectCopyPlan(root, fixedPlan, check, signal, hash);

        check();

        if (JSON.stringify(rechecked) !== JSON.stringify(snapshot)) throw Error("source-changed");

        await parents();
        journal = new CopyJournalWriter(destination, assertCurrent, async () => {
          const currentDestination = await openCopyDirectory(root, input.destinationPath, assertCurrent);

          if (!await destination.isSameEntry(currentDestination)) throw Error("copy-journal-changed");

          assertCurrent();
        });

        const preparedEvent = makeEvent({
          type: "prepared",
          payload: {
            items: items.map(item => ({
              itemId: item.itemId,
              from: item.from,
              to: item.to,
              size: item.size,
              lastModified: item.lastModified,
              sha256: item.sha256
            }))
          }
        });

        await journal.prepare(items.length, new TextEncoder().encode(JSON.stringify(preparedEvent)).length);
        check();
        await appendEvent(preparedEvent);
        started = true;
        check();
        phase = "copying";
        notify();

        for (const [index, item] of items.entries()) {
          await parents();
          check();

          let count = 0;

          for await (const entry of destination.values()) {
            check();

            if (++count > 1000 || comparableName(entry.name) === comparableName(item.to.at(-1)!)) throw Error("copy-conflict");
          }

          check();
          await append({ type: "item-started", payload: { itemId: item.itemId } });
          inFlight.item = item;
          item.status = "started";
          notify();
          check();

          const target = await destination.getFileHandle(item.to.at(-1)!, { create: true });

          check();

          if ((await target.getFile()).size !== 0) throw Error("copy-conflict");

          check();

          const options = { keepExistingData: false, mode: "exclusive" };
          const stream = await target.createWritable(options);

          try {
            check();
            await parents();

            const currentTarget = await destination.getFileHandle(item.to.at(-1)!, { create: false });

            check();

            if (!await target.isSameEntry(currentTarget) || (await target.getFile()).size !== 0) throw Error("copy-conflict");

            check();
            await stream.write(fixed[index]);
            check();
            await stream.close();
          } catch (error) {
            await stream.abort().catch(() => { });

            throw error;
          }

          check();
          await parents();

          const reopened = await destination.getFileHandle(item.to.at(-1)!, { create: false });

          check();

          if (!await target.isSameEntry(reopened)) throw Error("copy-conflict");

          const copied = await reopened.getFile();

          check();

          if (copied.size !== item.size || await hash(copied) !== item.sha256) throw Error("copy-verification");

          check();
          await append({ type: "item-verified", payload: { itemId: item.itemId, size: item.size, sha256: item.sha256 } });
          item.status = "verified";
          inFlight.item = null;
          notify();
        }

        await stop("completed");
        phase = "completed";
      } finally {
        fixed.length = 0;
        hasher?.dispose();
      }
    });
  } catch (error) {
    phase = signal.aborted || (error instanceof Error && error.name === "AbortError") ? "cancelled" : "error";
    issue = error instanceof Error ? error.name === "NotAllowedError" ? "permission" : error.message : "copy-failed";

    if (inFlight.item) inFlight.item.status = "uncertain";

    if (started && journal) {
      try {
        if (inFlight.item) await append({ type: "item-uncertain", payload: { itemId: inFlight.item.itemId } });

        await stop(phase);
      } catch {
        journalComplete = false;
      }
    }
  }

  return result();
}
