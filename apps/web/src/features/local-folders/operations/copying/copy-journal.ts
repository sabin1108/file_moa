/** 복사 이벤트를 검증·집계한다. 파일 접근 없이 기록상 결과와 미확인을 구별한다. */
import type { ConnectionOwner } from "../../types";
import type { CopyInspectionFile } from "./copy-inspection-rules";
import { comparableName } from "../planning/file-change-plan";

export type CopyItem = CopyInspectionFile & Readonly<{ itemId: string }>;

export type CopyItemStatus = "not-run" | "started" | "verified" | "uncertain";

type Payload =
  | {
    type: "prepared";
    payload: { items: readonly CopyItem[] }
  }
  | {
    type: "item-started";
    payload: { itemId: string }
  }
  | {
    type: "item-verified";
    payload: {
      itemId: string;
      size: number;
      sha256: string
    }
  }
  | {
    type: "item-uncertain";
    payload: { itemId: string }
  }
  | {
    type: "stopped";
    payload: {
      reason: "completed" | "cancelled" | "error";
      notRunItemIds: readonly string[]
    }
  };

export type CopyEvent = Readonly<{
  schemaVersion: 1;
  operation: "copy";
  operationId: string;
  eventId: string;
  revision: number;
  previousEventId: string | null;
  owner: ConnectionOwner;
  sourceParent: readonly string[];
  destinationParent: readonly string[];
  createdAt: string;
}> & Payload;

export type CopyGroup = Readonly<{
  id: string;
  time: string;
  status: "completed" | "cancelled" | "error" | "uncertain";
  items: readonly (CopyItem & { status: CopyItemStatus })[];
  count: number;
}>;

export const COPY_JOURNAL_LIMITS = {
  entries: 1000,
  records: 400,
  manifestBytes: 128 * 1024,
  eventBytes: 4096,
  totalBytes: 4 * 1024 * 1024
} as const;
const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const integer = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const itemId = (v: unknown): v is string => typeof v === "string" && /^item-\d{4}$/.test(v);
const time = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)
  && Number.isFinite(Date.parse(v))
  && new Date(v).toISOString() === v;
const path = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 256
  && v.every(p => typeof p === "string" && p.length > 0 && p.length <= 255
    && p !== "." && p !== ".."
    && comparableName(p) !== ".moa-history"
    && !/[/\\\u0000-\u001f]/u.test(p));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function parseCopyEvent(value: unknown): CopyEvent | null {
  if (!object(value) || value.schemaVersion !== 1 || value.operation !== "copy" || !uuid(value.operationId)
    || !uuid(value.eventId)
    || !integer(value.revision)
    || (value.revision === 0 ? value.previousEventId !== null : !uuid(value.previousEventId))
    || !time(value.createdAt)
    || !path(value.sourceParent)
    || !path(value.destinationParent)
    || same(value.sourceParent, value.destinationParent)
    || !object(value.owner)
    || ![value.owner.userId, value.owner.workspaceId].every(v => typeof v === "string" && v.length > 0 && v.length <= 255)
    || !object(value.payload)) return null;

  const base = {
    schemaVersion: 1 as const,
    operation: "copy" as const,
    operationId: value.operationId,
    eventId: value.eventId,
    revision: value.revision,
    previousEventId: value.previousEventId as string | null,
    owner: { userId: value.owner.userId as string, workspaceId: value.owner.workspaceId as string },
    sourceParent: [...value.sourceParent],
    destinationParent: [...value.destinationParent],
    createdAt: value.createdAt
  };
  const payload = value.payload;

  if (value.type === "prepared") {
    if (value.revision !== 0 || !Array.isArray(payload.items) || !payload.items.length || payload.items.length > 100) return null;

    const items: CopyItem[] = [], names = new Set<string>();
    let total = 0;

    for (const [index, row] of payload.items.entries()) {
      if (!object(row) || row.itemId !== `item-${String(index + 1).padStart(4, "0")}` || !path(row.from) || !path(row.to)
        || !row.from.length
        || !row.to.length
        || !same(row.from.slice(0, -1), base.sourceParent)
        || !same(row.to.slice(0, -1), base.destinationParent)
        || row.from.at(-1) !== row.to.at(-1)
        || !integer(row.size)
        || row.size > 16 * 1024 * 1024
        || !integer(row.lastModified)
        || !hash(row.sha256)) return null;

      const key = comparableName(row.from.at(-1)!);

      if (names.has(key)) return null;

      names.add(key);
      total += row.size;

      if (total > 64 * 1024 * 1024) return null;

      items.push({
        itemId: row.itemId as string,
        from: [...row.from],
        to: [...row.to],
        size: row.size,
        lastModified: row.lastModified,
        sha256: row.sha256
      });
    }

    return { ...base, type: "prepared", payload: { items } };
  }

  if (value.type === "stopped") {
    if (!["completed", "cancelled", "error"].includes(String(payload.reason)) || !Array.isArray(payload.notRunItemIds)
      || payload.notRunItemIds.length > 100
      || !payload.notRunItemIds.every(itemId)) return null;

    return {
      ...base,
      type: "stopped",
      payload: {
        reason: payload.reason as "completed" | "cancelled" | "error",
        notRunItemIds: [...payload.notRunItemIds]
      }
    };
  }

  if (!itemId(payload.itemId)) return null;

  if (value.type === "item-started" || value.type === "item-uncertain") return { ...base, type: value.type, payload: { itemId: payload.itemId } };

  if (value.type === "item-verified" && integer(payload.size) && hash(payload.sha256)) {
    return {
      ...base,
      type: value.type,
      payload: { itemId: payload.itemId, size: payload.size, sha256: payload.sha256 }
    };
  }

  return null;
}

