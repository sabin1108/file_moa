import { isTextCacheMetadata, type TextCacheMetadata } from "../../content/text-cache";

export const LOCAL_TEXT_INDEX_VERSION = 2;

type Scope = Readonly<{
  owner: string;
  workspace: string;
  connection: string
}>;

type IndexKey = Scope & Readonly<{
  path: readonly string[];
  hash: string;
  parserVersion: number
}>;

export type LocalTextIndexEntry = IndexKey & Readonly<{
  id: string;
  text: string;
  updatedAt: number;
  metadata?: TextCacheMetadata;
}>;

type Stats = {
  count: number;
  bytes: number
};

function isStoredEntry(value: unknown): value is LocalTextIndexEntry {
  if (typeof value !== "object" || value === null) return false;

  return "owner" in value && typeof value.owner === "string"
    && "workspace" in value && typeof value.workspace === "string"
    && "connection" in value && typeof value.connection === "string"
    && "path" in value && Array.isArray(value.path) && value.path.every(part => typeof part === "string")
    && "id" in value && value.id === JSON.stringify([value.owner, value.workspace, value.connection, value.path])
    && "hash" in value && typeof value.hash === "string" && /^[a-f0-9]{64}$/u.test(value.hash)
    && "text" in value && typeof value.text === "string"
    && "parserVersion" in value && typeof value.parserVersion === "number" && Number.isSafeInteger(value.parserVersion) && value.parserVersion > 0
    && "updatedAt" in value && typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt)
    && (!("metadata" in value) || isTextCacheMetadata(value.metadata));
}

function isStats(value: unknown): value is Stats {
  return typeof value === "object" && value !== null
    && "count" in value && typeof value.count === "number" && Number.isSafeInteger(value.count) && value.count >= 0
    && "bytes" in value && typeof value.bytes === "number" && Number.isSafeInteger(value.bytes) && value.bytes >= 0;
}

/** Regenerable extracted text. Source bytes and permissions remain the authority. */

export class LocalTextIndex {
  constructor(private readonly databaseName = "moa-local-text-index-v1") { }

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 2);
      let blocked = false;

      request.onupgradeneeded = () => {
        const db = request.result;
        // v1 is a disposable cache; persistent AI records live in a separate filesystem folder.

        if (db.objectStoreNames.contains("documents")) db.deleteObjectStore("documents");

        const store = db.createObjectStore("documents", { keyPath: "id" });

        store.createIndex("scope", ["owner", "workspace", "connection"]);
        db.createObjectStore("stats");
      };
      request.onblocked = () => {
        blocked = true;
        reject(new Error("index-database-blocked"));
      };
      request.onsuccess = () => {
        if (blocked) {
          request.result.close();

          return;
        }

        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  }

  private id(key: Scope & { path: readonly string[] }) {
    return JSON.stringify([key.owner, key.workspace, key.connection, key.path]);
  }
  private scopeId(scope: Scope) {
    return JSON.stringify([scope.owner, scope.workspace, scope.connection]);
  }

  async readPath(scope: Scope, path: readonly string[]): Promise<LocalTextIndexEntry | undefined> {
    const db = await this.open();

    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction("documents", "readonly").objectStore("documents").get(this.id({ ...scope, path }));

        request.onsuccess = () => resolve(isStoredEntry(request.result) && request.result.parserVersion === LOCAL_TEXT_INDEX_VERSION ? request.result : undefined);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }

  async put(key: IndexKey, text: string, assertCurrent: () => void = () => { }, metadata?: TextCacheMetadata): Promise<void> {
    const db = await this.open();

    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(["documents", "stats"], "readwrite");
        const store = tx.objectStore("documents");
        const previous = store.get(this.id(key));
        const statsStore = tx.objectStore("stats");
        const stats = statsStore.get(this.scopeId(key));

        stats.onsuccess = () => {
          try {
            assertCurrent();

            if ((previous.result !== undefined && !isStoredEntry(previous.result))
              || (stats.result !== undefined && !isStats(stats.result))) throw new Error("index-invalid-cache");

            const before: Stats = stats.result ?? { count: 0, bytes: 0 };
            const next = {
              count: before.count + (previous.result ? 0 : 1),
              bytes: before.bytes - (previous.result?.text.length ?? 0) * 2 + text.length * 2
            };

            if (!isStats(next)) throw new Error("index-invalid-cache");

            if (next.count > 500 || next.bytes > 50 * 1024 * 1024) throw new Error("index-storage-limit");

            store.put({ ...key, id: this.id(key), text, updatedAt: Date.now(), ...(metadata ? { metadata } : {}) });
            statsStore.put(next, this.scopeId(key));
          } catch (error) {
            tx.abort();
            reject(error);
          }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error("index-update-aborted"));
      });
    } finally {
      db.close();
    }
  }

  async retain(scope: Scope, paths: readonly (readonly string[])[], assertCurrent: () => void = () => { }): Promise<void> {
    const keep = new Set(paths.map(path => JSON.stringify(path)));
    const db = await this.open();

    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(["documents", "stats"], "readwrite");
        const store = tx.objectStore("documents");
        const request = store.index("scope").getAll(IDBKeyRange.only([scope.owner, scope.workspace, scope.connection]));

        request.onsuccess = () => {
          try {
            assertCurrent();

            const stats = { count: 0, bytes: 0 };

            for (const entry of request.result as LocalTextIndexEntry[]) {
              if (!isStoredEntry(entry) || !keep.has(JSON.stringify(entry.path))) store.delete(entry.id);
              else {
                stats.count++;
                stats.bytes += entry.text.length * 2;
              }
            }

            tx.objectStore("stats").put(stats, this.scopeId(scope));
          } catch (error) {
            tx.abort();
            reject(error);
          }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error("index-update-aborted"));
      });
    } finally {
      db.close();
    }
  }

  async search(scope: Scope, term: string): Promise<LocalTextIndexEntry[]> {
    const db = await this.open();

    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction("documents", "readonly").objectStore("documents").index("scope").getAll(IDBKeyRange.only([scope.owner, scope.workspace, scope.connection]));

        request.onsuccess = () => resolve((request.result as unknown[]).filter(isStoredEntry).filter(entry => entry.parserVersion === LOCAL_TEXT_INDEX_VERSION
          && entry.text.toLocaleLowerCase("ko").includes(term.toLocaleLowerCase("ko"))));
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }
}
