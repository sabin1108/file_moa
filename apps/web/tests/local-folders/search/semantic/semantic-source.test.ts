import { afterEach, expect, it, vi } from "vitest";
import type { LocalTextIndexEntry } from "../../../../src/features/local-folders/search/documents/local-text-index";
import { prepareSemanticSource, semanticSourceMatches, type SemanticSourceIndex } from "../../../../src/features/local-folders/search/semantic/semantic-source";
import { SEMANTIC_MODEL } from "../../../../src/features/local-folders/search/semantic/model-assets";
import { semanticRecordId } from "../../../../src/features/local-folders/search/semantic/semantic-record";
import type { SemanticModelController } from "../../../../src/features/local-folders/search/semantic/semantic-model-controller";
import { DocumentFindController } from "../../../../src/features/local-folders/search/documents/document-find-controller";
import { confirmSemanticQuery } from "../../../../src/features/local-folders/search/semantic/semantic-query";
import { inferFindRequest } from "../../../../src/features/local-folders/search/documents/document-find";

afterEach(() => vi.restoreAllMocks());
const scope = { owner: "a", workspace: "w", connection: "c" };
const epoch = { scope: "scope-before", model: "model-before" };
const document = { id: "doc", name: "note.md", path: ["note.md"], sha256: "a".repeat(64), size: 4, lastModified: 1, excerpt: "text", excerptHash: "a".repeat(64) };
const snapshot = { documents: [document], complete: true, excluded: [], limits: [], discoveredFiles: 1, directories: 1, bytes: 4 };

function fixture() {
  const row: LocalTextIndexEntry = { ...scope, path: document.path, hash: document.sha256, parserVersion: 2, id: "cache", text: "text", updatedAt: 1, metadata: { format: "text", size: 4, lastModified: 1, ocrEnabled: false } };
  const vector = new Float32Array(384); vector[0] = 1;
  const chunks = [{ start: 0, end: 4, vector }];
  const index = {
    readPath: vi.fn<SemanticSourceIndex["readPath"]>(async () => row),
    semanticRecords: vi.fn<SemanticSourceIndex["semanticRecords"]>(async () => []),
    putSemantic: vi.fn<SemanticSourceIndex["putSemantic"]>(async (_record, check) => { check?.(); return true; }),
    semanticEpoch: vi.fn<SemanticSourceIndex["semanticEpoch"]>(async () => epoch),
  };
  const model = {
    document: vi.fn<SemanticModelController["document"]>(async () => ({ chunks, complete: true })),
    score: vi.fn<SemanticModelController["score"]>(async () => [{ index: 0, score: 0.95, start: 0, end: 4 }]),
    evidence: vi.fn<SemanticModelController["evidence"]>(async () => ({ kind: "matched", dates: [], evidence: ["text"] })),
  };
  const runtime = { createIndex: vi.fn(() => index), now: vi.fn(() => 1234) };
  const abort = new AbortController();
  const value = { ...scope, path: document.path, pathKey: JSON.stringify(document.path), hash: document.sha256, parserVersion: 2, model: SEMANTIC_MODEL.version };
  const record = { ...value, id: semanticRecordId(value), epoch, textLength: 4, complete: true, chunks, updatedAt: 1 };
  const prepare = (check = () => {}) => prepareSemanticSource(runtime, scope, snapshot, epoch, model, abort.signal, check, () => {});
  return { row, index, model, runtime, abort, record, prepare };
}

it("SEM-06 marks cache-write losses as partial preparation", async () => {
  const f = fixture();
  f.index.readPath.mockResolvedValue(undefined);
  const result = await f.prepare();
  expect(result).toEqual({ prepared: 0, scanned: 0, partial: true });
});

it("SEM-07 rejects deletion during a fully reused preparation without writing new records", async () => {
  const f = fixture();
  f.index.semanticRecords.mockResolvedValue([f.record]);
  f.index.semanticEpoch.mockResolvedValue({ ...epoch, model: "model-after-delete" });
  await expect(f.prepare()).rejects.toThrow("storage-changed");
  expect(f.index.putSemantic).not.toHaveBeenCalled();
  expect(f.model.document).not.toHaveBeenCalled();
});

it("uses a plain index/model, one factory and the supplied record timestamp", async () => {
  const f = fixture();
  expect(await f.prepare()).toEqual({ prepared: 1, scanned: 1, partial: false });
  expect(f.runtime.createIndex).toHaveBeenCalledTimes(1);
  expect(f.index.readPath).toHaveBeenCalledExactlyOnceWith(scope, document.path);
  expect(f.index.putSemantic.mock.calls[0][0]).toMatchObject({ updatedAt: 1234, parserVersion: f.row.parserVersion, epoch });
  f.index.semanticRecords.mockResolvedValue([f.record]);
  f.model.document.mockClear(); f.index.putSemantic.mockClear();
  await f.prepare();
  expect(f.model.document).not.toHaveBeenCalled();
  expect(f.index.putSemantic).not.toHaveBeenCalled();
});

