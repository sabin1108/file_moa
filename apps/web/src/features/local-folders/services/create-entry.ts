import type { FolderHandle } from "../types";
import { copyFolderPath } from "../lib/folder-path";
import type { FolderCreationJournal, FolderCreationRecord } from "./folder-creation-journal";
import { resolveNewEntry, type EntryKind } from "../lib/new-entry";
import { openSourceDirectory } from "./source-directory";
const comparable = (name: string) => name.normalize("NFC").toLocaleLowerCase("en-US");

/** 빈 폴더/파일 생성. 파일에는 writable stream을 열지 않아 외부에서 생긴 파일도 절삭하지 않는다. */
export async function createEntry(root: FolderHandle, parentPath: readonly string[], rawName: string,
  assertCurrent: () => void, journal: FolderCreationJournal,
  lock: (work: () => Promise<readonly string[]>) => Promise<readonly string[]> = work => work(),
  selectedKind: EntryKind = "folder",
): Promise<readonly string[]> {
  const path = copyFolderPath(parentPath);
  const { name, kind } = resolveNewEntry(rawName, selectedKind);
  assertCurrent();
  // 이 앞에 await를 넣지 않는다. 브라우저 transient activation이 필요하다.
  const permission = await root.requestPermission({ mode: "readwrite" });
  assertCurrent();
  if (permission !== "granted") throw new DOMException("Write permission required", "NotAllowedError");
  return lock(async () => {
    assertCurrent();
    const resolveParent = () => openSourceDirectory(root, path, assertCurrent);
    const parent = await resolveParent();
    const checkConflict = async () => {
      for await (const entry of parent.values()) {
        assertCurrent();
        if (comparable(entry.name) === comparable(name)) throw new Error("entry-name-conflict");
      }
    };
    await checkConflict(); assertCurrent();
    const record: FolderCreationRecord = { version: 1, id: crypto.randomUUID(), path: [...path, name], kind, status: "pending", time: new Date().toISOString() };
    await journal.put(record);
    let started = false, readyRecorded = false;
    try {
      assertCurrent();
      const currentParent = await resolveParent();
      if (!await parent.isSameEntry(currentParent)) throw new Error("folder-parent-changed");
      assertCurrent();
      if (await root.queryPermission({ mode: "readwrite" }) !== "granted") throw new DOMException("Write permission lost", "NotAllowedError");
      assertCurrent(); await checkConflict(); assertCurrent();
      await journal.assertWritable(); assertCurrent();
      started = true;
      const created = kind === "folder" ? await parent.getDirectoryHandle(name, { create: true }) : await parent.getFileHandle(name, { create: true });
      assertCurrent();
      const reopened = kind === "folder" ? await parent.getDirectoryHandle(name, { create: false }) : await parent.getFileHandle(name, { create: false });
      if (!await created.isSameEntry(reopened)) throw new Error("folder-result-changed");
      if (reopened.kind === "file" && (await (reopened as FileSystemFileHandle).getFile()).size !== 0) throw new Error("entry-result-not-empty");
      const finalParent = await resolveParent();
      if (!await parent.isSameEntry(finalParent)) throw new Error("folder-parent-changed");
      assertCurrent();
      await journal.put({ ...record, status: "ready", time: new Date().toISOString() });
      readyRecorded = true;
      assertCurrent();
      return record.path;
    } catch (error) {
      if (readyRecorded) throw error;
      await journal.put({ ...record, status: started ? "uncertain" : "failed", time: new Date().toISOString() }).catch(() => {});
      if (started) throw new Error("entry-result-uncertain", { cause: error });
      throw error;
    }
  });
}
