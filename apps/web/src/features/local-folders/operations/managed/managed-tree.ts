import { comparableName } from "../planning/file-change-plan";
import { MANAGED_LIMITS, managedNames, managedTreePath, type ManagedNode } from "./managed-files";
import { openSourceDirectory, isRecoveryDirectory } from "../../source-directory";

export type CapturedNode = {
  view: ManagedNode;
  handle: FileSystemFileHandle | FileSystemDirectoryHandle
};

export type ManagedHash = (file: File) => Promise<string>;

export async function captureManagedTree(
  root: FileSystemDirectoryHandle,
  parentPath: readonly string[],
  names: readonly string[],
  check: () => void,
  hash: ManagedHash,
  includeHistory = false) {
  const parent = await openSourceDirectory(root, parentPath, check);
  const nodes: CapturedNode[] = [];
  let bytes = 0;
  let skipped = false;
  const visit = async (directory: FileSystemDirectoryHandle, name: string, path: string[], depth: number) => {
    check();

    if (depth > MANAGED_LIMITS.depth || path.length > 32 || nodes.length >= MANAGED_LIMITS.entries) throw Error("managed-limit");

    managedTreePath(path);

    let fileHandle: FileSystemFileHandle;

    try {
      fileHandle = await directory.getFileHandle(name, { create: false });
    } catch (error) {
      check();

      if (!(error instanceof Error && error.name === "TypeMismatchError")) throw error;

      const child = await directory.getDirectoryHandle(name, { create: false });

      check();

      if (await isRecoveryDirectory(child, check)) throw Error("managed-protected");

      nodes.push({
        handle: child,
        view: { path, kind: "directory", size: 0, modified: 0, sha256: null, payload: null }
      });

      const entries: FileSystemHandle[] = [];

      for await (const entry of child.values()) {
        check();

        if (entries.length >= MANAGED_LIMITS.entries) throw Error("managed-limit");

        entries.push(entry);
      }

      entries.sort((left, right) => left.name.localeCompare(right.name));

      const seen = new Set<string>();

      for (const entry of entries) {
        if (comparableName(entry.name).startsWith(".moa-")
          && !(includeHistory && entry.kind === "directory" && comparableName(entry.name) === ".moa-history")) {
          skipped = true;

          continue;
        }

        if (entry.kind === "directory" && await isRecoveryDirectory(entry as FileSystemDirectoryHandle, check)) {
          skipped = true;

          continue;
        }

        const key = comparableName(entry.name);

        if (seen.has(key)) throw Error("managed-conflict");

        seen.add(key);
        await visit(child, entry.name, [...path, entry.name], depth + 1);
      }

      return;
    }

    const file = await fileHandle.getFile();

    check();
    bytes += file.size;

    if (file.size > MANAGED_LIMITS.fileBytes || bytes > MANAGED_LIMITS.totalBytes) throw Error("managed-limit");

    const sha256 = await hash(file);

    check();

    const latest = await fileHandle.getFile();
    const same = await fileHandle.isSameEntry(await directory.getFileHandle(name, { create: false }));

    check();

    if (!same || latest.size !== file.size || latest.lastModified !== file.lastModified) throw Error("managed-changed");

    nodes.push({
      handle: fileHandle,
      view: {
        path,
        kind: "file",
        size: file.size,
        modified: file.lastModified,
        sha256,
        payload: crypto.randomUUID()
      }
    });
  };

  for (const name of managedNames(names)) await visit(parent, name, [...parentPath, name], 0);

  return { nodes, skipped };
}

export async function assertManagedTree(
  root: FileSystemDirectoryHandle,
  parentPath: readonly string[],
  names: readonly string[],
  expected: readonly CapturedNode[],
  check: () => void,
  hash: ManagedHash) {
  const fresh = await captureManagedTree(
    root,
    parentPath,
    names,
    check,
    hash,
    expected.some(node => node.view.path.some(part => part.toLowerCase() === ".moa-history"))
  );

  if (fresh.nodes.length !== expected.length) throw Error("managed-changed");

  for (let index = 0; index < expected.length; index++) {
    const before = expected[index];
    const now = fresh.nodes[index];
    const same = await before.handle.isSameEntry(now.handle);

    check();

    if (!same || JSON.stringify({ ...before.view, payload: null }) !== JSON.stringify({ ...now.view, payload: null })) throw Error("managed-changed");
  }

  return fresh;
}

export async function assertManagedAbsent(parent: FileSystemDirectoryHandle, name: string, check: () => void) {
  let count = 0;

  for await (const entry of parent.values()) {
    check();

    if (++count > 1000) throw Error("managed-limit");

    if (comparableName(entry.name) === comparableName(name)) throw Error("managed-conflict");
  }
}