it.each(["abort", "owner"])("rejects a late model result after %s changes", async change => {
  const f = fixture();
  let current = true;
  f.model.document.mockImplementation(async () => {
    if (change === "abort") f.abort.abort();
    else current = false;
    return { complete: true, chunks: f.record.chunks };
  });
  await expect(f.prepare(() => { if (!current) throw Error("owner-changed"); })).rejects.toThrow();
  expect(f.index.putSemantic).not.toHaveBeenCalled();
});

it("preserves partial storage failure and excludes mismatched current hashes", async () => {
  const f = fixture();
  f.index.putSemantic.mockResolvedValue(false);
  expect(await f.prepare()).toEqual({ prepared: 0, scanned: 1, partial: true });
  f.index.readPath.mockResolvedValue({ ...f.row, hash: "b".repeat(64) });
  f.model.document.mockClear();
  expect(await f.prepare()).toEqual({ prepared: 0, scanned: 0, partial: true });
  expect(f.model.document).not.toHaveBeenCalled();
});

it("passes abort to the delayed storage guard and preserves the previous valid cache", async () => {
  const f = fixture();
  const previous = f.record;
  const saved: Parameters<SemanticSourceIndex["putSemantic"]>[0][] = [previous];
  const changed = "b".repeat(64);
  let writes = 0;
  f.index.readPath.mockResolvedValue({ ...f.row, hash: changed });
  f.index.semanticRecords.mockResolvedValue(saved);
  f.index.putSemantic.mockImplementation(async (record, check) => {
    await Promise.resolve();
    f.abort.abort();
    check?.();
    saved[0] = record;
    writes++;
    return true;
  });
  await expect(prepareSemanticSource(f.runtime, scope, { ...snapshot, documents: [{ ...document, sha256: changed }] }, epoch, f.model, f.abort.signal, () => {}, () => {})).rejects.toMatchObject({ name: "AbortError" });
  expect(writes).toBe(0);
  expect(saved).toEqual([previous]);
});

it("keeps an already committed cache but rejects cancellation before publishing progress", async () => {
  const f = fixture();
  const saved: Parameters<SemanticSourceIndex["putSemantic"]>[0][] = [];
  const progress = vi.fn();
  f.index.putSemantic.mockImplementation(async (record, check) => {
    check?.();
    saved.push(record);
    f.abort.abort();
    return true;
  });
  await expect(prepareSemanticSource(f.runtime, scope, snapshot, epoch, f.model, f.abort.signal, () => {}, progress)).rejects.toMatchObject({ name: "AbortError" });
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ hash: document.sha256, epoch });
  expect(progress).not.toHaveBeenCalled();
});

it("matches using only the supplied index and rejects epoch changes after scoring", async () => {
  const f = fixture();
  const query = confirmSemanticQuery({ ...inferFindRequest("text"), month: "all" }, "text", true, 2026);
  f.index.semanticRecords.mockResolvedValue([f.record]);
  const match = () => semanticSourceMatches({ createIndex: f.runtime.createIndex }, scope, snapshot, query, f.model, f.abort.signal, () => {});
  expect((await match()).documents).toMatchObject([{ path: document.path, retrieval: { score: 0.95 } }]);
  expect(f.index.readPath).toHaveBeenCalledExactlyOnceWith(scope, document.path);
  f.index.semanticEpoch.mockResolvedValueOnce(epoch).mockResolvedValueOnce({ ...epoch, scope: "cleared" });
  await expect(match()).rejects.toThrow("storage-changed");
});

it.each(["empty-records", "low-score", "evidence", "epoch"])("rejects a late matching result after abort during %s", async boundary => {
  const f = fixture();
  const query = confirmSemanticQuery({ ...inferFindRequest("text"), month: "all" }, "text", true, 2026);
  f.index.semanticRecords.mockResolvedValue([f.record]);
  if (boundary === "empty-records") f.index.semanticRecords.mockImplementation(async () => { f.abort.abort(); return []; });
  if (boundary === "low-score") f.model.score.mockImplementation(async () => { f.abort.abort(); return [{ index: 0, score: 0.1, start: 0, end: 4 }]; });
  if (boundary === "evidence") f.model.evidence.mockImplementation(async () => { f.abort.abort(); return { kind: "matched", dates: [], evidence: ["text"] }; });
  if (boundary === "epoch") f.index.semanticEpoch.mockResolvedValueOnce(epoch).mockImplementationOnce(async () => { f.abort.abort(); return epoch; });
  await expect(semanticSourceMatches({ createIndex: f.runtime.createIndex }, scope, snapshot, query, f.model, f.abort.signal, () => {})).rejects.toMatchObject({ name: "AbortError" });
});

it("SEM-04 resets confirmation when filters or scope change and never searches without confirmation", async () => {
  const read = vi.fn();
  const controller = new DocumentFindController(read, undefined, () => 2026);
  controller.start("빵이 커지는 이유");
  controller.configure({ terms: "", month: "all" });
  controller.configureSemantic({ enabled: true, confirmed: true });
  controller.configure({ formats: "md" });
  expect(controller.getSnapshot().semantic.confirmed).toBe(false);
  await controller.search();
  expect(read).not.toHaveBeenCalled();
  controller.configureSemantic({ confirmed: true });
  controller.setScope(["조리"]);
  expect(controller.getSnapshot().semantic.confirmed).toBe(false);
});
