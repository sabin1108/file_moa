import type { FindableSnapshot, FindDocument } from "../documents/document-find";
import { LocalTextIndex, LOCAL_TEXT_INDEX_VERSION, type LocalTextIndexEntry } from "../documents/local-text-index";
import { SEMANTIC_MODEL } from "./model-assets";
import { SEMANTIC_MIN_SCORE, type SemanticFindQuery } from "./semantic-query";
import { semanticRecordId, type SemanticEpoch, type SemanticRecord } from "./semantic-record";
import type { SemanticModelController } from "./semantic-model-controller";

type Scope = { owner: string; workspace: string; connection: string };
async function currentTexts(index: LocalTextIndex, scope: Scope, snapshot: FindableSnapshot, check: () => void, signal: AbortSignal) {
  const rows: LocalTextIndexEntry[] = [];
  // Read only this snapshot's paths; a small selection must not clone the entire connection's text cache.
  for (const document of snapshot.documents) {
    check();
    signal.throwIfAborted();
    const row = await index.readPath(scope, document.path);
    check();
    signal.throwIfAborted();
    if (row?.hash === document.sha256 && row.metadata) rows.push(row);
  }
  return rows;
}

export async function prepareSemanticSource(scope: Scope, snapshot: FindableSnapshot, epoch: SemanticEpoch, model: SemanticModelController, signal: AbortSignal, check: () => void, progress: (count: number) => void) {
  const index = new LocalTextIndex();
  const rows = await currentTexts(index, scope, snapshot, check, signal);
  const previous = await index.semanticRecords(scope);
  const previousByPath = new Map(previous.map(record => [record.pathKey, record]));
  let prepared = 0;
  let partial = !snapshot.complete || rows.length < snapshot.documents.length;
  for (const row of rows) {
    check();
    if (signal.aborted) throw new DOMException("Semantic cancelled", "AbortError");
    if (!row.text.trim()) continue;
    const old = previousByPath.get(JSON.stringify(row.path));
    if (old?.hash === row.hash) { prepared++; partial ||= !old.complete; progress(prepared); continue; }
    const result = await model.document(row.text, row.path.at(-1)!, row.path.slice(0, -1).join("/"), signal);
    check();
    const value = { ...scope, path: row.path, pathKey: JSON.stringify(row.path), hash: row.hash, parserVersion: LOCAL_TEXT_INDEX_VERSION, model: SEMANTIC_MODEL.version };
    const record: SemanticRecord = { ...value, id: semanticRecordId(value), epoch, textLength: row.text.length, ...result, updatedAt: Date.now() };
    if (!await index.putSemantic(record, check)) { partial = true; break; }
    prepared++;
    partial ||= !result.complete;
    progress(prepared);
  }
  check();
  const current = await index.semanticEpoch(scope);
  check();
  if (signal.aborted || current.scope !== epoch.scope || current.model !== epoch.model) throw new Error("semantic-storage-changed");
  return { prepared, partial, scanned: rows.length };
}

export async function semanticSourceMatches(scope: Scope, snapshot: FindableSnapshot, query: SemanticFindQuery, model: SemanticModelController, signal: AbortSignal, check: () => void) {
  const index = new LocalTextIndex();
  const epoch = await index.semanticEpoch(scope);
  const currentByPath = new Map(snapshot.documents.map(document => [JSON.stringify(document.path), document]));
  const records = await index.semanticRecords(scope);
  check();
  const usable = records.filter(record => {
    return currentByPath.get(record.pathKey)?.sha256 === record.hash;
  });
  if (!usable.length) return { documents: [] as FindDocument[], notice: "이 범위에서 현재 내용과 일치하는 의미 검색 자료가 없어요. ‘선택 범위 준비’를 실행해 주세요. 기본 검색 결과를 표시합니다." };
  const scores = await model.score(query.semantic.meaning, usable.map(record => record.chunks), signal);
  check();
  const documents: FindDocument[] = [];
  let missingText = false;
  for (const { index: position, score, start, end } of scores) {
    if (score < SEMANTIC_MIN_SCORE) continue;
    const record = usable[position];
    const row = await index.readPath(scope, record.path);
    check();
    signal.throwIfAborted();
    if (!row?.metadata || row.hash !== record.hash || row.text.length !== record.textLength) { missingText = true; continue; }
    const name = row.path.at(-1)!;
    const finding = await model.evidence({ text: row.text, query, lastModified: row.metadata.lastModified, source: { name, path: row.path }, score, start, end }, signal);
    check();
    if (finding) documents.push({ name, path: row.path, finding, contentAvailable: true, ...(row.metadata?.ocr ? { ocr: true } : {}), retrieval: { kind: "semantic", score, start, end, partial: !record.complete } });
  }
  check();
  const current = await index.semanticEpoch(scope);
  check();
  if (current.scope !== epoch.scope || current.model !== epoch.model) throw new Error("semantic-storage-changed");
  return { documents, notice: `현재 내용과 일치하는 ${usable.length}개 자료에 의미 검색을 적용했어요.${missingText || usable.some(record => !record.complete) || usable.length < snapshot.documents.length || !snapshot.complete ? " 일부 자료나 본문은 준비 범위에 포함되지 않았어요." : ""} 의미가 비슷한 후보는 원문 근거를 확인해 주세요.` };
}
