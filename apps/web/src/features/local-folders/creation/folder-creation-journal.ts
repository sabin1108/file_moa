import type { ConnectionOwner, FolderHandle } from "../types";
import { copyFolderPath } from "../folder-path";
import { FOLDER_RECORDS_DIRECTORY, type EntryKind } from "./new-entry";

export type FolderCreationRecord = Readonly<{
  version: 1;
  id: string;
  path: readonly string[];
  kind?: EntryKind;
  status: "pending" | "ready" | "uncertain" | "failed";
  time: string;
}>;

export interface FolderCreationJournal {
  put(record: FolderCreationRecord): Promise<void>;
  assertWritable(): Promise<void>
}

/** 현재 생성 위치 안의 기록 폴더를 필요할 때 준비한다. 같은 작업의 terminal 기록은 캡처한 위치에 남긴다. */

export class DirectoryFolderCreationJournal implements FolderCreationJournal {
  private directory: FileSystemDirectoryHandle | null = null;
  private readonly parentPath: readonly string[];
  constructor(private readonly root: FolderHandle, private readonly owner: ConnectionOwner, private readonly sourceName: string,
    parentPath: readonly string[] = [], private readonly assertCurrent: () => void = () => { }) {
    this.parentPath = copyFolderPath(parentPath);
  }
  private async destination() {
    if (this.directory) return this.directory;

    this.assertCurrent();

    let parent: FileSystemDirectoryHandle = this.root;

    for (const part of this.parentPath) {
      parent = await parent.getDirectoryHandle(part, { create: false });
      this.assertCurrent();
    }

    try {
      this.directory = await parent.getDirectoryHandle(FOLDER_RECORDS_DIRECTORY, { create: true });
    }
    catch (error) {
      if (error instanceof DOMException && error.name === "TypeMismatchError") throw new Error("journal-location-conflict");

      throw error;
    }

    this.assertCurrent();

    return this.directory;
  }
  async assertWritable() {
    if (await this.root.queryPermission({ mode: "readwrite" }) !== "granted") throw new Error("journal-permission");
  }
  async put(record: FolderCreationRecord) {
    await this.assertWritable();

    const directory = await this.destination();
    const name = `moa-folder-${record.id}-${record.status}-${crypto.randomUUID()}.json`;
    // 기록 전용 폴더의 무작위 새 파일만 쓴다. 기존 기록을 갱신하지 않는다.

    try {
      await directory.getFileHandle(name, { create: false });

      throw new Error("journal-conflict");
    }
    catch (error) {
      if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error;
    }

    const file = await directory.getFileHandle(name, { create: true });

    if ((await file.getFile()).size !== 0) throw new Error("journal-conflict");

    const stream = await file.createWritable();
    const payload = JSON.stringify({ ...record, owner: this.owner, sourceName: this.sourceName }, null, 2);

    try {
      await stream.write(payload);
      await stream.close();
    } catch (error) {
      await stream.abort().catch(() => { });

      throw error;
    }

    if (await (await file.getFile()).text() !== payload) throw new Error("journal-verification-failed");
  }
}
