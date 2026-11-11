import type { RestoreRecord } from "./recovery-restore";

export type RestoreHistoryGroup = Readonly<{
  id: string;
  time: string | null;
  from: readonly string[] | null;
  to: readonly string[] | null;
  size: number | null;
  sha256: string | null;
  count: number;
  status: "completed" | "cancelled" | "error" | "uncertain";
  fileStatus: "not-run" | "uncertain" | "verified";
}>;

export type RestoreHistory = Readonly<{
  groups: readonly RestoreHistoryGroup[];
  missing: boolean;
  incomplete: boolean;
  excluded: number;
}>;

/** 저장된 한 작업의 일관성만 요약한다. 현재 파일/보관함 검사 결과로 사용하지 않는다. */

export function summarizeRestoreRecords(id: string, records: readonly RestoreRecord[],
  parentPath: readonly string[], incomplete: boolean): RestoreHistoryGroup {
  const prepared = records.find(record => record.type === "prepared");
  const stopped = records.find(record => record.type === "stopped");
  const started = records.some(record => record.type === "target-started");
  const verified = records.some(record => record.type === "target-verified");
  const anchor = prepared ?? stopped;
  const types = new Set(records.map(record => record.type));
  const matchingPath = prepared?.to.length === parentPath.length + 1
    && parentPath.every((part, index) => prepared.to[index] === part);
  const matchingBase = !!anchor
    && records.every(record => record.operationId === id
      && record.backupOperationId === anchor.backupOperationId
      && record.itemId === anchor.itemId
      && record.recoveryId === anchor.recoveryId
      && record.vaultId === anchor.vaultId
      && record.createdAt === anchor.createdAt
      && record.owner.userId === anchor.owner.userId
      && record.owner.workspaceId === anchor.owner.workspaceId);
  const invalid = incomplete || !prepared || !stopped || !matchingPath || !matchingBase
    || types.size !== records.length
    || (verified && !started)
    || (stopped.status === "not-run" && verified)
    || (stopped.reason === "completed" && (!started || !verified))
    || (stopped.reason !== "completed" && stopped.status === "verified");

  return {
    id,
    time: anchor?.createdAt ?? null,
    from: matchingPath ? prepared.from : null,
    to: matchingPath ? prepared.to : null,
    size: matchingPath ? prepared.size : null,
    sha256: matchingPath ? prepared.sha256 : null,
    count: records.length,
    status: invalid ? "uncertain" : stopped.reason,
    fileStatus: invalid ? "uncertain" : stopped.status,
  };
}
