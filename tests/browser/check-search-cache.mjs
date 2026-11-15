import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";

const require = createRequire(import.meta.resolve("vitest"));
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
const output = resolve(process.argv[2] ?? ".omx/verification/search-cache-20261115/current");
mkdirSync(output, { recursive: true });

// Instrument only this isolated test server; product messages and bundles have no telemetry.
const probe = `
const probe = { reads: 0, bytes: 0, readMs: 0, hashes: 0, hashMs: 0, decodes: 0, decodeMs: 0, extracts: 0, extractMs: 0 };
self.cacheProbe = probe;
const arrayBuffer = Blob.prototype.arrayBuffer;
Blob.prototype.arrayBuffer = async function () {
  const start = performance.now(); const bytes = await arrayBuffer.call(this);
  probe.reads++; probe.bytes += bytes.byteLength; probe.readMs += performance.now() - start; return bytes;
};
const digest = crypto.subtle.digest.bind(crypto.subtle);
crypto.subtle.digest = async (...args) => {
  const start = performance.now(); const result = await digest(...args);
  probe.hashes++; probe.hashMs += performance.now() - start; return result;
};
const decode = TextDecoder.prototype.decode;
TextDecoder.prototype.decode = function (...args) {
  const start = performance.now(); const result = decode.apply(this, args);
  probe.decodes++; probe.decodeMs += performance.now() - start; return result;
};
const post = self.postMessage.bind(self);
self.postMessage = value => { post({ ...value, probe: { ...probe } }); for (const key in probe) probe[key] = 0; };
`;
const server = await createServer({
  configFile: false, root: resolve("apps/web"), logLevel: "error",
  cacheDir: resolve(".omx/browser-cache/search-cache"),
  server: { host: "127.0.0.1", port: 0, fs: { allow: [resolve(".")] } },
  plugins: [{
    name: "cache-cost-probe", enforce: "pre",
    transform(code, id) {
      if (id.split("?")[0].replaceAll("\\", "/").endsWith("/copy-hash.worker.ts")) return probe + code;
      if (id.split("?")[0].replaceAll("\\", "/").endsWith("/pdf/pdf-text.ts")) {
        return code.replace("export async function extractPdfText", "async function extractPdfText") + `
export async function measuredPdf(...args: Parameters<typeof extractPdfText>) {
  const start = performance.now();
  try { return await extractPdfText(...args); }
  finally { const p = (self as unknown as { cacheProbe?: { extracts: number; extractMs: number } }).cacheProbe;
    if (p) { p.extracts++; p.extractMs += performance.now() - start; } }
}
export { measuredPdf as extractPdfText };`;
      }
    },
    configureServer(server) {
      server.middlewares.use("/__cache", (_request, response) => {
        response.setHeader("content-type", "text/html");
        response.end(`<html><body>Isolated synthetic cache verification<script type="module">
import { LocalTextIndex, LOCAL_TEXT_INDEX_VERSION, LOCAL_TEXT_DATABASE_VERSION } from "/src/features/local-folders/search/documents/local-text-index.ts";
import { createCopyHasher } from "/src/features/local-folders/content/copy-hash.ts";
window.cacheTest = { LocalTextIndex, version: LOCAL_TEXT_INDEX_VERSION, databaseVersion: LOCAL_TEXT_DATABASE_VERSION, createCopyHasher };
const listen = Worker.prototype.addEventListener;
const post = Worker.prototype.postMessage;
Worker.prototype.postMessage = function (...args) {
  if (!this.probed) { this.probed = true; listen.call(this, "message", event => { if (event.data.probe) window.lastProbe = event.data.probe; }); }
  return post.apply(this, args);
};
</script></body></html>`);
      });
    },
  }],
});
await server.listen();
const browser = await Browser.launch({ extraArgs: ["--disable-gpu", "--no-sandbox"] });
try {
  const page = await browser.newPage({ width: 900, height: 700 });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__cache`, { settleMs: 500 });
  const result = await page.eval(async () => {
    const { LocalTextIndex, version, createCopyHasher } = window.cacheTest;
    const index = new LocalTextIndex("synthetic-search-cache-cost");
    const scope = { owner: "synthetic", workspace: "measurement", connection: "fixture" };
    const stream = "BT /F1 12 Tf 20 100 Td (HelloPDF CacheEvidence) Tj ET";
    const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
    let pdf = "%PDF-1.4\n";
    const offsets = [];
    objects.forEach((object, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
    const xref = pdf.length;
    pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.map(n => String(n).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const files = [new File(["AlphaEvidence ".repeat(50_000) + " BetaEvidence"], "notes.md", { lastModified: 100 }), new File([pdf], "report.pdf", { lastModified: 100 })];
    const samples = [];
    for (const file of files) {
      for (let run = 0; run < 4; run++) {
        const reader = createCopyHasher();
        const start = performance.now();
        const cached = await index.readPath(scope, [file.name]);
        const readIndexMs = performance.now() - start;
        try {
          const readStart = performance.now();
          const content = await reader.readText(file, run % 2 ? "BetaEvidence" : "AlphaEvidence", undefined, { ...scope, path: [file.name] }, cached);
          const workerMs = performance.now() - readStart;
          const writeStart = performance.now();
          await index.put({ ...scope, path: [file.name], hash: content.sha256, parserVersion: version }, content.fullText, () => {}, {
            format: file.name.endsWith(".pdf") ? "pdf" : "text",
            size: file.size, lastModified: file.lastModified, ocrEnabled: false,
            ...(content.pdf ? { pdf: content.pdf } : {}), ...(content.ocr ? { ocr: content.ocr } : {}),
          });
          samples.push({ file: file.name, run, cached: !!cached, bytes: file.size, readIndexMs, writeIndexMs: performance.now() - writeStart, workerMs, totalMs: performance.now() - start, probe: window.lastProbe, excerpt: content.excerpt, hash: content.sha256 });
        } finally { reader.dispose(); }
      }
    }
    return { samples, version, userAgent: navigator.userAgent };
  });
  for (const sample of result.samples) {
    assert.equal(sample.probe.reads, 1, "Every cache hit must reread current source bytes");
    assert.equal(sample.probe.bytes, sample.bytes);
    assert.equal(sample.probe.hashes, 2, "Source and query-specific excerpt hashes are recomputed");
    assert.match(sample.hash, /^[a-f0-9]{64}$/u);
  }
  assert.ok(result.samples[1].excerpt.includes("BetaEvidence"));
  if (process.argv.includes("--expect-reuse")) {
    for (const sample of result.samples.filter(sample => sample.run > 0)) {
      assert.equal(sample.probe.decodes, 0, "Warm text cache avoids decode");
      assert.equal(sample.probe.extracts, 0, "Warm PDF cache avoids extraction");
    }
  }
  const boundaries = await page.eval(async () => {
    const { LocalTextIndex, version, databaseVersion } = window.cacheTest;
    const index = new LocalTextIndex("synthetic-cache-boundaries");
    const scope = { owner: "a", workspace: "w", connection: "c" };
    const key = { ...scope, path: ["note.md"], hash: "a".repeat(64), parserVersion: version };
    await index.put(key, "first");
    await index.put({ ...key, hash: "b".repeat(64) }, "replaced");
    const replaced = (await index.readPath(scope, key.path))?.text === "replaced";
    const isolation = await Promise.all(["owner", "workspace", "connection"].map(field => index.readPath({ ...scope, [field]: "other" }, key.path)));
    await index.put({ ...key, path: ["legacy.md"], parserVersion: version - 1 }, "legacy");
    const legacy = await index.readPath(scope, ["legacy.md"]);
    let cancelled = false;
    try { await index.retain(scope, [], () => { throw Error("cancelled"); }); } catch { cancelled = true; }
    const preserved = (await index.search(scope, "")).length === 1;
    await index.retain({ ...scope, owner: "other" }, []);
    const outsideRetain = !!await index.readPath(scope, key.path);

    const open = (name, version) => new Promise((resolve, reject) => {
      const request = indexedDB.open(name, version);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const db = await open("synthetic-cache-boundaries", databaseVersion);
    const corrupt = async (store, key, value) => new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put(value, ...(store === "stats" ? [key] : []));
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    const id = JSON.stringify([scope.owner, scope.workspace, scope.connection, key.path]);
    const scopeId = JSON.stringify([scope.owner, scope.workspace, scope.connection]);
    await corrupt("documents", undefined, { ...key, id, text: 42, updatedAt: 1 });
    const corruptRead = await index.readPath(scope, key.path) === undefined;
    let corruptWrite = false;
    try { await index.put(key, "repair"); } catch (error) { corruptWrite = error.message === "index-invalid-cache"; }
    await index.retain(scope, [key.path]);
    const repaired = (await index.search(scope, "")).length === 0;
    await index.put(key, "valid");
    await corrupt("stats", scopeId, { count: 1, bytes: NaN });
    let corruptStats = false;
    try { await index.put(key, "replacement"); } catch (error) { corruptStats = error.message === "index-invalid-cache"; }
    const failedWritePreserved = (await index.readPath(scope, key.path))?.text === "valid";
    await index.retain(scope, [key.path]);
    await index.put(key, "repaired stats");
    const statsRecovered = (await index.readPath(scope, key.path))?.text === "repaired stats";
    await new Promise((resolve, reject) => {
      const tx = db.transaction(["documents", "stats"], "readwrite");
      for (let i = 0; i < 499; i++) {
        const path = [`${i}.md`];
        tx.objectStore("documents").put({ ...key, path, text: "x", id: JSON.stringify([scope.owner, scope.workspace, scope.connection, path]), updatedAt: 1 });
      }
      tx.objectStore("documents").delete(JSON.stringify([scope.owner, scope.workspace, scope.connection, ["note.md"]]));
      tx.objectStore("documents").delete(JSON.stringify([scope.owner, scope.workspace, scope.connection, ["legacy.md"]]));
      tx.objectStore("stats").put({ count: 499, bytes: 998 }, JSON.stringify([scope.owner, scope.workspace, scope.connection]));
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    db.close();
    window.indexRace = { key, scope };

    const blockedName = "synthetic-cache-blocked";
    const held = await open(blockedName, 1);
    let blocked = false;
    try { await new LocalTextIndex(blockedName).readPath(scope, ["note.md"]); }
    catch (error) { blocked = error.message === "index-database-blocked"; }
    held.close();
    const upgraded = await Promise.race([open(blockedName, databaseVersion + 1), new Promise((_, reject) => setTimeout(() => reject(Error("Leaked blocked database connection")), 3000))]);
    upgraded.close();
    return { replaced, isolation: isolation.every(value => value === undefined), legacy: legacy === undefined, cancelled, preserved, outsideRetain, corruptRead, corruptWrite, repaired, corruptStats, failedWritePreserved, statsRecovered, blocked, blockedConnectionClosed: true };
  });
  for (const [name, passed] of Object.entries(boundaries)) assert.equal(passed, true, name);
  const second = await browser.newPage({ width: 900, height: 700 });
  await second.goto(`http://127.0.0.1:${server.httpServer.address().port}/__cache`, { settleMs: 300 });
  const racers = await Promise.all([page, second].map((tab, i) => tab.eval(async i => {
    const { LocalTextIndex, version } = window.cacheTest;
    const scope = { owner: "a", workspace: "w", connection: "c" };
    try {
      await new LocalTextIndex("synthetic-cache-boundaries").put({ ...scope, path: [`racer-${i}.md`], hash: "a".repeat(64), parserVersion: version }, "x");
      return "stored";
    } catch (error) { return error.message; }
  }, i)));
  assert.deepEqual(racers, ["stored", "stored"]);
  assert.equal(await page.eval(async () => (await new window.cacheTest.LocalTextIndex("synthetic-cache-boundaries").status({ owner: "a", workspace: "w", connection: "c" })).textCount), 500);
  boundaries.multiTabLimit = true;
  const catalog = await page.eval(async () => {
    const { LocalTextIndex, version, databaseVersion } = window.cacheTest;
    const scope = { owner: "a", workspace: "w", connection: "catalog" };
    const other = { ...scope, owner: "b" };
    const name = "synthetic-catalog-migration";
    const id = path => JSON.stringify([scope.owner, scope.workspace, scope.connection, path]);
    const old = await new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 2);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("documents", { keyPath: "id" }).createIndex("scope", ["owner", "workspace", "connection"]);
        request.result.createObjectStore("stats");
        request.result.createObjectStore("sentinel");
      };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = old.transaction(["documents", "stats", "sentinel"], "readwrite");
      tx.objectStore("documents").put({ ...scope, id: id(["legacy.md"]), path: ["legacy.md"], hash: "a".repeat(64), text: "legacy", parserVersion: version, updatedAt: 1 });
      tx.objectStore("stats").put({ count: 1, bytes: 12 }, JSON.stringify([scope.owner, scope.workspace, scope.connection]));
      tx.objectStore("sentinel").put("preserved", "test");
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    old.close();
    const index = new LocalTextIndex(name);
    const preserved = (await index.readPath(scope, ["legacy.md"]))?.text === "legacy";
    await index.observe(scope, { path: ["legacy.md"], size: 6, lastModified: 1, status: "indexed", hash: "a".repeat(64) });
    await index.observe(other, { path: ["other.docx"], size: 1, lastModified: 1, status: "unsupported" });
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open(name, databaseVersion); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    await new Promise((resolve, reject) => {
      const tx = db.transaction("catalog", "readwrite");
      tx.objectStore("catalog").put({ ...scope, id: "corrupt-row", path: [1n], status: "invalid", size: NaN, lastModified: null, updatedAt: "bad" });
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    const corruptHidden = (await index.catalog(scope)).length === 1 && (await index.status(scope)).catalogCount === 1;
    await index.retainCatalog(scope, [["legacy.md"]]);
    const repaired = await new Promise(resolve => { const request = db.transaction("catalog").objectStore("catalog").get("corrupt-row"); request.onsuccess = () => resolve(request.result === undefined); });
    let clearRejected = false;
    try { await index.clear(scope, () => { throw Error("cancelled"); }); } catch { clearRejected = true; }
    const clearRollback = clearRejected && (await index.status(scope)).textCount === 1 && (await index.status(scope)).catalogCount === 1;
    const put = IDBObjectStore.prototype.put;
    let quotaRejected = false;
    IDBObjectStore.prototype.put = function (...args) { if (this.name === "catalog") throw new DOMException("synthetic quota", "QuotaExceededError"); return put.apply(this, args); };
    try { await index.observe(scope, { path: ["quota.md"], size: 0, lastModified: 0, status: "listed" }); } catch { quotaRejected = true; }
    finally { IDBObjectStore.prototype.put = put; }
    const quotaPreserved = quotaRejected && (await index.status(scope)).catalogCount === 1;
    await index.clear(scope);
    const scopedClear = (await index.status(scope)).textCount === 0 && (await index.status(scope)).catalogCount === 0 && (await index.catalog(other)).length === 1;
    await new Promise((resolve, reject) => {
      const tx = db.transaction("catalog", "readwrite");
      for (let i = 0; i < 20_000; i++) {
        const path = [`${String(i).padStart(5, "0")}.md`];
        tx.objectStore("catalog").put({ ...scope, path, id: id(path), status: "listed", size: 0, lastModified: 0, updatedAt: i });
      }
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    await index.observe(scope, { path: ["new.md"], size: 0, lastModified: 0, status: "listed" });
    const rows = await index.catalog(scope);
    const bounded = rows.length === 20_000 && rows.some(file => file.path[0] === "new.md") && !rows.some(file => file.path[0] === "00000.md");
    const sentinel = await new Promise(resolve => { const request = db.transaction("sentinel").objectStore("sentinel").get("test"); request.onsuccess = () => resolve(request.result === "preserved"); });
    db.close();
    return { preserved, corruptHidden, repaired, clearRollback, quotaPreserved, scopedClear, bounded, sentinel };
  });
  for (const [name, passed] of Object.entries(catalog)) assert.equal(passed, true, "catalog: " + name);
  writeFileSync(resolve(output, "cost.json"), JSON.stringify({ ...result, boundaries, catalog, consoleErrors: page.consoleErrors, condition: "Synthetic in-memory Files, real Chromium Worker/PDF.js/IndexedDB and two-tab writer limit; fresh Worker each sample. Warm cache differs from warm Worker. Catalog migration/corruption/quota/scoped clear/cap checked. No physical disk, OS permissions, OCR execution, production-user latency or percentiles." }, null, 2));
  console.log(JSON.stringify(result.samples.map(({ file, run, totalMs, probe }) => ({ file, run, totalMs, ...probe })), null, 2));
} finally {
  await browser.close();
  await server.close();
}
