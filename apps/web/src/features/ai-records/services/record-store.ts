import { isRecordId, parseLocalRecord, type LocalRecord } from "@personal-ai/domain";

// AI record revisions use a dedicated directory; source folders are never writable here.
type Directory = FileSystemDirectoryHandle & { values(): AsyncIterableIterator<FileSystemHandle> };
export type RevisionInput = Omit<LocalRecord, "schemaVersion" | "contentFile" | "contentSha256">;
const MAX_BODY = 2 * 1024 * 1024;
export type RecordAccess = { assertCurrent?: () => void; maxRevisions?: number; beforeWrite?: () => Promise<void> };
export async function digest(text: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function readText(handle: FileSystemFileHandle, limit: number) {
  const file = await handle.getFile();
  if (file.size > limit) throw new Error("record-too-large");
  return new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
}

export async function loadLatest(directory: FileSystemDirectoryHandle, recordId: string, access: RecordAccess = {}) {
  access.assertCurrent?.();
  if (!isRecordId(recordId)) throw new Error("invalid-record-id");
  if (!Number.isSafeInteger(access.maxRevisions ?? 100) || (access.maxRevisions ?? 100) < 1 || (access.maxRevisions ?? 100) > 1000) throw new Error("invalid-revision-limit");
  const records = new Map<string, { metadata: LocalRecord; body: string }>();
  let bodyBytes = 0;
  for await (const entry of (directory as Directory).values()) {
    if (entry.kind !== "file" || !entry.name.endsWith(".json")) continue;
    access.assertCurrent?.();
    if (records.size >= (access.maxRevisions ?? 100)) throw new Error("revision-limit");
    const metadataText = await readText(await directory.getFileHandle(entry.name), 16384);
    let parsed: unknown;
    try { parsed = JSON.parse(metadataText); } catch { throw new Error("incomplete-record-metadata"); }
    const metadata = parseLocalRecord(parsed);
    if (metadata.recordId !== recordId || entry.name !== `${metadata.revisionId}.json`) throw new Error("record-identity-mismatch");
    const body = await readText(await directory.getFileHandle(metadata.contentFile), MAX_BODY);
    bodyBytes += new TextEncoder().encode(body).byteLength;
    if (bodyBytes > 50 * 1024 * 1024) throw new Error("record-history-too-large");
    access.assertCurrent?.();
    if (await digest(body) !== metadata.contentSha256) throw new Error("content-hash-mismatch");
    records.set(metadata.revisionId, { metadata, body });
  }
  if (!records.size) return null;
  const parents = new Set<string>();
  for (const { metadata } of records.values()) {
    if (metadata.parentRevisionId !== null) {
      if (!records.has(metadata.parentRevisionId)) throw new Error("missing-parent-revision");
      parents.add(metadata.parentRevisionId);
    }
  }
  const heads = [...records.values()].filter(({ metadata }) => !parents.has(metadata.revisionId));
  if (heads.length !== 1) throw new Error("revision-conflict");
  const visited = new Set<string>();
  let cursor: string | null = heads[0].metadata.revisionId;
  while (cursor !== null) {
    if (visited.has(cursor)) throw new Error("revision-cycle");
    visited.add(cursor);
    cursor = records.get(cursor)!.metadata.parentRevisionId;
  }
  if (visited.size !== records.size) throw new Error("disconnected-revisions");
  return { ...heads[0], revisionCount: records.size, bodyBytes };
}

async function writeNew(directory: FileSystemDirectoryHandle, name: string, text: string, assertCurrent?: () => void) {
  assertCurrent?.();
  try {
    await directory.getFileHandle(name);
    throw new Error("revision-already-exists");
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== "NotFoundError") throw error;
  }
  const file = await directory.getFileHandle(name, { create: true });
  assertCurrent?.();
  let stream: FileSystemWritableFileStream | undefined;
  try {
    stream = await file.createWritable({ mode: "exclusive" } as FileSystemCreateWritableOptions);
    assertCurrent?.();
    await stream.write(text);
    assertCurrent?.();
    await stream.close();
    assertCurrent?.();
  }
  catch (error) {
    await stream?.abort().catch(() => undefined);
    try { assertCurrent?.(); await directory.removeEntry(name); } catch {}
    throw error;
  }
}

export async function saveRevision(directory: FileSystemDirectoryHandle, input: RevisionInput, body: string, access: RecordAccess = {}) {
  access.assertCurrent?.();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY) throw new Error("record-too-large");
  const metadata = parseLocalRecord({ ...input, schemaVersion: 1, contentFile: `${input.revisionId}.md`, contentSha256: await digest(body) });
  return navigator.locks.request(`moa-record-save:${metadata.recordId}`, async () => {
    access.assertCurrent?.();
    await access.beforeWrite?.();
    const current = await loadLatest(directory, metadata.recordId, access);
    if ((current?.metadata.revisionId ?? null) !== metadata.parentRevisionId) throw new Error("stale-revision");
    if (current && current.revisionCount >= (access.maxRevisions ?? 100)) throw new Error("revision-limit");
    if ((current?.bodyBytes ?? 0) + new TextEncoder().encode(body).byteLength > 50 * 1024 * 1024) throw new Error("record-history-too-large");
    await writeNew(directory, metadata.contentFile, body, access.assertCurrent);
    await writeNew(directory, `${metadata.revisionId}.json`, JSON.stringify(metadata, null, 2), access.assertCurrent);
    const saved = await loadLatest(directory, metadata.recordId, access);
    if (saved?.metadata.revisionId !== metadata.revisionId) throw new Error("revision-conflict");
    return saved;
  });
}
