/** 저장된 복사 기록과 현재 목적지 내용을 명시적 요청으로 대조한다. 기록/파일은 수정하지 않는다. */
import type { CopyGroup } from "../lib/copy-journal";
import type { ConnectionOwner, FolderHandle } from "../types";
import { openCopyDirectory, readCopyHistory } from "./copy-journal-storage";
import { createCopyHasher } from "./copy-hash";

export type CopyTargetInspection = Readonly<{
  time: string; items: readonly { itemId: string; status: "matches" | "different" | "missing" | "directory" }[];
}>;
export async function inspectCopyHistoryTargets(root: FolderHandle, path: readonly string[], requested: CopyGroup, owner: ConnectionOwner,
  assertCurrent: () => void, signal: AbortSignal, hashOverride?: (file: File) => Promise<string>): Promise<CopyTargetInspection> {
  const check = () => { assertCurrent(); if (signal.aborted) throw new DOMException("cancelled", "AbortError"); };
  const current = await readCopyHistory(root, path, owner, check); check();
  const group = current.groups.find(g => g.id === requested.id);
  if (!group || current.incomplete || !group.items.length || JSON.stringify(group) !== JSON.stringify(requested)) throw Error("history-record-changed");
  const parent = await openCopyDirectory(root, path, check);
  const hasher = hashOverride ? null : createCopyHasher(signal), hash = hashOverride ?? hasher!.hash;
  const items: { itemId: string; status: "matches" | "different" | "missing" | "directory" }[] = [];
  try {
    for (const item of group.items) {
      check(); let handle: FileSystemFileHandle;
      try { handle = await parent.getFileHandle(item.to.at(-1)!, { create: false }); check(); }
      catch (error) {
        check();
        if (error instanceof DOMException && ["NotFoundError", "TypeMismatchError"].includes(error.name)) {
          try { await parent.getFileHandle(item.to.at(-1)!, { create: false }); check(); throw Error("history-target-changed"); }
          catch (again) {
            check(); if (!(again instanceof DOMException) || again.name !== error.name) throw Error("history-target-changed");
          }
          items.push({ itemId: item.itemId, status: error.name === "NotFoundError" ? "missing" : "directory" }); continue;
        }
        throw error;
      }
      const file = await handle.getFile(); check();
      // Changed size never triggers an unbounded read of a replacement file.
      const sha256 = file.size === item.size ? await hash(file) : null; check();
      const again = await parent.getFileHandle(item.to.at(-1)!, { create: false }); check();
      if (!await handle.isSameEntry(again)) throw Error("history-target-changed"); check();
      const latest = await again.getFile(); check();
      if (latest.size !== file.size || latest.lastModified !== file.lastModified || (sha256 !== null && await hash(latest) !== sha256)) throw Error("history-target-changed"); check();
      items.push({ itemId: item.itemId, status: sha256 === item.sha256 ? "matches" : "different" });
    }
    const latestParent = await openCopyDirectory(root, path, check);
    if (!await parent.isSameEntry(latestParent)) throw Error("history-target-changed"); check();
    const latestHistory = await readCopyHistory(root, path, owner, check); check();
    if (latestHistory.incomplete || JSON.stringify(latestHistory.groups.find(g => g.id === group.id)) !== JSON.stringify(group)) throw Error("history-record-changed");
    if (await root.queryPermission({ mode: "read" }) !== "granted") throw new DOMException("permission", "NotAllowedError"); check();
    return { time: new Date().toISOString(), items };
  } finally { hasher?.dispose(); }
}
