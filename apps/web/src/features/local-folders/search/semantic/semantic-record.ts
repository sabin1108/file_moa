import { copyFolderPath } from "../../folder-path";
import { SEMANTIC_MODEL } from "./model-assets";

export type SemanticEpoch = Readonly<{ scope: string; model: string }>;
export type SemanticChunk = Readonly<{ start: number; end: number; vector: Float32Array }>;
export type SemanticRecord = Readonly<{
  owner: string; workspace: string; connection: string;
  id: string; path: readonly string[]; pathKey: string;
  hash: string; parserVersion: number; model: string;
  epoch: SemanticEpoch; textLength: number; complete: boolean;
  chunks: readonly SemanticChunk[]; updatedAt: number;
}>;
export const SEMANTIC_LIMITS = { documentChunks: 64, totalChunks: 4096, documents: 500 } as const;
export const semanticRecordId = (value: Pick<SemanticRecord, "owner" | "workspace" | "connection" | "path" | "hash" | "parserVersion" | "model">) => JSON.stringify([value.owner, value.workspace, value.connection, value.path, value.hash, value.parserVersion, value.model]);

export function isSemanticVector(value: unknown): value is Float32Array {
  if (!(value instanceof Float32Array) || value.length !== SEMANTIC_MODEL.dimensions) return false;
  let norm = 0;
  for (const item of value) { if (!Number.isFinite(item) || Math.abs(item) > 1.001) return false; norm += item * item; }
  return norm > 0.98 && norm < 1.02;
}

export function isSemanticRecord(value: unknown): value is SemanticRecord {
  if (!value || typeof value !== "object") return false;
  const item = value as SemanticRecord;
  if (typeof item.owner !== "string" || typeof item.workspace !== "string" || typeof item.connection !== "string"
    || !Array.isArray(item.path) || !item.path.length || item.path.length > 65 || item.path.some(part => typeof part !== "string" || part.length > 255)
    || item.pathKey !== JSON.stringify(item.path) || item.model !== SEMANTIC_MODEL.version || item.parserVersion !== 2
    || typeof item.hash !== "string" || !/^[a-f0-9]{64}$/u.test(item.hash) || item.id !== semanticRecordId(item)
    || !Number.isSafeInteger(item.textLength) || item.textLength < 1 || item.textLength > 2 * 1024 * 1024
    || typeof item.complete !== "boolean" || !Number.isSafeInteger(item.updatedAt) || item.updatedAt < 0
    || !item.epoch || typeof item.epoch.scope !== "string" || typeof item.epoch.model !== "string" || item.epoch.scope.length > 100 || item.epoch.model.length > 100
    || !Array.isArray(item.chunks) || !item.chunks.length || item.chunks.length > SEMANTIC_LIMITS.documentChunks) return false;
  try { copyFolderPath(item.path); } catch { return false; }
  let end = 0;
  for (const chunk of item.chunks) {
    if (!chunk || chunk.start !== end || !Number.isSafeInteger(chunk.end) || chunk.end <= chunk.start || chunk.end > item.textLength || !isSemanticVector(chunk.vector)) return false;
    end = chunk.end;
  }
  return !item.complete || end === item.textLength;
}

export function semanticSimilarity(left: Float32Array, right: Float32Array) {
  if (!isSemanticVector(left) || !isSemanticVector(right)) throw new Error("semantic-invalid-vector");
  let score = 0;
  for (let index = 0; index < left.length; index++) score += left[index] * right[index];
  return Math.min(1, Math.max(-1, score));
}
