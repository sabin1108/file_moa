/**
 * 폴더 핸들 참조를 이 기기의 IndexedDB에 보관하는 어댑터다. hook에서 만들고 connection-session에 주입한다.
 * Web Locks로 저장 경쟁을 제어하며 원본 폴더나 파일 내용을 저장·수정하지 않는다.
 */
import { connectionKey, validateFolderHandle } from "./connection-validation";
import type { ConnectionOwner, FolderHandle, FolderKind, SourceFolderConnection, SourceFolderRepository } from "../types";

/** Browser-local references only. Does not read, write, move, or delete the referenced folders. */

type StoredSource = {
  handle: FolderHandle;
  name: string;
  active: boolean
};

export class IndexedDbHandleRepository implements SourceFolderRepository {
  constructor(private readonly databaseName = "moa-local-folders-v1") { }

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      let blocked = false;
      const request = indexedDB.open(this.databaseName, 1);

      request.onupgradeneeded = () => request.result.createObjectStore("connections");
      request.onblocked = () => {
        blocked = true;
        reject(new Error("connection-database-blocked"));
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        if (blocked) {
          request.result.close();

          return;
        }

        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
    });
  }

  async read(owner: ConnectionOwner, kind: FolderKind): Promise<FolderHandle | undefined> {
    const key = connectionKey(owner, kind);
    const db = await this.open();

    try {
      const value = await new Promise<FolderHandle | undefined>((resolve, reject) => {
        const transaction = db.transaction("connections", "readonly");
        const request = transaction.objectStore("connections").get(key);

        transaction.oncomplete = () => resolve(request.result);
        transaction.onabort = () => reject(transaction.error ?? new Error("connection-read-aborted"));
        transaction.onerror = () => reject(transaction.error);
      });

      if (value !== undefined) validateFolderHandle(value);

      return value;
    } finally {
      db.close();
    }
  }

  async write(owner: ConnectionOwner, kind: FolderKind, handle: FolderHandle): Promise<void> {
    validateFolderHandle(handle);
    await this.mutate(owner, kind, handle);
  }

  async remove(owner: ConnectionOwner, kind: FolderKind): Promise<void> {
    await this.mutate(owner, kind);
  }

  private sourceKey(owner: ConnectionOwner, connectionId: string): string[] {
    connectionKey(owner, "source");

    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(connectionId)) throw new Error("invalid-source-connection-id");

    return ["source-connections", owner.userId, owner.workspaceId, connectionId];
  }

  async listSource(owner: ConnectionOwner): Promise<readonly SourceFolderConnection[]> {
    connectionKey(owner, "source");

    const db = await this.open();

    try {
      const rows = await new Promise<Array<{
        key: IDBValidKey;
        value: unknown
      }>>((resolve, reject) => {
        const tx = db.transaction("connections", "readonly");
        const store = tx.objectStore("connections");
        const request = store.getAll();
        const keys = store.getAllKeys();

        tx.oncomplete = () => {
          resolve(keys.result.map((key, index) => ({ key, value: request.result[index] })));
        };
        tx.onerror = () => reject(tx.error);
      });
      const prefix = JSON.stringify(["source-connections", owner.userId, owner.workspaceId]);
      const result: SourceFolderConnection[] = [];

      for (const row of rows) {
        if (!Array.isArray(row.key) || JSON.stringify(row.key.slice(0, 3)) !== prefix) continue;

        const value = row.value as StoredSource;

        if (!value || !value.handle) continue;

        validateFolderHandle(value.handle);

        const connectionId = String((row.key as unknown[])[3]);

        result.push({
          connectionId,
          name: value.name || value.handle.name,
          handle: value.handle,
          active: value.active === true
        });
      }
      // Compatibility: existing installations have one legacy source key.

      const legacy = await this.read(owner, "source");

      if (legacy) result.push({
        connectionId: "legacy",
        name: legacy.name,
        handle: legacy,
        active: !result.some(item => item.active)
      });

      return result;
    } finally {
      db.close();
    }
  }

  async readSource(owner: ConnectionOwner, connectionId: string): Promise<FolderHandle | undefined> {
    if (connectionId === "legacy") return this.read(owner, "source");

    const key = this.sourceKey(owner, connectionId);
    const db = await this.open();

    try {
      return await new Promise<FolderHandle | undefined>((resolve, reject) => {
        const tx = db.transaction("connections", "readonly");
        const request = tx.objectStore("connections").get(key);

        tx.oncomplete = () => {
          if (request.result?.handle) validateFolderHandle(request.result.handle);

          resolve(request.result?.handle);
        };
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }

  async writeSource(owner: ConnectionOwner, connectionId: string, handle: FolderHandle, name = handle.name): Promise<void> {
    validateFolderHandle(handle);

    const key = this.sourceKey(owner, connectionId);

    await navigator.locks.request(JSON.stringify(["moa-folder-reference", this.databaseName, ...key]), async () => {
      const existing = await this.listSource(owner);
      const active = existing.filter(item => item.connectionId !== "legacy").length === 0
        || existing.some(item => item.connectionId === connectionId && item.active);
      const db = await this.open();

      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction("connections", "readwrite");

          tx.objectStore("connections").put({ handle, name, active } satisfies StoredSource, key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    });
  }

  async removeSource(owner: ConnectionOwner, connectionId: string): Promise<void> {
    if (connectionId === "legacy") return this.remove(owner, "source");

    const key = this.sourceKey(owner, connectionId);

    await navigator.locks.request(JSON.stringify(["moa-folder-reference", this.databaseName, ...key]), async () => {
      const db = await this.open();

      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction("connections", "readwrite");

          tx.objectStore("connections").delete(key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    });
  }

  async setActiveSource(owner: ConnectionOwner, connectionId: string): Promise<void> {
    const target = await this.readSource(owner, connectionId);

    if (!target) throw new Error("source-connection-not-found");

    const all = await this.listSource(owner);
    const db = await this.open();

    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("connections", "readwrite");
        const store = tx.objectStore("connections");

        for (const item of all) if (item.connectionId !== "legacy") store.put(
          { handle: item.handle, name: item.name, active: item.connectionId === connectionId } satisfies StoredSource,
          this.sourceKey(owner, item.connectionId)
        );

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }

  private async mutate(owner: ConnectionOwner, kind: FolderKind, handle?: FolderHandle): Promise<void> {
    const key = connectionKey(owner, kind);
    // Acquire before opening IDB so a later disconnect cannot be overtaken by an earlier pending save.

    await navigator.locks.request(
      JSON.stringify(["moa-folder-reference", this.databaseName, ...key]),
      () => this.mutateUnderLock(key, handle)
    );
  }

  private async mutateUnderLock(key: [string, string, FolderKind], handle?: FolderHandle): Promise<void> {
    const db = await this.open();

    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction("connections", "readwrite");
        const store = transaction.objectStore("connections");

        if (handle) store.put(handle, key); else store.delete(key);

        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error ?? new Error("connection-write-aborted"));
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      db.close();
    }
  }
}
