import { parseOverwriteRecord, type OverwriteRecord } from "../lib/recovery-overwrite";
import { BackupDirectory } from "./recovery-backup-storage";
import { RecoveryOperationJournal } from "./recovery-operation-journal";

/** 별도 versioned overwrite family. 기존 백업 기록은 수정하지 않는다. */
export class OverwriteJournal extends RecoveryOperationJournal<OverwriteRecord> {
  constructor(stores: readonly BackupDirectory[], check: () => void) {
    super(stores, check, parseOverwriteRecord, "overwrite");
  }
}
