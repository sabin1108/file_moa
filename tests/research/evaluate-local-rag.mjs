import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.resolve("vitest"));
const experiment = createRequire(resolve(".omx/experiments/local-rag/package.json"));
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
const { default: MiniSearch } = await import(pathToFileURL(experiment.resolve("minisearch")).href);
const fixturePath = "tests/fixtures/local-rag-search-v1.json";
const fixtureBytes = readFileSync(fixturePath);
const fixture = JSON.parse(fixtureBytes);
const output = resolve(process.argv[2] ?? ".omx/verification/local-rag-20261115/evaluation");
mkdirSync(output, { recursive: true });
assert.equal(new Set(fixture.documents.map(doc => doc.id)).size, fixture.documents.length);
assert.ok(fixture.queries.every(query => [...query.relevant, ...query.forbidden].every(id => fixture.documents.some(doc => doc.id === id))));
const baselineSource = execFileSync("git", ["show", "3d251c0:apps/web/src/features/local-folders/search/documents/document-find.ts"], { encoding: "utf8" });
const baselineId = resolve("apps/web/src/features/local-folders/search/documents/__baseline-find.ts").replaceAll("\\", "/");
const server = await createServer({
  configFile: false, root: resolve("apps/web"), logLevel: "error",
  plugins: [{ name: "baseline", resolveId: id => id === baselineId ? baselineId : undefined, load: id => id === baselineId ? baselineSource : undefined }],
});
try {
  const current = await server.ssrLoadModule("/src/features/local-folders/search/documents/document-find.ts");
  const ranking = await server.ssrLoadModule("/src/features/local-folders/search/documents/document-find-ranking.ts");
  const baseline = await server.ssrLoadModule(baselineId);
  const docs = fixture.documents.map(doc => ({ ...doc, name: doc.path.at(-1), folder: doc.path.slice(0, -1).join(" / ") }));
  const tokenize = value => value.toLocaleLowerCase("ko").match(/\.[a-z][a-z0-9.]*|[가-힣a-z0-9_]+(?:[.+][가-힣a-z0-9_]+)*(?:\+\+|#)?/gu) ?? [];
  const beforeMemory = process.memoryUsage().heapUsed;
  const started = performance.now();
  const mini = new MiniSearch({ fields: ["name", "folder", "text"], storeFields: ["id"], tokenize, searchOptions: { boost: { name: 4, folder: 2, text: 1 }, combineWith: "AND" } });
  mini.addAll(docs.map(doc => ({ ...doc, text: doc.metadataOnly ? "" : doc.text })));
  const indexMs = performance.now() - started;
  const indexBytes = Buffer.byteLength(JSON.stringify(mini));
  const memoryBytes = process.memoryUsage().heapUsed - beforeMemory;
  const rows = [];
  for (const item of fixture.queries) {
    const queryFor = module => module.confirmFindQuery(module.inferFindRequest(item.raw, 2026), false, 2026);
    const retrieve = (module, query) => ranking.rankFindDocuments(docs.flatMap(doc => {
      const finding = module.findTextEvidence(doc.metadataOnly ? "" : doc.text, query, undefined, doc);
      return finding ? [{ name: doc.name, path: doc.path, finding, id: doc.id }] : [];
    })).map(doc => doc.id);
    let old = [], next = [], miniIds = [], issue = null;
    const begin = performance.now();
    try { old = retrieve(baseline, queryFor(baseline)); } catch { /* Invalid old queries remain misses. */ }
    try {
      const q = queryFor(current);
      next = retrieve(current, q);
      // The engine proposes candidates; the same hard conditions and source evidence remain authoritative.
      miniIds = mini.search(q.terms.join(" "), { prefix: true, fuzzy: 0.15 }).map(result => String(result.id))
        .filter(id => docs.some(doc => doc.id === id && current.findTextEvidence(doc.metadataOnly ? "" : doc.text, q, undefined, doc)));
    } catch (error) { issue = error.message; }
    rows.push({ ...item, baseline: old.slice(0, 5), local: next.slice(0, 5), minisearch: miniIds.slice(0, 5), lexicalMs: performance.now() - begin, issue });
  }
  const metrics = key => Object.fromEntries(["dev", "holdout"].map(split => {
    const samples = rows.filter(row => row.split === split);
    const positive = samples.filter(row => row.relevant.length);
    return [split, {
      queries: samples.length,
      recallAt5: positive.reduce((sum, row) => sum + row[key].filter(id => row.relevant.includes(id)).length / row.relevant.length, 0) / positive.length,
      mrr: positive.reduce((sum, row) => { const rank = row[key].findIndex(id => row.relevant.includes(id)); return sum + (rank < 0 ? 0 : 1 / (rank + 1)); }, 0) / positive.length,
      forbidden: samples.reduce((sum, row) => sum + row[key].filter(id => row.forbidden.includes(id)).length, 0),
      emptyFalsePositives: samples.filter(row => !row.relevant.length).reduce((sum, row) => sum + row[key].length, 0),
    }];
  }));
  const result = {
    source: fixture.source, seed: fixture.seed, fixtureSha256: createHash("sha256").update(fixtureBytes).digest("hex"),
    condition: "Small authored dev/holdout pilot frozen before comparison; not independent public benchmark or personal corpus. MiniSearch uses identical hard-condition verification; no app dependency was installed. Node embedding is not browser CPU/memory evidence.",
    node: process.version, minisearch: { version: "7.2.0", indexMs, indexBytes, memoryBytes, esmBytes: statSync(experiment.resolve("minisearch")).size },
    metrics: { baseline: metrics("baseline"), local: metrics("local"), minisearch: metrics("minisearch") }, rows,
  };
  writeFileSync(resolve(output, "lexical.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ metrics: result.metrics, minisearch: result.minisearch }));

  if (process.argv.includes("--embedding")) {
    const transformersModule = await import(pathToFileURL(experiment.resolve("@huggingface/transformers")).href);
    const { pipeline, env } = transformersModule.default ?? transformersModule;
    env.cacheDir = resolve(".omx/experiments/local-rag/models");
    const fetchOriginal = globalThis.fetch;
    const downloads = [];
    globalThis.fetch = async (input, init) => {
      assert.ok(["GET", "HEAD"].includes(init?.method ?? "GET"), "Model experiment only downloads public model assets");
      const response = await fetchOriginal(input, init);
      downloads.push({ url: String(input), bytes: Number(response.headers.get("content-length")) || null, status: response.status });
      return response;
    };
    const before = process.memoryUsage().rss;
    const start = performance.now();
    const extractor = await pipeline("feature-extraction", "Xenova/multilingual-e5-small", { revision: "761b726dd34fb83930e26aab4e9ac3899aa1fa78", dtype: "int8" });
    const loadMs = performance.now() - start;
    const embed = async text => Array.from((await extractor(text, { pooling: "mean", normalize: true })).data);
    const passages = [];
    const indexStart = performance.now();
    for (const doc of docs.filter(doc => !doc.metadataOnly)) passages.push({ id: doc.id, vector: await embed(`passage: ${doc.name}\n${doc.folder}\n${doc.text}`) });
    const embeddingIndexMs = performance.now() - indexStart;
    const times = [];
    for (const row of rows) {
      const time = performance.now();
      const vector = await embed(`query: ${row.raw}`);
      const scored = passages.map(doc => ({ id: doc.id, score: doc.vector.reduce((sum, value, i) => sum + value * vector[i], 0) })).sort((a, b) => b.score - a.score);
      row.semantic = scored.slice(0, 5).map(doc => doc.id);
      row.semanticScores = scored.slice(0, 5);
      // A semantic score never removes the mandatory lexical targets or explicit conditions.
      const confirmed = current.confirmFindQuery(current.inferFindRequest(row.raw, 2026), false, 2026);
      row.guardedSemantic = row.semantic.filter(id => {
        const doc = docs.find(doc => doc.id === id);

        return doc && current.findTextEvidence(doc.text, confirmed, undefined, doc);
      });
      const fused = new Map();
      for (const list of [row.local, row.guardedSemantic]) list.forEach((id, rank) => fused.set(id, (fused.get(id) ?? 0) + 1 / (60 + rank + 1)));
      row.hybrid = [...fused].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([id]) => id);
      times.push(performance.now() - time);
    }
    const semantic = { ...result, metrics: { ...result.metrics, semantic: metrics("semantic"), guardedSemantic: metrics("guardedSemantic"), hybrid: metrics("hybrid") }, embedding: {
      model: "Xenova/multilingual-e5-small", revision: "761b726dd34fb83930e26aab4e9ac3899aa1fa78", dtype: "int8", loadMs, indexMs: embeddingIndexMs,
      rssDeltaBytes: process.memoryUsage().rss - before, vectorBytes: passages.reduce((sum, doc) => sum + doc.vector.length * 4, 0), times, downloads,
      scope: "Node CPU pilot on short synthetic passages, no document/query upload. No browser performance or long-document chunk claim.",
    } };
    writeFileSync(resolve(output, "semantic.json"), JSON.stringify(semantic, null, 2));
    await extractor.dispose();
    console.log(JSON.stringify({ semantic: semantic.metrics.semantic, guarded: semantic.metrics.guardedSemantic, loadMs, embeddingIndexMs }));
  }
} finally { await server.close(); }