export function summarizeCopyEvents(events: readonly CopyEvent[], incomplete: boolean): CopyGroup[] {
  const groups = new Map<string, CopyEvent[]>();

  for (const event of events) {
    const list = groups.get(event.operationId) ?? [];

    list.push(event);
    groups.set(event.operationId, list);
  }

  return [...groups].map(([id, raw]): CopyGroup => {
    const unique = new Map<string, CopyEvent>();
    let invalid = incomplete;

    for (const e of raw) {
      const previous = unique.get(e.eventId);

      if (previous && !same(previous, e)) invalid = true;

      unique.set(e.eventId, e);
    }

    const ordered = [...unique.values()].sort((a, b) => a.revision - b.revision);
    const first = ordered[0], prepared = ordered.filter(e => e.type === "prepared");
    const items = prepared.length === 1 && prepared[0].type === "prepared"
      ? prepared[0].payload.items.map(item => ({ ...item, status: "not-run" as CopyItemStatus }))
      : [];
    let active: string | null = null, stopped: CopyGroup["status"] | null = null, uncertain = false;

    for (const [index, e] of ordered.entries()) {
      if (e.revision !== index || e.previousEventId !== (index ? ordered[index - 1].eventId : null)
        || !same(e.owner, first.owner)
        || !same(e.sourceParent, first.sourceParent)
        || !same(e.destinationParent, first.destinationParent)
        || (index > 0 && e.createdAt < ordered[index - 1].createdAt)
        || stopped) {
        invalid = true;

        break;
      }

      if (index === 0) {
        if (e.type !== "prepared") invalid = true;

        continue;
      }

      if (e.type === "prepared") {
        invalid = true;

        break;
      }

      if (e.type === "stopped") {
        if (active || !same(e.payload.notRunItemIds, items.filter(i => i.status === "not-run").map(i => i.itemId))
          || (e.payload.reason === "completed" && items.some(i => i.status !== "verified"))) invalid = true;

        stopped = e.payload.reason;

        continue;
      }

      const item = items.find(i => i.itemId === e.payload.itemId);

      if (!item) {
        invalid = true;

        break;
      }

      if (e.type === "item-started") {
        if (active || uncertain || item.status !== "not-run" || items.find(i => i.status !== "verified") !== item) {
          invalid = true;

          break;
        }

        active = item.itemId;
        item.status = "started";
      } else {
        if (active !== item.itemId || item.status !== "started") {
          invalid = true;

          break;
        }

        if (e.type === "item-verified") {
          if (e.payload.sha256 !== item.sha256 || e.payload.size !== item.size) invalid = true;

          item.status = "verified";
        } else {
          item.status = "uncertain";
          uncertain = true;
        }

        active = null;
      }
    }

    if (!items.length || !stopped || active) invalid = true;
    // Missing tail events can conceal a start: after reconnect, not-run is only proven by a complete valid stop.

    if (invalid) for (const item of items) item.status = "uncertain";

    return {
      id,
      items,
      time: ordered.at(-1)!.createdAt,
      count: unique.size,
      status: invalid ? "uncertain" : stopped!
    };
  }).sort((a, b) => b.time.localeCompare(a.time) || a.id.localeCompare(b.id));
}
