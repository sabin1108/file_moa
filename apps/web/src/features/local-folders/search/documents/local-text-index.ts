import { isTextCacheMetadata, type TextCacheMetadata } from "../../content/text-cache";

export const LOCAL_TEXT_INDEX_VERSION = 2;
export const LOCAL_TEXT_DATABASE_VERSION = 3;

export type CatalogFile = Readonly<{
  path: readonly string[];
  size: number | null;
  lastModified: number | null;
  status: "listed" | "indexed" | "unsupported" | "unreadable" | "changed";
  reason?: string;
  hash?: string;
}>;

export type LocalIndexStatus = Readonly<{ catalogCount: number; textCount: number; textBytes: number }>;

type Scope = Readonly<{
  owner: string;
  workspace: string;
  connection: string
}>;

export async function withLocalIndexLock<T>(scope: Scope, operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (typeof navigator === "undefined" || !navigator.locks) return operation();

  return await navigator.locks.request(`moa-search-index:${JSON.stringify([scope.owner, scope.workspace, scope.connection])}`,
    { mode: "exclusive", ...(signal ? { signal } : {}) }, operation);
}

type CatalogEntry = Scope & CatalogFile & Readonly<{ id: string; updatedAt: number }>;

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

function isCatalogEntry(value: unknown): value is CatalogEntry {
  if (typeof value !== "object" || value === null) return false;

  return "owner" in value && typeof value.owner === "string"
    && "workspace" in value && typeof value.workspace === "string"
    && "connection" in value && typeof value.connection === "string"
    && "path" in value && Array.isArray(value.path) && value.path.length > 0 && value.path.length <= 65
    && value.path.every(part => typeof part === "string" && part.length > 0 && part.length <= 255)
    && "id" in value && value.id === JSON.stringify([value.owner, value.workspace, value.connection, value.path])
    && "size" in value && (value.size === null || typeof value.size === "number" && Number.isSafeInteger(value.size) && value.size >= 0)
    && "lastModified" in value && (value.lastModified === null || typeof value.lastModified === "number" && Number.isSafeInteger(value.lastModified))
    && "status" in value && ["listed", "indexed", "unsupported", "unreadable", "changed"].includes(String(value.status))
    && (!("hash" in value) || typeof value.hash === "string" && /^[a-f0-9]{64}$/u.test(value.hash))
    && (value.status !== "indexed" || "hash" in value)
    && (!("reason" in value) || typeof value.reason === "string" && value.reason.length <= 128)
    && "updatedAt" in value && typeof value.updatedAt === "number" && Number.isSafeInteger(value.updatedAt) && value.updatedAt >= 0;
}

/** Regenerable extracted text. Source bytes and permissions remain the authority. */

