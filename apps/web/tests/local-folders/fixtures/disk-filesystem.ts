import { lstat, mkdir, open, readFile, readdir, rmdir, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { FolderHandle } from "../../../src/features/local-folders/types";

function inside(root: string, target: string) {
  const path = relative(root, target);
  if (isAbsolute(path) || path === ".." || path.startsWith(`..${sep}`)) throw Error("disk-fixture-boundary");
}

async function entryStat(path: string) {
  try {
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) throw Error("disk-fixture-symlink");
    return stat;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") throw new DOMException("missing", "NotFoundError");
    throw error;
  }
}

/** Only filesystem I/O is adapted; browser permission and lock prompts are outside this fixture. */
class DiskHandle {
  readonly name: string;
  private constructor(readonly path: string, private readonly root: string, readonly kind: "file" | "directory", private readonly identity: string) {
    inside(root, path);
    this.name = basename(path);
  }

  static async at(path: string, root: string) {
    inside(root, path);
    const stat = await entryStat(path);
    return new DiskHandle(path, root, stat.isDirectory() ? "directory" : "file", `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`);
  }

  private child(name: string) {
    if (!name || name === "." || name === ".." || /[\\/]/u.test(name)) throw Error("disk-fixture-name");
    const path = resolve(this.path, name);
    inside(this.root, path);
    if (dirname(path) !== this.path) throw Error("disk-fixture-boundary");
    return path;
  }

  async queryPermission(): Promise<PermissionState> { return "granted"; }
  async requestPermission(): Promise<PermissionState> { return "granted"; }
  async isSameEntry(other: unknown) { return other instanceof DiskHandle && this.path === other.path && this.identity === other.identity; }
  async resolve(other: unknown) {
    if (!(other instanceof DiskHandle)) return null;
    const path = relative(this.path, other.path);
    return isAbsolute(path) || path === ".." || path.startsWith(`..${sep}`) ? null : path ? path.split(sep) : [];
  }

  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    const path = this.child(name);
    if (options?.create) {
      try { await mkdir(path); }
      catch (error) { if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error; }
    }
    const handle = await DiskHandle.at(path, this.root);
    if (handle.kind !== "directory") throw new DOMException("file", "TypeMismatchError");
    return handle;
  }

  async getFileHandle(name: string, options?: { create?: boolean }) {
    const path = this.child(name);
    if (options?.create) {
      try { await (await open(path, "wx")).close(); }
      catch (error) { if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error; }
    }
    const handle = await DiskHandle.at(path, this.root);
    if (handle.kind !== "file") throw new DOMException("directory", "TypeMismatchError");
    return handle;
  }

  async *values() {
    for (const name of await readdir(this.path)) yield await DiskHandle.at(this.child(name), this.root);
  }

  async getFile() {
    const stat = await entryStat(this.path);
    return new File([await readFile(this.path)], this.name, { lastModified: Math.trunc(stat.mtimeMs) });
  }

  async createWritable() {
    const chunks: BlobPart[] = [];
    let closed = false;
    return {
      write: async (chunk: BlobPart) => { if (closed) throw Error("closed"); chunks.push(chunk); },
      close: async () => {
        if (closed) throw Error("closed");
        await entryStat(this.path);
        await writeFile(this.path, new Uint8Array(await new Blob(chunks).arrayBuffer()));
        closed = true;
      },
      abort: async () => { chunks.length = 0; closed = true; },
    };
  }

  async removeEntry(name: string, options?: { recursive?: boolean }) {
    if (options?.recursive) throw Error("disk-fixture-recursive-removal-denied");
    const path = this.child(name);
    const stat = await entryStat(path);
    if (stat.isDirectory()) await rmdir(path);
    else await unlink(path);
  }
}

export async function diskDirectory(path: string, root: string): Promise<FolderHandle> {
  const handle = await DiskHandle.at(resolve(path), resolve(root));
  if (handle.kind !== "directory") throw Error("disk-fixture-directory");
  return handle as unknown as FolderHandle;
}
