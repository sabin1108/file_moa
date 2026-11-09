export const LOCAL_TEXT_INDEX_VERSION = 2;
type Scope = Readonly<{ owner: string; workspace: string; connection: string }>;
type IndexKey = Scope & Readonly<{ path: readonly string[]; hash: string; parserVersion: number }>;
export type LocalTextIndexEntry = IndexKey & Readonly<{ id: string; text: string; updatedAt: number }>;
type Stats = { count: number; bytes: number };

/** Regenerable extracted text. Source bytes and permissions remain the authority. */
export class LocalTextIndex {
  constructor(private readonly databaseName = "moa-local-text-index-v1") {}

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        // v1 is a disposable cache; persistent AI records live in a separate filesystem folder.
        if (db.objectStoreNames.contains("documents")) db.deleteObjectStore("documents");
        const store = db.createObjectStore("documents", { keyPath: "id" });
        store.createIndex("scope", ["owner", "workspace", "connection"]);
        db.createObjectStore("stats");
      };
      request.onblocked = () => reject(new Error("index-database-blocked"));
      request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
      request.onerror = () => reject(request.error);
    });
  }

  private id(key: Scope & { path: readonly string[] }) { return JSON.stringify([key.owner, key.workspace, key.connection, key.path]); }
  private scopeId(scope: Scope) { return JSON.stringify([scope.owner, scope.workspace, scope.connection]); }

  async readPath(scope: Scope, path: readonly string[]): Promise<LocalTextIndexEntry | undefined> {
    const db = await this.open();
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction("documents", "readonly").objectStore("documents").get(this.id({ ...scope, path }));
        request.onsuccess = () => resolve(request.result?.parserVersion === LOCAL_TEXT_INDEX_VERSION ? request.result : undefined);
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }

  async put(key: IndexKey, text: string, assertCurrent: () => void = () => {}): Promise<void> {
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
            const before: Stats = stats.result ?? { count: 0, bytes: 0 };
            const next = { count: before.count + (previous.result ? 0 : 1), bytes: before.bytes - (previous.result?.text.length ?? 0) * 2 + text.length * 2 };
            if (next.count > 500 || next.bytes > 50 * 1024 * 1024) throw new Error("index-storage-limit");
            store.put({ ...key, id: this.id(key), text, updatedAt: Date.now() });
            statsStore.put(next, this.scopeId(key));
          } catch (error) { tx.abort(); reject(error); }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error("index-update-aborted"));
      });
    } finally { db.close(); }
  }

  async retain(scope: Scope, paths: readonly (readonly string[])[], assertCurrent: () => void = () => {}): Promise<void> {
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
              if (!keep.has(JSON.stringify(entry.path))) store.delete(entry.id);
              else { stats.count++; stats.bytes += entry.text.length * 2; }
            }
            tx.objectStore("stats").put(stats, this.scopeId(scope));
          } catch (error) { tx.abort(); reject(error); }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error("index-update-aborted"));
      });
    } finally { db.close(); }
  }

  async search(scope: Scope, term: string): Promise<LocalTextIndexEntry[]> {
    const db = await this.open();
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction("documents", "readonly").objectStore("documents").index("scope").getAll(IDBKeyRange.only([scope.owner, scope.workspace, scope.connection]));
        request.onsuccess = () => resolve((request.result as LocalTextIndexEntry[]).filter(entry => entry.parserVersion === LOCAL_TEXT_INDEX_VERSION && entry.text.toLocaleLowerCase("ko").includes(term.toLocaleLowerCase("ko"))));
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }
}
