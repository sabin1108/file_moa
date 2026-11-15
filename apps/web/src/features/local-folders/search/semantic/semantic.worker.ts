import type { FeatureExtractionPipeline } from "@huggingface/transformers";
import { MODEL_ASSETS, RUNTIME_ASSETS, SEMANTIC_MODEL, installedMarker, modelAssetUrl, runtimeAssetUrl, semanticAsset, verifySemanticAsset } from "./model-assets";
import { SEMANTIC_LIMITS, isSemanticVector, semanticSimilarity, type SemanticChunk } from "./semantic-record";
import { semanticEvidence } from "./semantic-query";
import type { SemanticEvidenceInput } from "./semantic-model-controller";

let extractor: FeatureExtractionPipeline | null = null;
let allowDownload = false;
// Only fixed public asset URLs pass the guard below; this Worker never sends user text.
// eslint-disable-next-line no-restricted-properties
const nativeFetch = globalThis.fetch.bind(globalThis);
const origin = self.location.origin;
let cache: Cache;
let jobId = 0;
let lastProgress = 0;
function progress(file: string, total: number) {
  return (loaded: number, stage: "downloading" | "verifying") => {
    if (stage === "verifying" || performance.now() - lastProgress > 100) {
      lastProgress = performance.now();
      self.postMessage({ id: jobId, kind: "progress", file, total, loaded, stage });
    }
  };
}

// eslint-disable-next-line no-restricted-properties
globalThis.fetch = async (input, options) => {
  const request = new Request(input, options);
  const asset = semanticAsset(request.url, origin);
  if (!asset || !["GET", "HEAD"].includes(request.method)) throw new Error("semantic-network-blocked");
  if (request.url.startsWith(origin)) {
    const cached = await cache.match(request.url);
    if (cached?.headers.get("x-moa-sha256") === asset.sha256) return cached;
    if (!allowDownload) throw new Error("semantic-model-missing");
    const checked = await verifySemanticAsset(await nativeFetch(request.url, { credentials: "omit", referrerPolicy: "no-referrer", cache: "force-cache" }), asset, progress(asset.file, asset.bytes));
    await cache.put(request.url, checked.clone());
    return checked;
  }
  if (!allowDownload) throw new Error("semantic-model-missing");
  return verifySemanticAsset(await nativeFetch(request.url, { credentials: "omit", referrerPolicy: "no-referrer" }), asset, progress(asset.file, asset.bytes));
};

async function load(install: boolean, id: number) {
  jobId = id;
  cache ??= await caches.open(SEMANTIC_MODEL.cache);
  allowDownload = install;
  if (extractor) return extractor;
  const { env, pipeline } = await import("@huggingface/transformers");
  env.allowLocalModels = false;
  env.useBrowserCache = false;
  env.useFSCache = false;
  env.useCustomCache = true;
  env.customCache = {
    match: async (key: string) => {
      const asset = semanticAsset(key, origin);
      const response = await cache.match(key);
      return asset && response?.headers.get("x-moa-sha256") === asset.sha256 ? response : undefined;
    },
    put: async (key: string, response: Response) => {
      const asset = semanticAsset(key, origin);
      if (!allowDownload || !asset) throw new Error("semantic-network-blocked");
      self.postMessage({ id, kind: "progress", stage: "verifying", file: asset.file });
      if (response.headers.get("x-moa-sha256") !== asset.sha256 || response.headers.get("x-moa-bytes") !== String(asset.bytes)) throw new Error("semantic-asset-integrity");
      await cache.put(key, response);
    },
  };
  const wasm = env.backends.onnx.wasm;
  if (!wasm) throw new Error("semantic-runtime-unavailable");
  wasm.numThreads = 1;
  wasm.proxy = false;
  // eslint-disable-next-line no-restricted-globals
  if (install) for (const asset of RUNTIME_ASSETS) await fetch(runtimeAssetUrl(asset.file, origin));
  const runtimeModule = await cache.match(runtimeAssetUrl("ort-wasm-simd-threaded.jsep.mjs", origin));
  if (!runtimeModule) throw new Error("semantic-model-missing");
  // Dynamic module imports bypass fetch. Use the verified cache so cold offline inference needs no network.
  const moduleUrl = URL.createObjectURL(await runtimeModule.blob());
  wasm.wasmPaths = { mjs: moduleUrl, wasm: runtimeAssetUrl("ort-wasm-simd-threaded.jsep.wasm", origin) };
  const create = pipeline as unknown as (task: "feature-extraction", model: string, options: {
    revision: string; dtype: "int8"; device: "wasm";
    progress_callback: (event: { status: string; file?: string; loaded?: number; total?: number }) => void;
  }) => Promise<FeatureExtractionPipeline>;
  try { extractor = await create("feature-extraction", SEMANTIC_MODEL.id, {
    revision: SEMANTIC_MODEL.revision, dtype: SEMANTIC_MODEL.dtype, device: "wasm",
    progress_callback: event => {
      if (event.status === "progress") self.postMessage({ id, kind: "progress", stage: "downloading", file: event.file, loaded: event.loaded, total: event.total });
    },
  }); } finally { URL.revokeObjectURL(moduleUrl); }
  return extractor;
}

