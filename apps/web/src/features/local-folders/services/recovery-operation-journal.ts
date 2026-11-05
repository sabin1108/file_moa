import { BACKUP_LIMITS } from "../lib/recovery-backup";
import { BackupDirectory } from "./recovery-backup-storage";

/** 새 작업 폴더의 불변 기록 쓰기/재읽기를 공유하고 각 operation의 schema는 주입한다. */
export class RecoveryOperationJournal<T> {
  private records: { name: string; value: T; handles: FileSystemFileHandle[] }[] = [];

  constructor(private readonly stores: readonly BackupDirectory[], private readonly check: () => void,
    private readonly parse: (value: unknown) => T | null, private readonly family: "overwrite" | "restore") {}

  async append(name: string, value: T) {
    if (!this.parse(value)) throw Error(`${this.family}-record-invalid`);
    const body = new Blob([JSON.stringify(value)]);
    if (body.size > BACKUP_LIMITS.manifestBytes) throw Error(`${this.family}-record-limit`);
    const handles: FileSystemFileHandle[] = [];
    for (const store of this.stores) {
      this.check();
      handles.push(await store.write(name, body));
      this.check();
    }
    const record = { name, value, handles };
    await this.verify(record);
    this.records.push(record);
  }

  private async verify(record: typeof this.records[number]) {
    for (const [index, store] of this.stores.entries()) {
      const first = await store.read(record.name, record.handles[index]);
      if (first.file.size > BACKUP_LIMITS.manifestBytes) throw Error(`${this.family}-record-limit`);
      const bytes = await first.file.arrayBuffer();
      this.check();
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      const value = this.parse(JSON.parse(text));
      if (bytes.byteLength !== first.file.size || !value || JSON.stringify(value) !== JSON.stringify(this.parse(record.value))) throw Error(`${this.family}-record-changed`);
      const latest = await store.read(record.name, first.handle);
      const currentBytes = await latest.file.arrayBuffer();
      this.check();
      const current = new TextDecoder("utf-8", { fatal: true }).decode(currentBytes);
      if (currentBytes.byteLength !== latest.file.size || latest.file.size !== first.file.size
        || latest.file.lastModified !== first.file.lastModified || current !== text) throw Error(`${this.family}-record-changed`);
    }
  }

  async audit() {
    for (const record of this.records) await this.verify(record);
  }
}
