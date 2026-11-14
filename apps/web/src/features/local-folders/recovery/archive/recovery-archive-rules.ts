export const ARCHIVE_LIMITS = Object.freeze({ entries: 500, operations: 100, items: 500, jsonBytes: 1024 * 1024, readBytes: 8 * 1024 * 1024 });

export type RecoveryArchiveRow = Readonly<{
  id: string;
  fileName: string | null;
  originalPath: readonly string[] | null;
  createdAt: string | null;
  bytes: number | null;
  recorded: "completed" | "incomplete" | "invalid";
  canInspect: boolean;
}>;

export type RecoveryArchiveList = Readonly<{
  items: readonly RecoveryArchiveRow[];
  truncated: boolean
}>;

export type RecoveryArchiveDetail = Readonly<{
  status: "verified" | "damaged" | "uncertain";
  payload: "verified" | "missing" | "damaged" | "not-checked";
  journal: "verified" | "incomplete" | "unavailable" | "changed";
  issue: "missing" | "changed" | "permission" | "record" | "read" | null;
  checkedAt: string;
}>;
