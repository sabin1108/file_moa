import { BACKUP_LIMITS, parseBackupManifest, type BackupManifest } from "./recovery-backup-rules";

/** 백업 전용 불변 파일 저장. 모든 경로는 새 작업 폴더 내부이며 삭제/기존 파일 갱신 API를 노출하지 않는다. */

export class BackupDirectory {
  private constructor(private readonly parent: FileSystemDirectoryHandle, private readonly name: string,
    private readonly directory: FileSystemDirectoryHandle, private readonly check: () => void,
    private readonly verifyParent: () => Promise<void>) { }

  /** 기존 작업 폴더를 읽기만 하여 연다. 생성/입양하지 않는다. */
  static async open(
    parent: FileSystemDirectoryHandle,
    name: string,
    check: () => void,
    verifyParent: () => Promise<void>) {
    check();
    await verifyParent();

    const directory = await parent.getDirectoryHandle(name, { create: false });

    check();

    return new BackupDirectory(parent, name, directory, check, verifyParent);
  }

  static async create(
    parent: FileSystemDirectoryHandle,
    name: string,
    check: () => void,
    verifyParent: () => Promise<void>) {
    check();
    await verifyParent();
    check();

    let count = 0;

    for await (const entry of parent.values()) {
      check();

      if (++count >= BACKUP_LIMITS.operationEntries || entry.name === name) throw Error("backup-storage-full");
    }

    check();

    try {
      await parent.getDirectoryHandle(name, { create: false });
      check();

      throw Error("backup-storage-conflict");
    } catch (error) {
      check();

      if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error;
    }

    const directory = await parent.getDirectoryHandle(name, { create: true });

    check();

    const store = new BackupDirectory(parent, name, directory, check, verifyParent);

    await store.current();

    return store;
  }

  private async current() {
    this.check();
    await this.verifyParent();
    this.check();

    const current = await this.parent.getDirectoryHandle(this.name, { create: false });

    this.check();

    const same = await this.directory.isSameEntry(current);

    this.check();

    if (!same) throw Error("backup-storage-changed");

    return current;
  }

  async write(name: string, body: Blob): Promise<FileSystemFileHandle> {
    if (
      !/^(?:prepared|stopped|item-\d{4}-(?:verified|target-started|target-verified|source-removal-started|source-removed)|editor-save-[a-f0-9-]{36}-(?:started|verified))\.json$|^[a-f0-9-]{36}\.bin$/u.test(
        name,
      )
    )
      throw Error("backup-storage-name");

    const directory = await this.current();

    try {
      await directory.getFileHandle(name, { create: false });
      this.check();

      throw Error("backup-storage-conflict");
    } catch (error) {
      this.check();

      if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error;
    }

    const handle = await directory.getFileHandle(name, { create: true });

    this.check();

    const empty = await handle.getFile();

    this.check();

    if (empty.size !== 0) throw Error("backup-storage-conflict");

    const options = { keepExistingData: false, mode: "exclusive" };
    const stream = await handle.createWritable(options);

    try {
      this.check();
      await this.current();

      const current = await directory.getFileHandle(name, { create: false });

      this.check();

      const same = await handle.isSameEntry(current);

      this.check();

      const initial = await current.getFile();

      this.check();

      if (!same || initial.size !== 0) throw Error("backup-storage-conflict");
      // Fixed-size writes bound individual stream requests, including larger binary payloads.

      for (let offset = 0; offset < body.size; offset += 64 * 1024) {
        await stream.write(body.slice(offset, offset + 64 * 1024));
        this.check();
      }

      await stream.close();
      this.check();
    } catch (error) {
      await stream.abort().catch(() => { });

      throw error;
    }

    return handle;
  }

  async read(name: string, expected?: FileSystemFileHandle) {
    const directory = await this.current();
    const handle = await directory.getFileHandle(name, { create: false });

    this.check();

    if (expected) {
      const same = await expected.isSameEntry(handle);

      this.check();

      if (!same) throw Error("backup-storage-changed");
    }

    const file = await handle.getFile();

    this.check();

    return { handle, file };
  }

  async json(name: string, value: BackupManifest) {
    if (!parseBackupManifest(value)) throw Error("backup-manifest-invalid");

    const payload = JSON.stringify(value);
    const blob = new Blob([payload]);

    if (blob.size > BACKUP_LIMITS.manifestBytes) throw Error("backup-manifest-limit");

    const handle = await this.write(name, blob);

    await this.verifyJson(name, value, handle);

    return handle;
  }

  async verifyJson(name: string, value: BackupManifest, expected?: FileSystemFileHandle) {
    const snapshot = await this.read(name, expected);

    if (snapshot.file.size > BACKUP_LIMITS.manifestBytes) throw Error("backup-manifest-limit");

    const bytes = await snapshot.file.arrayBuffer();

    this.check();

    if (bytes.byteLength !== snapshot.file.size || bytes.byteLength > BACKUP_LIMITS.manifestBytes) throw Error("backup-record-mismatch");

    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const parsed = parseBackupManifest(JSON.parse(text));

    if (!parsed || JSON.stringify(parsed) !== JSON.stringify(parseBackupManifest(value))) throw Error("backup-record-mismatch");

    const latest = await this.read(name, snapshot.handle);
    const currentBytes = await latest.file.arrayBuffer();

    this.check();

    if (currentBytes.byteLength !== latest.file.size || snapshot.file.size !== latest.file.size
      || snapshot.file.lastModified !== latest.file.lastModified
      || new TextDecoder("utf-8", { fatal: true }).decode(currentBytes) !== text) throw Error("backup-record-mismatch");
  }
}
