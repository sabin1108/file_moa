import { LocalTextIndex, LOCAL_TEXT_INDEX_VERSION } from "../../src/features/local-folders/search/documents/local-text-index";
import type { TextFileSnapshot } from "../../src/features/local-folders/content/copy-hash";

type Probe = { reads: number; bytes: number; hashes: number; decodes: number; readMs: number; hashMs: number; decodeMs: number };
type Reply = TextFileSnapshot & { probe?: Probe; issue?: string };

export function createSyntheticPdf(pages: number, revision: number) {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Kids [${Array.from({ length: pages }, (_, i) => `${4 + i * 2} 0 R`).join(" ")}] /Count ${pages} >>`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  for (let i = 0; i < pages; i++) {
    const stream = `BT /F1 10 Tf 20 100 Td (AlphaEvidence BetaEvidence revision${revision} page${i} ${"Synthetic source. ".repeat(200)}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 800 200] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => { offsets.push(body.length); body += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = body.length;
  return body + `xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets.slice(1).map(offset => String(offset).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
}

export async function compareCache(makeWorker: () => Worker, progress: (count: number, samples: unknown[]) => void) {
  const database = "synthetic-cache-equivalence-20261115-corrected";
  if ((await indexedDB.databases()).some(db => db.name === database)) throw Error("Preserve previous benchmark database");
  const index = new LocalTextIndex(database);
  const samples = [];
  for (const name of ["short.md", "long.md", "short.pdf", "long.pdf"]) {
    for (const lifetime of ["fresh", "reused"]) {
      for (const changes of [false, true]) {
        const scope = { owner: "synthetic", workspace: "cost", connection: `${name}-${lifetime}-${changes}` };
        const workers = new Map<string, Worker>();
        try {
          for (let run = 0; run < 7; run++) {
            const revision = changes ? Math.floor(run / 3) : 0;
            const body = name.endsWith("pdf") ? createSyntheticPdf(name.startsWith("long") ? 24 : 1, revision) : `AlphaEvidence ${"source notes ".repeat(name.startsWith("long") ? 45000 : 100)} BetaEvidence revision${revision}`;
            const file = new File([body], name, { lastModified: 100 + revision });
            const instruction = run % 2 ? "BetaEvidence" : "AlphaEvidence";
            const outputs: Reply[] = [];
            for (const mode of run % 2 ? ["hash-cache", "no-cache"] : ["no-cache", "hash-cache"]) {
              const start = performance.now();
              const cached = mode === "hash-cache" ? await index.readPath(scope, [name]) : undefined;
              const readIndexMs = performance.now() - start;
              const worker = lifetime === "reused" && workers.has(mode) ? workers.get(mode)! : makeWorker();
              if (lifetime === "reused") workers.set(mode, worker);
              const workerStart = performance.now();
              let content: Reply;
              try {
                content = await new Promise<Reply>((resolve, reject) => {
                  const timeout = setTimeout(() => reject(Error("snapshot-worker-timeout")), 30000);
                  worker.onmessage = (event: MessageEvent<Reply>) => { clearTimeout(timeout); resolve(event.data); };
                  worker.onerror = event => { clearTimeout(timeout); reject(Error(event.message)); };
                  worker.postMessage({ file, instruction, index: { ...scope, path: [name] }, ...(cached ? { cached } : {}) });
                });
              } finally { if (lifetime === "fresh") worker.terminate(); }
              const workerMs = performance.now() - workerStart;
              if (!content.issue && typeof content.fullText !== "string") throw Error("missing snapshot");
              const writeStart = performance.now();
              const shouldStore = mode === "hash-cache" && !content.issue && !content.cacheHit;
              if (shouldStore) await index.put({ ...scope, path: [name], hash: content.sha256, parserVersion: LOCAL_TEXT_INDEX_VERSION }, content.fullText!, () => {}, content.cacheMetadata);
              samples.push({ name, lifetime, changes, run, revision, mode, order: run % 2 ? "cache-first" : "no-cache-first", phase: run === 0 ? "initial" : changes && run % 3 === 0 ? "changed" : "unchanged", bytes: file.size, readIndexMs, workerMs, writeIndexMs: shouldStore ? performance.now() - writeStart : 0, totalMs: performance.now() - start, derivedReads: mode === "hash-cache" ? 1 : 0, derivedWrites: shouldStore ? 1 : 0, issue: content.issue, cacheHit: content.cacheHit, probe: content.probe, hash: content.sha256, excerpt: content.excerpt, excerptHash: content.excerptHash, textLength: content.fullText?.length ?? 0, pdf: content.pdf });
              outputs.push(content);
              progress(samples.length, samples);
            }
            if (outputs[0].sha256 !== outputs[1].sha256 || outputs[0].excerpt !== outputs[1].excerpt || outputs[0].excerptHash !== outputs[1].excerptHash || outputs[0].fullText !== outputs[1].fullText) throw Error("Unequal source/text/excerpt between arms");
          }
        } finally { workers.forEach(worker => worker.terminate()); }
      }
    }
  }
  const statuses = [];
  for (const name of ["short.md", "long.md", "short.pdf", "long.pdf"]) for (const lifetime of ["fresh", "reused"]) for (const changes of [false, true]) {
    statuses.push(await index.status({ owner: "synthetic", workspace: "cost", connection: `${name}-${lifetime}-${changes}` }));
  }
  return { environment: location.origin, userAgent: navigator.userAgent, database, samples, statuses, repetitions: 7, changingRuns: [3, 6], notes: "Alternating paired arms, identical File/query, 4 lengths/formats, fresh vs reused native deployed Worker. No-cache never calls derived index read/write. Hash-cache skips writes on a hit, matching source-snapshot.ts. Source File bytes are in memory, not OS disk. IDB helper bundled from current local source; Worker/cache boundary, not full source-snapshot freshness/permission flow or authenticated UI E2E. No internal read/hash/decode/extraction instrumentation in native run; cacheHit is returned by deployed Worker. Worker import/HTTP caches are not cleared; initial means per-condition extraction cache empty, not first network visit. Full RAM/power/battery/server CPU unmeasured." };
}
