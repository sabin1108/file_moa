import { afterEach, describe, expect, it, vi } from "vitest";
import { isLocalIndexScan } from "../../../../src/features/local-folders/search/documents/local-index-scan";
import { tryWithLocalIndexLock } from "../../../../src/features/local-folders/search/documents/local-text-index";

afterEach(() => vi.unstubAllGlobals());

describe("metadata scan checkpoint", () => {
  const checkpoint = { version: 1, queue: [{ path: [], kind: "directory" }], cursor: 0, observed: [], discoveredFiles: 0, directories: 0, scanned: 0, failed: false, limits: [], createdAt: 100, updatedAt: 100 };

  it("accepts a bounded checkpoint and rejects damaged paths/cursors/counters", () => {
    expect(isLocalIndexScan(checkpoint)).toBe(true);
    for (const change of [{ cursor: 1 }, { cursor: 2 }, { scanned: -1 }, { directories: 1001 }, { createdAt: NaN }, { queue: [{ path: [".."], kind: "directory" }] }, { observed: [["a/b"]] }, { limits: ["made-up"] }, { version: 2 }]) {
      expect(isLocalIndexScan({ ...checkpoint, ...change })).toBe(false);
    }
  });
  it("bounds total checkpoint cloning even below the entry-count limit", () => {
    const longPath = Array.from({ length: 64 }, () => "a".repeat(255));

    expect(isLocalIndexScan({ ...checkpoint, queue: Array.from({ length: 100 }, () => ({ path: longPath, kind: "file" })) })).toBe(false);
  });
  it("automatic lock contention skips work without joining the user queue", async () => {
    const request = vi.fn(async (_name, options, callback) => { expect(options.ifAvailable).toBe(true); return callback(null); });
    vi.stubGlobal("navigator", { locks: { request } });
    const run = vi.fn(async () => "unexpected");

    expect(await tryWithLocalIndexLock({ owner: "a", workspace: "w", connection: "c" }, run)).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });
});
