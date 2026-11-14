/** 복사 기록의 append와 읽기를 분리한다. 기존 생성 기록이나 사용자 파일을 갱신/삭제하지 않는다. */
import {
  COPY_JOURNAL_LIMITS as limits,
  parseCopyEvent,
  summarizeCopyEvents,
  type CopyEvent,
  type CopyGroup
} from "./copy-journal";
import type { ConnectionOwner, FolderHandle } from "../../types";
import { copyFolderPath } from "../../folder-path";
import { openSourceDirectory } from "../../source-directory";

export type CopyHistory = Readonly<{
  groups: readonly CopyGroup[];
  incomplete: boolean;
  missing: boolean
}>;

const recordName = /^moa-copy-.+\.json$/;

export async function openCopyDirectory(root: FileSystemDirectoryHandle, path: readonly string[], check: () => void) {
  return openSourceDirectory(root, path, check);
}

async function findHistory(parent: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await parent.getDirectoryHandle(".moa-history", { create: false });
  }
  catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return null;

    throw error;
  }
}

export class CopyJournalWriter {
  private directory: FileSystemDirectoryHandle | null = null;
  constructor(private readonly parent: FileSystemDirectoryHandle, private readonly check: () => void,
    private readonly verifyParent: () => Promise<void> = async () => { }) { }
  private async currentDirectory() {
    this.check();
    await this.verifyParent();
    this.check();

    const current = await this.parent.getDirectoryHandle(".moa-history", { create: false });

    this.check();

    if (!this.directory || !await this.directory.isSameEntry(current)) throw Error("copy-journal-changed");

    this.check();

    return current;
  }
  async prepare(itemCount: number, manifestBytes: number) {
    this.check();
    await this.verifyParent();
    this.directory = await findHistory(this.parent);
    this.check();

    let entries = 0, records = 0, bytes = 0;

    if (this.directory) for await (const entry of this.directory.values()) {
      this.check();

      if (++entries > limits.entries) throw Error("copy-history-full");

      if (recordName.test(entry.name)) {
        if (entry.kind !== "file") throw Error("copy-history-full");

        records++;
        bytes += (await (entry as FileSystemFileHandle).getFile()).size;
        this.check();
      }
    }

    if (entries + 2 * itemCount + 2 > limits.entries || records + 2 * itemCount + 2 > limits.records
      || bytes + manifestBytes + (2 * itemCount + 1) * limits.eventBytes > limits.totalBytes) throw Error("copy-history-full");

    this.directory ??= await this.parent.getDirectoryHandle(".moa-history", { create: true });
    this.check();
    await this.currentDirectory();
  }
  async append(event: CopyEvent) {
    this.check();

    if (!this.directory) throw Error("copy-journal-not-ready");

    const directory = await this.currentDirectory();
    const payload = JSON.stringify(event), size = new TextEncoder().encode(payload).length;

    if (!parseCopyEvent(event) || size > (event.type === "prepared" ? limits.manifestBytes : limits.eventBytes)) throw Error("copy-journal-invalid");

    const name = `moa-copy-${event.operationId}-${event.revision}-${event.eventId}.json`;

    try {
      await this.directory.getFileHandle(name, { create: false });

      throw Error("copy-journal-conflict");
    }
    catch (error) {
      if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error;
    }

    this.check();

    const file = await directory.getFileHandle(name, { create: true });

    this.check();

    if ((await file.getFile()).size !== 0) throw Error("copy-journal-conflict");

    this.check();

    const options = { keepExistingData: false, mode: "exclusive" };

    if (!await file.isSameEntry(await directory.getFileHandle(name, { create: false }))) throw Error("copy-journal-changed");

    this.check();

    const stream = await file.createWritable(options);

    try {
      this.check();

      if ((await file.getFile()).size !== 0) throw Error("copy-journal-conflict");

      this.check();
      await stream.write(payload);
      this.check();
      await stream.close();
    } catch (error) {
      await stream.abort().catch(() => { });

      throw error;
    }

    this.check();

    const currentDirectory = await this.currentDirectory();
    const reopened = await currentDirectory.getFileHandle(name, { create: false });

    this.check();

    if (!await file.isSameEntry(reopened)) throw Error("copy-journal-changed");

    this.check();

    if (await (await reopened.getFile()).text() !== payload) throw Error("copy-journal-verification");

    this.check();
  }
}

export async function readCopyHistory(root: FolderHandle, path: readonly string[], owner: ConnectionOwner, check: () => void): Promise<CopyHistory> {
  const parentPath = copyFolderPath(path);
  const permission = async () => {
    check();

    const result = await root.queryPermission({ mode: "read" });

    check();

    if (result !== "granted") throw new DOMException("permission", "NotAllowedError");
  };

  await permission();

  const parent = await openCopyDirectory(root, parentPath, check), directory = await findHistory(parent);

  check();

  if (!directory) {
    await permission();

    return { groups: [], incomplete: false, missing: true };
  }

  const events: CopyEvent[] = [];
  let entries = 0, files = 0, bytes = 0, incomplete = false;

  for await (const handle of directory.values()) {
    check();

    if (++entries > limits.entries) {
      incomplete = true;

      break;
    }

    if (!recordName.test(handle.name)) continue;

    if (handle.kind !== "file") {
      incomplete = true;

      continue;
    }

    if (++files > limits.records) {
      incomplete = true;

      break;
    }

    try {
      const file = await (handle as FileSystemFileHandle).getFile();

      check();

      if (file.size > limits.manifestBytes) {
        incomplete = true;

        continue;
      }

      bytes += file.size;

      if (bytes > limits.totalBytes) {
        incomplete = true;

        break;
      }

      const buffer = await file.arrayBuffer();

      check();

      if (buffer.byteLength !== file.size) {
        incomplete = true;

        continue;
      }

      const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
      const event = parseCopyEvent(value);

      if (!event || (event.type !== "prepared" && file.size > limits.eventBytes)) {
        incomplete = true;

        continue;
      }

      if (event.owner.userId !== owner.userId || event.owner.workspaceId !== owner.workspaceId) continue;

      if (JSON.stringify(event.destinationParent) !== JSON.stringify(parentPath)) {
        incomplete = true;

        continue;
      }

      events.push(event);
    } catch (error) {
      check();

      if (error instanceof DOMException && ["NotAllowedError", "SecurityError", "AbortError"].includes(error.name)) throw error;

      incomplete = true;
    }
  }

  await permission();

  return { groups: summarizeCopyEvents(events, incomplete), incomplete, missing: false };
}
