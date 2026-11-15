import { LocalTextIndex } from "../../src/features/local-folders/search/documents/local-text-index";
import { SEMANTIC_MODEL } from "../../src/features/local-folders/search/semantic/model-assets";
import { semanticRecordId, type SemanticEpoch } from "../../src/features/local-folders/search/semantic/semantic-record";

/** Invoked in a real browser by the Ego harness; it only deletes its randomly named test database. */
export async function checkSemanticStorage() {
  const name = `moa-semantic-test-${crypto.randomUUID()}`;
  const index = new LocalTextIndex(name);
  const scope = { owner: "synthetic-a", workspace: "w", connection: "c" };
  const other = { ...scope, owner: "synthetic-b" };
  const checks: string[] = [];
  const check = (condition: boolean, label: string) => { if (!condition) throw new Error(label); checks.push(label); };
  const vector = new Float32Array(384); vector[0] = 1;
  const record = (path: string, epoch: SemanticEpoch, chunks = 1, key = scope) => {
    const value = { ...key, path: [path], pathKey: JSON.stringify([path]), hash: "a".repeat(64), parserVersion: 2, model: SEMANTIC_MODEL.version };
    return { ...value, id: semanticRecordId(value), epoch, textLength: chunks, complete: true, chunks: Array.from({ length: chunks }, (_, i) => ({ start: i, end: i + 1, vector })), updatedAt: 1 };
  };
  const save = async (row: ReturnType<typeof record>) => {
    await index.put({ owner: row.owner, workspace: row.workspace, connection: row.connection, path: row.path, hash: row.hash, parserVersion: row.parserVersion }, "x".repeat(row.textLength));
    return index.putSemantic(row);
  };
  try {
    const epoch = await index.semanticEpoch(scope);
    check(await save(record("a.md", epoch)), "scoped write");
    check((await index.semanticRecords(other)).length === 0, "owner isolation");
    const bEpoch = await index.semanticEpoch(other);
    check(await save(record("b.md", bEpoch, 1, other)), "other owner write");
    await index.clear(scope);
    check(!(await save(record("late.md", epoch))), "clear rejects late completion even after a new read refreshes the body cache");
    check((await index.semanticRecords(other)).length === 1, "clear preserves other owner");
    const after = await index.semanticEpoch(scope);
    check(await save(record("a.md", after)), "new preparation after clear");
    await index.invalidateSemanticModel();
    check(!(await save(record("late.md", after))), "model deletion rejects late completion with a current body cache");
    check((await index.semanticRecords(other)).length === 0, "model deletion clears all derived vectors");
    const full = await index.semanticEpoch(scope);
    for (let i = 0; i < 64; i++) check(await save(record(`${i}.md`, full, 64)), `chunk capacity write ${i}`);
    check(!(await save(record("overflow.md", full))), "4096 chunk cap rejects overflow with a current body cache");
    check((await index.semanticStatus(scope)).chunks === 4096, "cap preserves committed records");
    const readMs: number[] = [];
    const longTasks: number[] = [];
    const observer = new PerformanceObserver(list => { longTasks.push(...list.getEntries().map(entry => entry.duration)); });
    observer.observe({ type: "longtask" });
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      await index.semanticRecords(scope);
      readMs.push(performance.now() - start);
    }
    await new Promise(resolve => setTimeout(resolve, 0));
    observer.disconnect();
    await index.clear(scope);
    const countEpoch = await index.semanticEpoch(scope);
    for (let i = 0; i < 500; i++) if (!await save(record(`${i}.md`, countEpoch))) throw new Error("document capacity early rejection");
    check(!(await save(record("501.md", countEpoch))), "500 document cap with a current body cache");
    check((await index.semanticStatus(scope)).documents === 500, "document count stable");
    const old = record("0.md", countEpoch);
    const changed = { ...old, hash: "b".repeat(64) };
    check(await save({ ...changed, id: semanticRecordId(changed) }), "same-path new hash replaces at cap");
    check((await index.semanticStatus(scope)).documents === 500, "replacement does not grow count");
    await index.retainSemantic(scope, [["0.md"]], () => {});
    check((await index.semanticStatus(scope)).documents === 1, "complete scope refresh prunes deleted vector paths and statistics");
    check(!(await index.putSemantic(old)), "older preparation cannot replace the vector for a newer cached source hash");
    return { checks, maxCapacityReadMs: readMs, mainLongTasksMs: longTasks };
  } finally {
    await new Promise<void>((resolve, reject) => { const request = indexedDB.deleteDatabase(name); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); });
  }
}
