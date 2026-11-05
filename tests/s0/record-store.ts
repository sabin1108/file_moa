import { isRecordId, parseLocalRecord, type LocalRecord } from "../../packages/domain/src/local-record";

// S0 browser adapter. The caller supplies a dedicated test/AI directory, never a source directory.
type Directory = FileSystemDirectoryHandle & { values(): AsyncIterableIterator<FileSystemHandle> };
export type RevisionInput = Omit<LocalRecord, "schemaVersion" | "contentFile" | "contentSha256">;
const MAX_BODY = 2 * 1024 * 1024;
export async function digest(text: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function readText(handle: FileSystemFileHandle, limit: number) {
  const file = await handle.getFile();
  if (file.size > limit) throw new Error("record-too-large");
  return new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
}

export async function loadLatest(directory: FileSystemDirectoryHandle, recordId: string) {
  if (!isRecordId(recordId)) throw new Error("invalid-record-id");
  const records = new Map<string, { metadata: LocalRecord; body: string }>();
  for await (const entry of (directory as Directory).values()) {
    if (entry.kind !== "file" || !entry.name.endsWith(".json")) continue;
    if (records.size >= 100) throw new Error("revision-limit");
    const metadataText = await readText(await directory.getFileHandle(entry.name), 16384);
    let parsed: unknown;
    try { parsed = JSON.parse(metadataText); } catch { throw new Error("incomplete-record-metadata"); }
    const metadata = parseLocalRecord(parsed);
    if (metadata.recordId !== recordId || entry.name !== `${metadata.revisionId}.json`) throw new Error("record-identity-mismatch");
    const body = await readText(await directory.getFileHandle(metadata.contentFile), MAX_BODY);
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
  return { ...heads[0], revisionCount: records.size };
}

async function writeNew(directory: FileSystemDirectoryHandle, name: string, text: string) {
  try {
    await directory.getFileHandle(name);
    throw new Error("revision-already-exists");
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== "NotFoundError") throw error;
  }
  const file = await directory.getFileHandle(name, { create: true });
  const stream = await file.createWritable({ mode: "exclusive" } as FileSystemCreateWritableOptions);
  try { await stream.write(text); await stream.close(); }
  catch (error) { await stream.abort().catch(() => undefined); throw error; }
}

export async function saveRevision(directory: FileSystemDirectoryHandle, input: RevisionInput, body: string) {
  if (new TextEncoder().encode(body).byteLength > MAX_BODY) throw new Error("record-too-large");
  const metadata = parseLocalRecord({ ...input, schemaVersion: 1, contentFile: `${input.revisionId}.md`, contentSha256: await digest(body) });
  // A deliberately coarse origin lock is sufficient for the bounded S0 probe.
  return navigator.locks.request("moa-s0-record-save", async () => {
    const current = await loadLatest(directory, metadata.recordId);
    if ((current?.metadata.revisionId ?? null) !== metadata.parentRevisionId) throw new Error("stale-revision");
    if (current && current.revisionCount >= 100) throw new Error("revision-limit");
    await writeNew(directory, metadata.contentFile, body);
    await writeNew(directory, `${metadata.revisionId}.json`, JSON.stringify(metadata, null, 2));
    const saved = await loadLatest(directory, metadata.recordId);
    if (saved?.metadata.revisionId !== metadata.revisionId) throw new Error("revision-conflict");
    return saved;
  });
}
