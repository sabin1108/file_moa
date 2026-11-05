import { ARCHIVE_LIMITS } from "../lib/recovery-archive";

export type ArchiveReadBudget = { bytes: number };

/** JSON을 크기 제한·strict UTF-8·재읽기로 확인한다. 생성/쓰기는 호출하지 않는다. */
export async function readArchiveRecord(directory: FileSystemDirectoryHandle, name: string, check: () => void,
  current: () => Promise<void>, budget: ArchiveReadBudget, expected?: FileSystemFileHandle) {
  check();
  await current();
  const handle = await directory.getFileHandle(name, { create: false });
  check();
  if (expected) {
    const same = await expected.isSameEntry(handle);
    check();
    if (!same) throw Error("archive-record-changed");
  }
  const file = await handle.getFile();
  check();
  if (file.size > ARCHIVE_LIMITS.jsonBytes) throw Error("archive-record-limit");
  if (budget.bytes + file.size * 2 > ARCHIVE_LIMITS.readBytes) throw Error("archive-scan-limit");
  budget.bytes += file.size * 2;
  const bytes = await file.arrayBuffer();
  check();
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const value: unknown = JSON.parse(text);
  await current();
  const latest = await directory.getFileHandle(name, { create: false });
  check();
  const same = await handle.isSameEntry(latest);
  check();
  const after = await latest.getFile();
  check();
  if (!same || after.size !== file.size || after.lastModified !== file.lastModified) throw Error("archive-record-changed");
  const again = await after.arrayBuffer();
  check();
  if (bytes.byteLength !== file.size || again.byteLength !== after.size
    || new TextDecoder("utf-8", { fatal: true }).decode(again) !== text) throw Error("archive-record-changed");
  return { value, handle };
}
