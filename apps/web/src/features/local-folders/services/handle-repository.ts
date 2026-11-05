/**
 * 폴더 핸들 참조를 이 기기의 IndexedDB에 보관하는 어댑터다. hook에서 만들고 connection-session에 주입한다.
 * Web Locks로 저장 경쟁을 제어하며 원본 폴더나 파일 내용을 저장·수정하지 않는다.
 */
import { connectionKey, validateFolderHandle } from "../lib/connection-validation";
import type { ConnectionOwner, FolderHandle, FolderKind, HandleRepository } from "../types";

/** Browser-local references only. Does not read, write, move, or delete the referenced folders. */
export class IndexedDbHandleRepository implements HandleRepository {
  constructor(private readonly databaseName = "moa-local-folders-v1") {}

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      let blocked = false;
      const request = indexedDB.open(this.databaseName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("connections");
      request.onblocked = () => { blocked = true; reject(new Error("connection-database-blocked")); };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        if (blocked) { request.result.close(); return; }
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
    } finally { db.close(); }
  }

  async write(owner: ConnectionOwner, kind: FolderKind, handle: FolderHandle): Promise<void> {
    validateFolderHandle(handle);
    await this.mutate(owner, kind, handle);
  }

  async remove(owner: ConnectionOwner, kind: FolderKind): Promise<void> {
    await this.mutate(owner, kind);
  }

  private async mutate(owner: ConnectionOwner, kind: FolderKind, handle?: FolderHandle): Promise<void> {
    const key = connectionKey(owner, kind);
    // Acquire before opening IDB so a later disconnect cannot be overtaken by an earlier pending save.
    await navigator.locks.request(JSON.stringify(["moa-folder-reference", this.databaseName, ...key]), () => this.mutateUnderLock(key, handle));
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
    } finally { db.close(); }
  }
}