export class LocalTextIndex {
  constructor(private readonly databaseName = "moa-local-text-index-v1") { }

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, LOCAL_TEXT_DATABASE_VERSION);
      let blocked = false;

      request.onupgradeneeded = event => {
        const db = request.result;
        // v1 is a disposable cache; persistent AI records live in a separate filesystem folder.

        if (event.oldVersion < 2) {
          if (db.objectStoreNames.contains("documents")) db.deleteObjectStore("documents");

          const store = db.createObjectStore("documents", { keyPath: "id" });

          store.createIndex("scope", ["owner", "workspace", "connection"]);
          db.createObjectStore("stats");
        }

        if (!db.objectStoreNames.contains("catalog")) {
          db.createObjectStore("catalog", { keyPath: "id" }).createIndex("scope", ["owner", "workspace", "connection"]);
        }
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

            const save = () => {
              store.put({ ...key, id: this.id(key), text, updatedAt: Date.now(), ...(metadata ? { metadata } : {}) });
              statsStore.put(next, this.scopeId(key));
            };

            if (text.length * 2 > 50 * 1024 * 1024) throw new Error("index-storage-limit");

            if (next.count <= 500 && next.bytes <= 50 * 1024 * 1024) save();
            else {
              const entries = store.index("scope").getAll(IDBKeyRange.only([key.owner, key.workspace, key.connection]));

              entries.onsuccess = () => {
                try {
                  assertCurrent();

                  if (!(entries.result as unknown[]).every(isStoredEntry)) throw new Error("index-invalid-cache");

                  const oldest = (entries.result as LocalTextIndexEntry[]).filter(entry => entry.id !== this.id(key)).sort((a, b) => a.updatedAt - b.updatedAt || a.id.localeCompare(b.id));

                  for (const entry of oldest) {
                    if (next.count <= 500 && next.bytes <= 50 * 1024 * 1024) break;

                    store.delete(entry.id);
                    next.count--;
                    next.bytes -= entry.text.length * 2;
                  }

                  if (!isStats(next) || next.count > 500 || next.bytes > 50 * 1024 * 1024) throw new Error("index-invalid-cache");

                  save();
                } catch (error) { tx.abort(); reject(error); }
              };
            }
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

  async observe(scope: Scope, file: CatalogFile, assertCurrent: () => void = () => {}): Promise<void> {
    const record = { ...scope, ...file, id: this.id({ ...scope, path: file.path }), updatedAt: Date.now() };

    if (!isCatalogEntry(record)) throw new Error("index-invalid-cache");

    const db = await this.open();

    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("catalog", "readwrite");
        const store = tx.objectStore("catalog");
        const id = this.id({ ...scope, path: file.path });
        const previous = store.get(id);
        const count = store.index("scope").count(IDBKeyRange.only([scope.owner, scope.workspace, scope.connection]));

        count.onsuccess = () => {
          try {
            assertCurrent();

            const save = () => store.put(record);

            if (previous.result === undefined && count.result >= 20_000) {
              const entries = store.index("scope").openCursor(IDBKeyRange.only([scope.owner, scope.workspace, scope.connection]));
              let oldest: { key: IDBValidKey; updatedAt: number } | null = null;
              let valid = 0;

              entries.onsuccess = () => {
                try {
                  assertCurrent();

                  const cursor = entries.result;

                  if (cursor) {
                    if (!isCatalogEntry(cursor.value)) cursor.delete();
                    else {
                      valid++;
                      if (!oldest || cursor.value.updatedAt < oldest.updatedAt) oldest = { key: cursor.primaryKey, updatedAt: cursor.value.updatedAt };
                    }

                    cursor.continue();

                    return;
                  }

                  if (valid >= 20_000 && oldest) store.delete(oldest.key);
                  save();
                } catch (error) { tx.abort(); reject(error); }
              };
            } else save();
          } catch (error) { tx.abort(); reject(error); }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error("index-update-aborted"));
      });
    } finally { db.close(); }
  }

  async catalog(scope: Scope): Promise<readonly CatalogFile[]> {
    const db = await this.open();

    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction("catalog", "readonly").objectStore("catalog").index("scope").getAll(IDBKeyRange.only([scope.owner, scope.workspace, scope.connection]));

        request.onsuccess = () => resolve((request.result as unknown[]).filter(isCatalogEntry));
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }

  async retainCatalog(scope: Scope, paths: readonly (readonly string[])[], assertCurrent: () => void = () => {}): Promise<void> {
    const keep = new Set(paths.map(path => JSON.stringify(path)));
    const db = await this.open();

    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("catalog", "readwrite");
        const store = tx.objectStore("catalog");
        const request = store.index("scope").openCursor(IDBKeyRange.only([scope.owner, scope.workspace, scope.connection]));

        request.onsuccess = () => {
          try {
            assertCurrent();

            const cursor = request.result;

            if (!cursor) return;
            if (!isCatalogEntry(cursor.value) || !keep.has(JSON.stringify(cursor.value.path))) cursor.delete();
            cursor.continue();
          } catch (error) { tx.abort(); reject(error); }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error("index-update-aborted"));
      });
    } finally { db.close(); }
  }

  async status(scope: Scope): Promise<LocalIndexStatus> {
    const db = await this.open();

    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(["stats", "catalog"], "readonly");
        const stats = tx.objectStore("stats").get(this.scopeId(scope));
        const entries = tx.objectStore("catalog").index("scope").getAll(IDBKeyRange.only([scope.owner, scope.workspace, scope.connection]));

        tx.oncomplete = () => isStats(stats.result ?? { count: 0, bytes: 0 })
          ? resolve({ catalogCount: (entries.result as unknown[]).filter(isCatalogEntry).length, textCount: stats.result?.count ?? 0, textBytes: stats.result?.bytes ?? 0 })
          : reject(new Error("index-invalid-cache"));
        tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
  }

  async clear(scope: Scope, assertCurrent: () => void = () => {}): Promise<void> {
    const db = await this.open();

    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(["documents", "catalog", "stats"], "readwrite");

        for (const name of ["documents", "catalog"]) {
          const request = tx.objectStore(name).index("scope").openKeyCursor(IDBKeyRange.only([scope.owner, scope.workspace, scope.connection]));

          request.onsuccess = () => {
            try {
              assertCurrent();
              const cursor = request.result;

              if (cursor) { tx.objectStore(name).delete(cursor.primaryKey); cursor.continue(); }
            } catch (error) { tx.abort(); reject(error); }
          };
        }
        try { assertCurrent(); tx.objectStore("stats").put({ count: 0, bytes: 0 }, this.scopeId(scope)); }
        catch (error) { tx.abort(); reject(error); }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error("index-update-aborted"));
      });
    } finally { db.close(); }
  }
}
