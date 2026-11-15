import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";

const output = resolve(".omx/verification/search-rag-strengthening-20261115");
mkdirSync(output, { recursive: true });
assert.ok(!readdirSync(output).includes("frozen.json"), "Preserve existing frozen run; use a fresh directory for a new run");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const fixture = JSON.parse(readFileSync("tests/fixtures/local-rag-search-v2.json", "utf8"));
const ids = new Set(fixture.documents.map(doc => doc.id));
assert.equal(ids.size, fixture.documents.length);
const families = {};
for (const query of fixture.queries) {
  assert.ok(query.relevant.every(id => ids.has(id) && !query.forbidden.includes(id)));
  assert.ok(query.forbidden.every(id => ids.has(id)));
  assert.ok(!families[query.family] || families[query.family] === query.split, "Family cannot cross splits");
  families[query.family] = query.split;
  assert.ok(query.relevant.every(id => fixture.documents.find(doc => doc.id === id).family === query.family));
}
const base = "https://web-eight-rho-72.vercel.app";
const bootstraps = {};
const observations = JSON.parse(readFileSync(resolve(output, "deployed-bootstrap-observation.json"), "utf8"));
for (const observation of observations) {
  const source = await (await fetch(observation.script)).text();
  for (const match of source.matchAll(/\.f\("([^"]*turbopack-worker[^"]*)",(\[[^\]]+\])/g)) {
    const chunks = JSON.parse(match[2]);
    const code = (await Promise.all(chunks.map(async path => {
      const response = await fetch(`${base}/_next/${path}`);
      assert.equal(response.status, 200);
      return response.text();
    }))).join("\n");
    const kind = code.includes("excerptHash") && code.includes("self.onmessage") ? "snapshot" : code.includes("semantic-asset-integrity") && code.includes("self.onmessage") ? "semantic" : null;
    if (kind) bootstraps[kind] = { entry: match[1], chunks };
  }
}
assert.ok(bootstraps.snapshot && bootstraps.semantic, "Find both deployed production Workers");
const deployed = [];
for (const path of [...new Set(Object.values(bootstraps).flatMap(value => [value.entry, ...value.chunks]))]) {
  const deployedPath = path;
  const response = await fetch(`${base}/_next/${deployedPath}`);
  assert.equal(response.status, 200, `Deployed asset ${path}`);
  const remote = new Uint8Array(await response.arrayBuffer());
  deployed.push({ path, deployedPath, bytes: remote.length, sha256: sha(remote), cacheControl: response.headers.get("cache-control") });
}
const frozen = { createdAt: new Date().toISOString(), base, bootstraps, deployed, seed: fixture.seed, threshold: 0.85, counts: { documents: fixture.documents.length, queries: fixture.queries.length }, files: Object.fromEntries(["tests/fixtures/local-rag-search-v1.json", "tests/fixtures/local-rag-search-v2.json", "docs/reports/모아_기술_선택과_개발_전체_기록.md", "docs/reports/모아_전체_자료_원문과_Codex_인수인계.md"].map(path => [path, { sha256: sha(readFileSync(path)), bytes: readFileSync(path).length }])) };
writeFileSync(resolve(output, "frozen.json"), JSON.stringify(frozen, null, 2));
await import("./bundle-search-strengthening.mjs");
console.log(JSON.stringify({ frozen: true, deployedAssetsFrozen: deployed.length, counts: frozen.counts, output }));
