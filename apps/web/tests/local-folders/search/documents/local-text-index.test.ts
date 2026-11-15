import { afterEach, expect, it, vi } from "vitest";
import { LocalTextIndex } from "../../../../src/features/local-folders/search/documents/local-text-index";

afterEach(() => vi.unstubAllGlobals());

it("RAG-S05 upgrades the existing text database without deleting version2 document or stats stores", async () => {
  const createIndex = vi.fn();
  const db = {
    objectStoreNames: { contains: (name: string) => ["documents", "stats"].includes(name) },
    deleteObjectStore: vi.fn(), createObjectStore: vi.fn(() => ({ createIndex })),
  };
  const request = {
    result: db, error: new Error("test-complete"),
    onupgradeneeded: null as null | ((event: { oldVersion: number }) => void),
    onerror: null as null | (() => void),
  };
  vi.stubGlobal("indexedDB", { open: vi.fn(() => request) });
  const pending = new LocalTextIndex("synthetic").readPath({ owner: "a", workspace: "w", connection: "c" }, ["note.md"]);
  const rejection = expect(pending).rejects.toThrow("test-complete");

  try {
    request.onupgradeneeded!({ oldVersion: 2 });
    expect(db.deleteObjectStore).not.toHaveBeenCalled();
    expect(db.createObjectStore).toHaveBeenCalledWith("catalog", { keyPath: "id" });
    expect(db.createObjectStore).not.toHaveBeenCalledWith("stats");
  } finally {
    request.onerror!();
    await rejection;
  }
});
