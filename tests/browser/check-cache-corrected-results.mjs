import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const path = resolve(process.argv[2]);
const result = JSON.parse(readFileSync(path, "utf8"));
assert.equal(result.phase, "done");
const rows = result.result.samples;
assert.equal(rows.length, 224);
assert.equal(rows.reduce((sum, row) => sum + row.derivedWrites, 0), 32, "Product only stores 16 initial and 16 changed-source misses");
for (const row of rows) {
  assert.ok(!row.issue);
  assert.equal(row.derivedWrites, Number(row.mode === "hash-cache" && row.phase !== "unchanged"));
  assert.equal(row.derivedReads, Number(row.mode === "hash-cache"));
  assert.equal(row.cacheHit, row.mode === "hash-cache" && row.phase === "unchanged");
  assert.match(row.hash, /^[a-f0-9]{64}$/u);
  assert.match(row.excerptHash, /^[a-f0-9]{64}$/u);
  if (row.cacheHit) assert.equal(row.writeIndexMs, 0);
}
for (let i = 0; i < rows.length; i += 2) {
  assert.equal(rows[i].hash, rows[i + 1].hash);
  assert.equal(rows[i].excerptHash, rows[i + 1].excerptHash);
  assert.equal(rows[i].excerpt, rows[i + 1].excerpt);
}
const statistics = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return { n: values.length, median: sorted.length % 2 ? sorted[Math.floor(sorted.length / 2)] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2, mean, populationVariance: values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length, min: sorted[0], max: sorted.at(-1) };
};
const grouped = new Map();
for (const row of rows) {
  const key = JSON.stringify([row.name, row.lifetime, row.changes, row.phase, row.mode]);
  if (!grouped.has(key)) grouped.set(key, []);
  grouped.get(key).push(row);
}
const summary = { rows: rows.length, cacheReads: 112, cacheWrites: 32, cacheHits: 80, groups: [...grouped].map(([key, rows]) => ({ condition: JSON.parse(key), totalMs: statistics(rows.map(row => row.totalMs)), workerMs: statistics(rows.map(row => row.workerMs)), readIndexMs: statistics(rows.map(row => row.readIndexMs)), writeIndexMs: statistics(rows.map(row => row.writeIndexMs)) })), limits: result.result.notes };
writeFileSync(path.replace(/\.json$/u, "-summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ ...summary, groups: summary.groups.filter(row => row.condition[1] === "reused" && row.condition[2] === false && row.condition[3] === "unchanged") }, null, 2));
