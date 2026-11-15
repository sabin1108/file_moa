import { copyFolderPath } from "../../folder-path";

export type LocalIndexScan = Readonly<{
  version: 1;
  queue: readonly Readonly<{ path: readonly string[]; kind: "file" | "directory" }>[];
  cursor: number;
  observed: readonly (readonly string[])[];
  discoveredFiles: number;
  directories: number;
  scanned: number;
  failed: boolean;
  limits: readonly string[];
  createdAt: number;
  updatedAt: number;
}>;

function validPath(value: unknown): value is readonly string[] {
  if (!Array.isArray(value) || value.length > 65 || value.some(part => typeof part !== "string" || part.length > 255)) return false;

  try { copyFolderPath(value); return true; }
  catch { return false; }
}

export function isLocalIndexScan(value: unknown): value is LocalIndexScan {
  if (typeof value !== "object" || value === null) return false;

  const count = (item: unknown, maximum: number): item is number => typeof item === "number" && Number.isSafeInteger(item) && item >= 0 && item <= maximum;

  const valid = "version" in value && value.version === 1
    && "queue" in value && Array.isArray(value.queue) && value.queue.length > 0 && value.queue.length <= 20_000
    && value.queue.every(entry => typeof entry === "object" && entry !== null && validPath(entry.path) && ["file", "directory"].includes(entry.kind))
    && "cursor" in value && count(value.cursor, value.queue.length - 1)
    && "observed" in value && Array.isArray(value.observed) && value.observed.length <= 20_000 && value.observed.every(path => validPath(path) && path.length > 0)
    && "discoveredFiles" in value && count(value.discoveredFiles, 20_000)
    && "directories" in value && count(value.directories, 1000)
    && "scanned" in value && count(value.scanned, 20_000)
    && "failed" in value && typeof value.failed === "boolean"
    && "limits" in value && Array.isArray(value.limits) && value.limits.length <= 3 && value.limits.every(limit => ["scan-limit", "depth-limit", "listing-limit"].includes(limit))
    && "createdAt" in value && count(value.createdAt, Number.MAX_SAFE_INTEGER)
    && "updatedAt" in value && count(value.updatedAt, Number.MAX_SAFE_INTEGER) && value.updatedAt >= value.createdAt;

  if (!valid) return false;
  const scan = value as LocalIndexScan;
  if (scan.queue[0].kind !== "directory" || scan.queue[0].path.length !== 0 || scan.scanned > scan.cursor
    || scan.discoveredFiles > scan.scanned || scan.observed.length > scan.discoveredFiles) return false;

  // Bound the whole clone/write, including long paths, rather than only counting queue entries.
  let bytes = 256;
  for (const entry of scan.queue) {
    bytes += 80;
    for (const part of entry.path) bytes += part.length * 2 + 16;
    if (bytes > 2 * 1024 * 1024) return false;
  }
  for (const path of scan.observed) {
    bytes += 32;
    for (const part of path) bytes += part.length * 2 + 16;
    if (bytes > 2 * 1024 * 1024) return false;
  }

  const processed = new Set(scan.queue.slice(0, scan.cursor).filter(entry => entry.kind === "file").map(entry => JSON.stringify(entry.path)));
  if (scan.observed.some(path => !processed.has(JSON.stringify(path)))) return false;

  return true;
}
