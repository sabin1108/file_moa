import { vi } from "vitest";
import type { FolderHandle } from "../../../src/features/local-folders/types";
import { inspectRecoveryBackup } from "../../../src/features/local-folders/services/recovery-backup-input";
import { executeRecoveryBackup } from "../../../src/features/local-folders/services/recovery-backup";
import type { FileChangePlan } from "../../../src/features/local-folders/lib/file-change-plan";

export const backupOwner = { userId: "backup-test", workspaceId: "work" };

/** Replaces only file-system boundaries; real service, schema and SHA-256 execute in each test. */
export function backupFilesystem() {
  const bytes = new Map<string, File>();
  const directories = new Map<string, FolderHandle>();
  const writes: string[] = [];
  const creates: string[] = [];
  const removes = vi.fn();
  let denied = false;
  let failure: (key: string, step: "open" | "write" | "close" | "read") => boolean = () => false;
  let onClose: (key: string) => void = () => {};
  let onWrite: (key: string) => void = () => {};
  let onHash: (file: File) => void = () => {};
  const handles = new Map<string, FileSystemFileHandle>();
  const paths = new WeakMap<object, string>();
  function folder(path: string): FolderHandle {
    const directory = {
      kind: "directory", name: path.split("/").at(-1),
      queryPermission: vi.fn(async () => denied ? "denied" : "granted"),
      requestPermission: vi.fn(async () => denied ? "denied" : "granted"),
      isSameEntry: vi.fn(async (other: object) => other === directory),
      resolve: vi.fn(async (other: object) => {
        const target = paths.get(other)!;
        return target === path ? [] : target.startsWith(path + "/") ? target.slice(path.length + 1).split("/") : null;
      }),
      removeEntry: async (name: string, options?: { recursive?: boolean }) => {
        const key = `${path}/${name}`;
        removes(key, options);
        if (!bytes.has(key) && !directories.has(key)) throw new DOMException("missing", "NotFoundError");
        const children = [...directories.keys(), ...bytes.keys()].filter(value => value.startsWith(key + "/"));
        if (directories.has(key) && children.length && !options?.recursive) throw new DOMException("not empty", "InvalidModificationError");
        for (const child of children) { bytes.delete(child); directories.delete(child); handles.delete(child); }
        bytes.delete(key);
        directories.delete(key);
        handles.delete(key);
      },
      getDirectoryHandle: vi.fn(async (name: string, options?: { create?: boolean }) => {
        if (!directories.has(path)) throw new DOMException("deleted directory", "NotFoundError");
        const key = `${path}/${name}`;
        if (bytes.has(key)) throw new DOMException("file", "TypeMismatchError");
        if (!directories.has(key)) {
          if (!options?.create) throw new DOMException("missing", "NotFoundError");
          creates.push(key);
          directories.set(key, folder(key));
        }
        return directories.get(key)!;
      }),
      getFileHandle: vi.fn(async (name: string, options?: { create?: boolean }) => {
        if (!directories.has(path)) throw new DOMException("deleted directory", "NotFoundError");
        const key = `${path}/${name}`;
        if (directories.has(key)) throw new DOMException("directory", "TypeMismatchError");
        if (!bytes.has(key)) {
          if (!options?.create) throw new DOMException("missing", "NotFoundError");
          creates.push(key);
          bytes.set(key, new File([], name, { lastModified: 1 }));
        }
        if (!handles.has(key)) {
          const handle = {
            kind: "file", name,
            isSameEntry: async (other: object) => other === handle,
            getFile: async () => {
              if (failure(key, "read")) throw Error("synthetic read failure");
              if (!bytes.has(key)) throw new DOMException("missing", "NotFoundError");
              return bytes.get(key)!;
            },
            createWritable: async () => {
              writes.push(key);
              if (failure(key, "open")) throw Error("synthetic open failure");
              const chunks: BlobPart[] = [];
              return {
                write: async (data: BlobPart) => {
                  if (failure(key, "write")) throw new DOMException("synthetic full", "QuotaExceededError");
                  chunks.push(data);
                  onWrite(key);
                },
                close: async () => {
                  if (failure(key, "close")) throw Error("synthetic close failure");
                  bytes.set(key, new File(chunks, name, { lastModified: 2 }));
                  onClose(key);
                },
                abort: async () => {},
              };
            },
          } as unknown as FileSystemFileHandle;
          handles.set(key, handle);
        }
        return handles.get(key)!;
      }),
      values: async function* () {
        for (const [key, child] of [...directories]) {
          if (key.startsWith(path + "/") && !key.slice(path.length + 1).includes("/")) yield child;
        }
        for (const key of [...bytes.keys()]) {
          if (key.startsWith(path + "/") && !key.slice(path.length + 1).includes("/")) yield await directory.getFileHandle(key.slice(path.length + 1));
        }
      },
    };
    paths.set(directory, path);
    return directory as unknown as FolderHandle;
  }
  for (const path of ["source", "source/from", "source/to", "vault"]) directories.set(path, folder(path));
  bytes.set("vault/.moa-vault.json", new File([JSON.stringify({ schemaVersion: 1, kind: "moa-recovery-vault",
    vaultId: "11111111-1111-4111-8111-111111111111", owner: backupOwner, createdAt: "2026-11-04T00:00:00.000Z" })], ".moa-vault.json", { lastModified: 1 }));
  const names = ["a.txt", "한글 파일.txt", "empty.txt"];
  for (const name of names) {
    bytes.set(`source/from/${name}`, new File([`NEW_${name}`], name, { lastModified: 10 }));
    bytes.set(`source/to/${name}`, new File(name === "empty.txt" ? [] : [`OLD_${name}`], name, { lastModified: 20 }));
  }
  const plan: FileChangePlan = { operation: "copy", conflictCount: 3, directoriesToCreate: [],
    rows: names.map(name => ({ from: ["from", name], to: ["to", name], issues: ["name-conflict"] })) };
  const root = directories.get("source")!;
  const vault = directories.get("vault")!;
  const abort = new AbortController();
  let current = true;
  const check = () => { if (!current) throw Error("stale-connection-operation"); };
  const hash = async (file: File) => {
    const value = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))].map(byte => byte.toString(16).padStart(2, "0")).join("");
    onHash(file);
    return value;
  };
  const inspect = () => inspectRecoveryBackup(root, vault, plan, backupOwner, check, abort.signal, hash);
  const execute = async (approved: Awaited<ReturnType<typeof inspect>>) => executeRecoveryBackup(root, vault, plan, approved,
    backupOwner, check, abort.signal, () => {}, hash, async work => work());
  return { bytes, directories, writes, creates, removes, root, vault, plan, abort, inspect, execute, hash,
    deny: () => { denied = true; }, stale: () => { current = false; }, replaceDirectory: (path: string) => { directories.set(path, folder(path)); },
    replaceFile: (path: string) => { handles.delete(path); },
    fail: (value: typeof failure) => { failure = value; }, onClose: (value: typeof onClose) => { onClose = value; },
    onWrite: (value: typeof onWrite) => { onWrite = value; }, onHash: (value: typeof onHash) => { onHash = value; } };
}
