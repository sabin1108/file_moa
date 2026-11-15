import runtime from "./runtime-manifest.json";

export const SEMANTIC_MODEL = {
  id: "Xenova/multilingual-e5-small",
  revision: "761b726dd34fb83930e26aab4e9ac3899aa1fa78",
  dtype: "int8" as const,
  dimensions: 384,
  cache: "moa-semantic-assets-v1",
  lock: "moa-semantic-model-v1",
  version: "e5-small-int8-761b726-chunk1",
};
export const MODEL_ASSETS = [
  { file: "config.json", bytes: 658, sha256: "cb99455288675345e1a4f411438d5d0adbba5fbd3a67ea4fb03c015433b996c1" },
  { file: "tokenizer_config.json", bytes: 443, sha256: "a1d6bc8734a6f635dc158508bef000f8e2e5a759c7d92f984b2c86e5ff53425b" },
  { file: "tokenizer.json", bytes: 17082730, sha256: "0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39" },
  { file: "onnx/model_int8.onnx", bytes: 118054593, sha256: "4d24e2bc01a447951524466ef533e52944bf48509e6552810bcee1a2711cb02c" },
] as const;
export const RUNTIME_ASSETS = runtime.files;
export const MODEL_DOWNLOAD_BYTES = MODEL_ASSETS.reduce((sum, asset) => sum + asset.bytes, 0) + RUNTIME_ASSETS.reduce((sum, asset) => sum + asset.bytes, 0);
export const modelAssetUrl = (file: string) => `https://huggingface.co/${SEMANTIC_MODEL.id}/resolve/${SEMANTIC_MODEL.revision}/${file}`;
export const runtimeAssetUrl = (file: string, origin: string) => {
  const asset = RUNTIME_ASSETS.find(asset => asset.file === file);
  if (!asset) throw new Error("semantic-runtime-unavailable");
  return new URL(`/semantic-runtime/${file}?sha=${asset.sha256}`, origin).href;
};
export const installedMarker = (origin: string) => new URL(`/__moa/semantic-installed/${SEMANTIC_MODEL.version}`, origin).href;

export function semanticAsset(url: string, origin: string) {
  return MODEL_ASSETS.find(asset => modelAssetUrl(asset.file) === url)
    ?? RUNTIME_ASSETS.find(asset => runtimeAssetUrl(asset.file, origin) === url);
}

export async function verifySemanticAsset(response: Response, asset: { bytes: number; sha256: string }, progress?: (loaded: number, stage: "downloading" | "verifying") => void): Promise<Response> {
  if (!response.ok) throw new Error("semantic-asset-unavailable");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("semantic-asset-unavailable");
  const parts: Uint8Array[] = [];
  let loaded = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      loaded += part.value.byteLength;
      if (loaded > asset.bytes) throw new Error("semantic-asset-integrity");
      parts.push(part.value);
      progress?.(loaded, "downloading");
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  if (loaded !== asset.bytes) throw new Error("semantic-asset-integrity");
  const data = new Uint8Array(loaded);
  let offset = 0;
  for (const part of parts) { data.set(part, offset); offset += part.byteLength; }
  parts.length = 0;
  const bytes = data.buffer;
  progress?.(loaded, "verifying");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
  if (bytes.byteLength !== asset.bytes || hash !== asset.sha256) throw new Error("semantic-asset-integrity");
  const headers = new Headers(response.headers);
  headers.set("x-moa-sha256", hash);
  headers.set("x-moa-bytes", String(bytes.byteLength));
  headers.set("content-length", String(bytes.byteLength));
  return new Response(bytes, { headers });
}

export type InstalledSemanticModel = Readonly<{ stamp: string; bytes: number }>;
export async function readInstalledModel(origin: string): Promise<InstalledSemanticModel | null> {
  if (typeof caches === "undefined") return null;
  const cache = await caches.open(SEMANTIC_MODEL.cache);
  const marker = await cache.match(installedMarker(origin));
  if (!marker) return null;
  const value: unknown = await marker.json().catch(() => null);
  if (!value || typeof value !== "object" || !("version" in value) || value.version !== SEMANTIC_MODEL.version
    || !("stamp" in value) || typeof value.stamp !== "string" || value.stamp.length > 100) return null;

  for (const asset of MODEL_ASSETS) {
    const response = await cache.match(modelAssetUrl(asset.file));
    if (!response || response.headers.get("x-moa-sha256") !== asset.sha256 || response.headers.get("x-moa-bytes") !== String(asset.bytes)) return null;
  }
  for (const asset of RUNTIME_ASSETS) {
    const response = await cache.match(runtimeAssetUrl(asset.file, origin));
    if (!response || response.headers.get("x-moa-sha256") !== asset.sha256) return null;
  }
  return { stamp: value.stamp, bytes: MODEL_DOWNLOAD_BYTES };
}
