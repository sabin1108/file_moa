import { isRecordId } from "../../packages/domain/src/local-record";
import { digest, loadLatest } from "./record-store";

type Directory = FileSystemDirectoryHandle & { values(): AsyncIterableIterator<FileSystemHandle> };
type RecoveryWriter = (directory: FileSystemDirectoryHandle, name: string, text: string) => Promise<void>;

async function capture(directory: FileSystemDirectoryHandle) {
  const files = new Map<string, File>();
  const hashes: [string, string][] = [];
  let entries = 0, totalBytes = 0;
  for await (const entry of (directory as Directory).values()) {
    if (++entries > 500) throw new Error("recovery-entry-limit");
    if (entry.kind !== "file" || (!entry.name.endsWith(".md") && !entry.name.endsWith(".json"))) continue;
    const original = await (await directory.getFileHandle(entry.name)).getFile();
    const limit = entry.name.endsWith(".json") ? 16384 : 2 * 1024 * 1024;
    totalBytes += original.size;
    if (original.size > limit || totalBytes > 50 * 1024 * 1024) throw new Error("recovery-size-limit");
    const bytes = await original.arrayBuffer();
    // Materialize immutable bytes: an external edit must not change the preview halfway through validation.
    files.set(entry.name, new File([bytes], entry.name));
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(value => value.toString(16).padStart(2, "0")).join("");
    hashes.push([entry.name, hash]);
  }
  hashes.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return { files, fingerprint: await digest(JSON.stringify(hashes)) };
}

async function inspect(directory: FileSystemDirectoryHandle, recordId: string) {
  if (!isRecordId(recordId)) throw new Error("invalid-record-id");
  const snapshot = await capture(directory);
  const incompleteMetadata: string[] = [];
  const committedFiles = new Set<string>();
  for (const [name, file] of snapshot.files) {
    if (!name.endsWith(".json")) continue;
    if (!isRecordId(name.slice(0, -5))) throw new Error("invalid-recovery-file-name");
    if (file.size === 0) incompleteMetadata.push(name);
    else { committedFiles.add(name); committedFiles.add(`${name.slice(0, -5)}.md`); }
  }
  // Read-only snapshot implementing exactly the two operations consumed by loadLatest.
  const reader = {
    async *values() { for (const [name] of snapshot.files) if (!incompleteMetadata.includes(name)) yield { name, kind: "file" }; },
    async getFileHandle(name: string) {
      const file = snapshot.files.get(name);
      if (!file) throw new DOMException("Missing record body", "NotFoundError");
      return { async getFile() { return file; } };
    },
  } as unknown as FileSystemDirectoryHandle;
  const latest = await loadLatest(reader, recordId);
  if (!latest) throw new Error("no-recoverable-revision");
  const orphanBodies = [...snapshot.files.keys()].filter(name => name.endsWith(".md") && !committedFiles.has(name)).sort();
  return {
    snapshot, committedFiles,
    preview: { recordId, fingerprint: snapshot.fingerprint, headRevisionId: latest.metadata.revisionId, revisionCount: latest.revisionCount, incompleteMetadata: incompleteMetadata.sort(), orphanBodies },
  };
}

export async function previewRecovery(directory: FileSystemDirectoryHandle, recordId: string) {
  return (await inspect(directory, recordId)).preview;
}

async function writeNew(directory: FileSystemDirectoryHandle, name: string, text: string) {
  try { await directory.getFileHandle(name); throw new Error("recovery-file-already-exists"); }
  catch (error) { if (!(error instanceof DOMException) || error.name !== "NotFoundError") throw error; }
  const file = await directory.getFileHandle(name, { create: true });
  const writer = await file.createWritable({ mode: "exclusive" } as FileSystemCreateWritableOptions);
  try { await writer.write(text); await writer.close(); }
  catch (error) { await writer.abort().catch(() => undefined); throw error; }
}

export async function recoverRecord(source: FileSystemDirectoryHandle, destination: FileSystemDirectoryHandle, recordId: string, expectedFingerprint: string, write: RecoveryWriter = writeNew) {
  if (await source.isSameEntry(destination) || await source.resolve(destination) !== null || await destination.resolve(source) !== null) {
    throw new Error("overlapping-recovery-destination");
  }
  return navigator.locks.request("moa-s0-record-save", async () => {
    const inspected = await inspect(source, recordId);
    if (inspected.preview.fingerprint !== expectedFingerprint) throw new Error("stale-recovery-preview");
    const directoryName = `recovered-${crypto.randomUUID()}`;
    try { await destination.getDirectoryHandle(directoryName); throw new Error("recovery-directory-already-exists"); }
    catch (error) { if (!(error instanceof DOMException) || error.name !== "NotFoundError") throw error; }
    const recovered = await destination.getDirectoryHandle(directoryName, { create: true });
    // Bodies first, metadata last. A failed partial folder is never returned as an active connection.
    const names = [...inspected.committedFiles].sort((a, b) => Number(a.endsWith(".json")) - Number(b.endsWith(".json")));
    for (const name of names) {
      const file = inspected.snapshot.files.get(name);
      if (!file) throw new Error("missing-recovery-body");
      await write(recovered, name, new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()));
    }
    const verified = await loadLatest(recovered, recordId);
    if (verified?.metadata.revisionId !== inspected.preview.headRevisionId) throw new Error("recovery-verification-failed");
    if ((await capture(source)).fingerprint !== expectedFingerprint) throw new Error("source-changed-during-recovery");
    await write(recovered, "recovery-info.txt", JSON.stringify({ recordId, sourceFingerprint: expectedFingerprint, recoveredHead: verified.metadata.revisionId, skippedMetadata: inspected.preview.incompleteMetadata, retainedOrphans: inspected.preview.orphanBodies }, null, 2));
    if ((await capture(source)).fingerprint !== expectedFingerprint) throw new Error("source-changed-during-recovery");
    const final = await loadLatest(recovered, recordId);
    if (final?.metadata.revisionId !== inspected.preview.headRevisionId) throw new Error("recovery-verification-failed");
    return { directory: recovered, preview: inspected.preview };
  });
}
