import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
const path = ".omx/verification/search-rag-followup-20261115/frozen-quality.json";
assert.ok(!existsSync(path), "Do not replace a frozen calibration run");
const files = ["tests/fixtures/local-rag-search-v1.json", "tests/fixtures/local-rag-search-v2.json", "tests/fixtures/local-rag-search-v3.json"];
const fixture = JSON.parse(readFileSync(files[2], "utf8"));
const documents = new Map(fixture.documents.map(doc => [doc.id, doc]));
assert.equal(documents.size, fixture.documents.length);
const families = new Map();
for (const query of fixture.queries) {
  assert.ok(!families.has(query.family) || families.get(query.family) === query.split);
  families.set(query.family, query.split);
  assert.ok(query.relevant.every(id => documents.get(id)?.family === query.family && !query.forbidden.includes(id)));
  assert.ok(query.forbidden.every(id => documents.has(id)));
}
writeFileSync(path, JSON.stringify({ frozenAt: new Date().toISOString(), seed: fixture.seed, threshold: 0.85, files: Object.fromEntries(files.map(file => [file, createHash("sha256").update(readFileSync(file)).digest("hex")])), comparison: ["metadata", "body-only"], acceptance: "Choose on dev only: no recall/MRR drop, no forbidden or empty-question false-positive increase, at least one strict improvement. If no dev winner, keep metadata. Evaluate new holdout once after decision, do not retune. Existing v2 holdout is regression only." }, null, 2));
console.log("Frozen new corpus, family splits, answer sets and selection rule");
