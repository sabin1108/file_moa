import { openSourceDirectory } from "./source-directory";
import type { ManagedHash } from "./managed-tree";
import { MANAGED_LIMITS } from "../lib/managed-files";

export type TextFileProof = {
  handle: FileSystemFileHandle;
  path: readonly string[];
  size: number;
  modified: number;
  sha256: string
};

export async function encodeEditedText(original: File, text: string, check: () => void) {
  if (original.size > MANAGED_LIMITS.editBytes || text.length > MANAGED_LIMITS.editBytes) throw Error("managed-edit-limit");

  const bytes = new Uint8Array(await original.arrayBuffer());

  check();

  const previous = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const normalized = previous.includes("\r\n") && !previous.replaceAll("\r\n", "").includes("\n")
    ? text.replace(/\r?\n/gu, "\r\n")
    : text;
  const bom = bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191 ? new Uint8Array([239, 187, 191]) : new Uint8Array();
  const file = new File([bom, new TextEncoder().encode(normalized)], original.name);

  if (file.size > MANAGED_LIMITS.editBytes) throw Error("managed-edit-limit");

  return file;
}

/** 최초 저장과 반복 자동저장이 공유하는 동일성/버전 검사·청크 쓰기·재읽기 경계. */

export async function writeVerifiedText(
  root: FileSystemDirectoryHandle,
  proof: TextFileProof,
  value: File,
  hash: ManagedHash,
  check: () => void,
  beforeCommit: () => Promise<void>) {
  const current = async () => {
    check();

    const parent = await openSourceDirectory(root, proof.path.slice(0, -1), check);
    const handle = await parent.getFileHandle(proof.path.at(-1)!, { create: false });
    const file = await handle.getFile();

    check();

    if (!await proof.handle.isSameEntry(handle) || file.size !== proof.size || file.lastModified !== proof.modified
      || await hash(file) !== proof.sha256) throw Error("managed-changed");

    check();

    return handle;
  };
  const handle = await current();

  await beforeCommit();

  const stream = await handle.createWritable({ keepExistingData: false, mode: "exclusive" } as FileSystemCreateWritableOptions);

  try {
    await current();

    for (let offset = 0; offset < value.size; offset += 65536) {
      await stream.write(value.slice(offset, offset + 65536));
      check();
    }

    await current();
    await beforeCommit();
    await stream.close();
    check();
  } catch (error) {
    await stream.abort().catch(() => { });

    throw error;
  }

  const parent = await openSourceDirectory(root, proof.path.slice(0, -1), check);
  const latest = await parent.getFileHandle(proof.path.at(-1)!, { create: false });
  const file = await latest.getFile();
  const digest = await hash(value);

  if (!await handle.isSameEntry(latest) || file.size !== value.size || await hash(file) !== digest) throw Error("managed-changed");

  check();

  return {
    handle: latest,
    path: [...proof.path],
    size: file.size,
    modified: file.lastModified,
    sha256: digest
  };
}
