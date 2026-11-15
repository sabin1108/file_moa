import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
const dir = ".omx/verification/search-rag-strengthening-20261115";
const read = name => JSON.parse(readFileSync(`${dir}/${name}.json`, "utf8"));
const frozen = read("frozen");
for (const file of ["tests/fixtures/local-rag-search-v1.json", "tests/fixtures/local-rag-search-v2.json"]) assert.equal(createHash("sha256").update(readFileSync(file)).digest("hex"), frozen.files[file].sha256, "Frozen corpus preserved");
const quality = read("quality-local");
assert.equal(quality.phase, "done");
assert.equal(quality.result.rows.length, 20);
assert.equal(quality.result.threshold, 0.85);
const wrapped = read("cache-wrapped-worker");
const cost = read("cache-native");
const live = read("production-rag-answer");
assert.equal(live.waitError, null);
assert.equal(live.probe.actionRequests.length, 1);
assert.equal(live.probe.actionRequests[0].approvedQuestion, true);
assert.equal(live.probe.actionRequests[0].approvedExcerpt, true);
assert.equal(live.probe.actionRequests[0].status, 200);
assert.ok(live.probe.responseModels.includes("gpt-6-luna"));
assert.deepEqual(live.quotes, ["가온센터 이력서 양식과 지원 경험"]);
assert.equal(read("production-citation").body, live.quotes[0]);
assert.ok(live.probe.workerFiles.every(name => name === "가온센터 이력서.md"));
const cleanup = read("cleanup");
assert.equal(cleanup.originalConnectionsAndActiveFlagsPreserved, true);
assert.equal(cleanup.syntheticFolderRemoved, true);
assert.equal(cost.phase, "done");
assert.equal(cost.result.samples.length, 224);
for (const row of cost.result.samples) {
  assert.ok(!row.issue);
  assert.match(row.hash, /^[a-f0-9]{64}$/u);
  assert.match(row.excerptHash, /^[a-f0-9]{64}$/u);
  assert.ok(row.excerpt.includes(row.run % 2 ? "BetaEvidence" : "AlphaEvidence"));
  assert.equal(row.cacheHit, row.mode === "hash-cache" && row.phase === "unchanged");
  if (row.mode === "no-cache") assert.equal(row.derivedReads + row.derivedWrites, 0);
}
const statistic = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return { n: values.length, median: sorted.length % 2 ? sorted[Math.floor(sorted.length / 2)] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2, mean, populationVariance: values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length, min: sorted[0], max: sorted.at(-1) };
};
const groups = new Map();
for (const row of cost.result.samples) {
  const key = JSON.stringify([row.name, row.lifetime, row.changes, row.phase, row.mode]);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(row);
}
const summary = {
  quality: quality.result.metrics,
  qualityFailures: quality.result.rows.flatMap(row => {
    const missed = row.relevant.filter(id => !row.optional.includes(id));
    const forbidden = row.optional.filter(id => row.forbidden.includes(id));
    return missed.length || forbidden.length || row.localError ? [{ id: row.id, raw: row.raw, missed, forbidden, localError: row.localError, actual: row.optional }] : [];
  }),
  cost: [...groups].map(([key, rows]) => ({ condition: JSON.parse(key), totalMs: statistic(rows.map(row => row.totalMs)), workerMs: statistic(rows.map(row => row.workerMs)), readIndexMs: statistic(rows.map(row => row.readIndexMs)), writeIndexMs: statistic(rows.map(row => row.writeIndexMs)) })),
  nativeRequests: cost.result.samples.length,
  sourceBytesRequested: cost.result.samples.reduce((sum, row) => sum + row.bytes, 0),
  derivedReads: cost.result.samples.reduce((sum, row) => sum + row.derivedReads, 0),
  derivedWrites: cost.result.samples.reduce((sum, row) => sum + row.derivedWrites, 0),
  logicalTextBytes: cost.result.statuses.reduce((sum, status) => sum + status.textBytes, 0),
  mdInstrumentedSupplement: wrapped.result.samples.filter(row => !row.issue).map(({ name, mode, probe }) => ({ name, mode, probe })),
  limits: ["Quality uses Vite local Worker, production semantic bootstrap probe remained without an initialized handler; no production semantic quality claim.", "Cost uses actual Vercel-hosted native snapshot Worker, synthetic in-memory File input, local-source LocalTextIndex helper and separate synthetic IDB database.", "Internal read/hash/decode calls observed only in wrapped MD supplement, not native PDF run; cacheHit directly observed for native run.", "Initial extraction cache empty is not cold HTTP cache or first model download. No first-visit/CDN billing, full peak RAM, disk bytes, energy, battery or server CPU measurement."]
};
for (const row of summary.mdInstrumentedSupplement) {
  assert.equal(row.probe.reads, 1);
  assert.equal(row.probe.hashes, 2);
}
writeFileSync(`${dir}/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ checks: "frozen corpora, 224 native snapshots/hashes/excerpts, changed-source invalidation, no-cache zero derived IO, 112 supplemental MD read/hash probes", stableWarm: summary.cost.filter(row => row.condition[2] === false && row.condition[3] === "unchanged").map(row => ({ condition: row.condition, medianMs: row.totalMs.median, variance: row.totalMs.populationVariance })), qualityFailures: summary.qualityFailures, logicalTextBytes: summary.logicalTextBytes }, null, 2));
