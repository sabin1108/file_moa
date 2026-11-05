/** Checks a copy plan using read capabilities only. The result is a point-in-time report, never execution authority. */
import { COPY_INSPECTION_LIMITS, copyInspectionInput, type CopyInspection, type CopyInspectionFile } from "../lib/copy-inspection";
import { buildFileChangePlan, type FileChangePlan } from "../lib/file-change-plan";
import type { FolderHandle } from "../types";
import { createCopyHasher } from "./copy-hash";
import { readSourceFolderListing } from "./source-folder-listing";

export async function inspectCopyPlan(
  root: FolderHandle,
  plan: FileChangePlan,
  assertCurrent: () => void,
  signal?: AbortSignal,
  hashOverride?: (file: File, signal?: AbortSignal) => Promise<string>,
): Promise<CopyInspection> {
  const input = copyInspectionInput(plan);
  const current = () => {
    assertCurrent();
    if (signal?.aborted) throw new DOMException("Copy inspection cancelled", "AbortError");
  };
  const checkDirectories = async () => {
    current();
    const source = await readSourceFolderListing(root, input.sourcePath, current);
    current();
    const destination = await readSourceFolderListing(root, input.destinationPath, current);
    current();
    const fresh = buildFileChangePlan({ operation: "copy", source, selectedNames: input.rows.map(row => row.from.at(-1)!),
      destinationPath: input.destinationPath, destinations: [{ ...destination, availability: "existing" }] });
    if (fresh.conflictCount) throw new Error("copy-conflict");
  };
  await checkDirectories();
  const openSourceDirectory = async () => {
    let directory: FileSystemDirectoryHandle = root;
    for (const segment of input.sourcePath) {
      directory = await directory.getDirectoryHandle(segment, { create: false });
      current();
    }
    return directory;
  };
  const directory = await openSourceDirectory();
  current();
  const prepared: { row: typeof input.rows[number]; handle: FileSystemFileHandle; file: File }[] = [];
  let totalBytes = 0;
  // Collect metadata before reading any content: a rejected batch must not hash its early files.
  for (const row of input.rows) {
    const handle = await directory.getFileHandle(row.from.at(-1)!, { create: false });
    current();
    const file = await handle.getFile();
    current();
    totalBytes += file.size;
    if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > COPY_INSPECTION_LIMITS.fileBytes
      || totalBytes > COPY_INSPECTION_LIMITS.totalBytes) throw new Error("copy-limit");
    prepared.push({ row, handle, file });
  }
  const hasher = hashOverride ? null : createCopyHasher(signal);
  const hash = hashOverride ?? hasher!.hash;
  const files: CopyInspectionFile[] = [];
  try {
    for (const { row, handle, file } of prepared) {
      current();
      const sha256 = await hash(file, signal);
      current();
      // Resolve from the root again: the containing folder itself may have been replaced.
      const latestDirectory = await openSourceDirectory();
      current();
      const reopened = await latestDirectory.getFileHandle(row.from.at(-1)!, { create: false });
      current();
      const same = await handle.isSameEntry(reopened);
      current();
      if (!same) throw new Error("source-changed");
      const latest = await reopened.getFile();
      current();
      if (latest.size !== file.size || latest.lastModified !== file.lastModified) throw new Error("source-changed");
      const latestHash = await hash(latest, signal);
      current();
      if (!/^[a-f0-9]{64}$/u.test(sha256) || sha256 !== latestHash) throw new Error("source-changed");
      files.push(Object.freeze({ ...row, size: file.size, lastModified: file.lastModified, sha256 }));
    }
    await checkDirectories();
    current();
    return Object.freeze({ files: Object.freeze(files), totalBytes });
  } finally { hasher?.dispose(); }
}