async function vector(text: string, prefix: "query" | "passage", model: FeatureExtractionPipeline) {
  const result = await model(`${prefix}: ${text}`, { pooling: "mean", normalize: true });
  const value = Float32Array.from(result.data, Number);
  if (!isSemanticVector(value)) throw new Error("semantic-invalid-vector");
  return value;
}

type Request = { id: number } & ({ kind: "install" } | { kind: "query"; text: string } | { kind: "score"; text: string; candidates: readonly (readonly SemanticChunk[])[] } | ({ kind: "evidence" } & SemanticEvidenceInput) | { kind: "document"; text: string; name: string; folder: string });

self.onmessage = async (event: MessageEvent<Request>) => {
  const request = event.data;
  try {
    const model = await load(request.kind === "install", request.id);
    if (request.kind === "install") {
      await vector("model ready", "query", model);
      for (const asset of MODEL_ASSETS) if (!(await cache.match(modelAssetUrl(asset.file)))) throw new Error("semantic-model-missing");
      const stamp = crypto.randomUUID();
      await cache.put(installedMarker(origin), new Response(JSON.stringify({ version: SEMANTIC_MODEL.version, stamp })));
      allowDownload = false;
      self.postMessage({ id: request.id, kind: "installed", stamp });
    } else if (request.kind === "query" || request.kind === "score") {
      if (!request.text.trim() || request.text.length > 300 || model.tokenizer.encode(`query: ${request.text}`).length > 512) throw new Error("semantic-query-too-long");
      const value = await vector(request.text, "query", model);
      if (request.kind === "query") self.postMessage({ id: request.id, kind: "query", vector: value }, { transfer: [value.buffer] });
      else {
        if (!Array.isArray(request.candidates) || request.candidates.length > SEMANTIC_LIMITS.documents || request.candidates.some(chunks => !Array.isArray(chunks) || !chunks.length || chunks.length > SEMANTIC_LIMITS.documentChunks) || request.candidates.reduce((sum, chunks) => sum + chunks.length, 0) > SEMANTIC_LIMITS.totalChunks) throw new Error("semantic-invalid-record");
        const candidates: readonly (readonly SemanticChunk[])[] = request.candidates;
        const scores = candidates.map((chunks, index) => {
          const ranked = chunks.map(chunk => ({ score: semanticSimilarity(value, chunk.vector), start: chunk.start, end: chunk.end })).sort((a, b) => b.score - a.score);
          return { index, ...ranked[0] };
        });
        self.postMessage({ id: request.id, kind: "score", scores });
      }
    } else if (request.kind === "evidence") {
      if (typeof request.text !== "string" || request.text.length > 2 * 1024 * 1024) throw new Error("semantic-invalid-text");
      const finding = semanticEvidence(request.text, request.query, request.lastModified, request.source, request.score, request.start, request.end);
      self.postMessage({ id: request.id, kind: "evidence", finding });
    } else {
      if (typeof request.text !== "string" || !request.text.trim() || request.text.length > 2 * 1024 * 1024 || request.name.length > 255 || request.folder.length > 4096) throw new Error("semantic-invalid-text");
      const chunks: SemanticChunk[] = [];
      const header = `${request.name}\n${request.folder}\n`;
      let start = 0;
      while (start < request.text.length && chunks.length < SEMANTIC_LIMITS.documentChunks) {
        let end = Math.min(request.text.length, start + 800);
        while (model.tokenizer.encode(`passage: ${header}${request.text.slice(start, end)}`).length > 512) {
          end = start + Math.floor((end - start) / 2);
          if (end <= start) throw new Error("semantic-text-token-limit");
        }
        if (end < request.text.length && /[\uD800-\uDBFF]/u.test(request.text[end - 1])) end--;
        if (end <= start) throw new Error("semantic-text-token-limit");
        chunks.push({ start, end, vector: await vector(`${header}${request.text.slice(start, end)}`, "passage", model) });
        start = end;
      }
      self.postMessage({ id: request.id, kind: "document", chunks, complete: start === request.text.length }, { transfer: chunks.map(chunk => chunk.vector.buffer as ArrayBuffer) });
    }
  } catch (error) {
    self.postMessage({ id: request.id, kind: "error", code: error instanceof Error && /^semantic-[a-z-]+$/u.test(error.message) ? error.message : "semantic-worker-failed" });
  }
};
export {};
