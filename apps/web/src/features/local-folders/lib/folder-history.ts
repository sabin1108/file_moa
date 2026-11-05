import type { ConnectionOwner } from "../types";
import type { EntryKind } from "./new-entry";

type HistoryStatus = "pending" | "ready" | "failed" | "uncertain";
export type HistoryRecord = Readonly<{
  id: string; path: readonly string[]; kind: EntryKind; status: HistoryStatus; time: string; owner: ConnectionOwner;
}>;
export type HistoryGroup = Readonly<{
  id: string; path: readonly string[] | null; kind: EntryKind | null;
  status: Exclude<HistoryStatus, "pending">; time: string; count: number;
}>;
type ParsedRecord = { issue: "invalid" | "unsupported" } | { record: HistoryRecord };
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const validPart = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 255
  && value !== "." && value !== ".." && !/[/\\\u0000-\u001f]/u.test(value);

/** 디스크의 JSON을 검증하고 표시와 묶음 판단에 필요한 값만 꺼낸다. */
export function parseHistoryRecord(value: unknown): ParsedRecord {
  if (!object(value)) return { issue: "invalid" };
  if (value.version !== 1) return { issue: "unsupported" };
  const { id, path, status, time, owner } = value;
  const kind = value.kind === undefined ? "folder" : value.kind;
  if (typeof id !== "string" || id.length === 0 || id.length > 128 || /[\u0000-\u001f]/u.test(id)
    || !Array.isArray(path) || path.length === 0 || path.length > 256 || !path.every(validPart)
    || (kind !== "folder" && kind !== "txt" && kind !== "md")
    || (status !== "pending" && status !== "ready" && status !== "failed" && status !== "uncertain")
    || typeof time !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(time)
    || !Number.isFinite(Date.parse(time)) || new Date(time).toISOString() !== time
    || !object(owner) || typeof owner.userId !== "string" || typeof owner.workspaceId !== "string"
    || !owner.userId || !owner.workspaceId || owner.userId.length > 255 || owner.workspaceId.length > 255) return { issue: "invalid" };
  return { record: { id, path: [...path], kind, status, time, owner: { userId: owner.userId, workspaceId: owner.workspaceId } } };
}

/** 시작과 결과가 일치하는 기록만 완료/실패로 표시하며 현재 파일 상태는 추측하지 않는다. */
export function groupHistoryRecords(records: readonly HistoryRecord[], incomplete: boolean): HistoryGroup[] {
  const byId = new Map<string, HistoryRecord[]>();
  for (const record of records) {
    const group = byId.get(record.id) ?? [];
    group.push(record);
    byId.set(record.id, group);
  }
  return [...byId].map(([id, group]): HistoryGroup => {
    const first = group[0];
    const samePath = group.every(record => JSON.stringify(record.path) === JSON.stringify(first.path));
    const sameKind = group.every(record => record.kind === first.kind);
    const pending = group.filter(record => record.status === "pending");
    const terminal = group.filter(record => record.status !== "pending");
    const statuses = new Set(terminal.map(record => record.status));
    const ordered = pending.length > 0 && terminal.length > 0
      && Math.max(...pending.map(record => Date.parse(record.time))) <= Math.min(...terminal.map(record => Date.parse(record.time)));
    let status: HistoryGroup["status"] = "uncertain";
    if (!incomplete && samePath && sameKind && ordered && statuses.size === 1) {
      if (statuses.has("ready")) status = "ready";
      if (statuses.has("failed")) status = "failed";
    }
    return { id, path: samePath ? first.path : null, kind: sameKind ? first.kind : null, status,
      time: group.map(record => record.time).sort().at(-1)!, count: group.length };
  }).sort((left, right) => right.time.localeCompare(left.time) || left.id.localeCompare(right.id));
}
