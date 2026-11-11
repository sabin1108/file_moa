export type RecordScope = { type: "global" } | {
  type: "project" | "task";
  id: string
};

export type LocalRecord = {
  schemaVersion: 1;
  recordId: string;
  revisionId: string;
  parentRevisionId: string | null;
  kind: "conversation" | "memory" | "artifact" | "operation";
  scope: RecordScope;
  state: "draft" | "proposed" | "approved" | "inactive" | "final";
  createdAt: string;
  contentFile: string;
  contentSha256: string;
};

export function isRecordId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value)
    && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(value);
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid-record-object");

  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) {
    throw new Error("invalid-record-fields");
  }
}

export function parseLocalRecord(input: unknown): LocalRecord {
  const data = object(input);

  exactKeys(
    data,
    ["schemaVersion", "recordId", "revisionId", "parentRevisionId", "kind", "scope", "state", "createdAt", "contentFile", "contentSha256"]
  );

  if (data.schemaVersion !== 1) throw new Error("unsupported-record-version");

  if (!isRecordId(data.recordId) || !isRecordId(data.revisionId)
    || (data.parentRevisionId !== null && !isRecordId(data.parentRevisionId))
    || data.parentRevisionId === data.revisionId) throw new Error("invalid-record-id");

  if (data.contentFile !== `${data.revisionId}.md`) throw new Error("invalid-content-path");

  if (typeof data.contentSha256 !== "string" || !/^[a-f0-9]{64}$/.test(data.contentSha256)) throw new Error("invalid-content-hash");

  if (typeof data.createdAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(data.createdAt)
    || !Number.isFinite(Date.parse(data.createdAt))
    || new Date(data.createdAt).toISOString() !== data.createdAt) throw new Error("invalid-created-at");

  const scope = object(data.scope);

  if (scope.type === "global") exactKeys(scope, ["type"]);
  else {
    exactKeys(scope, ["type", "id"]);

    if ((scope.type !== "project" && scope.type !== "task") || !isRecordId(scope.id)) throw new Error("invalid-record-scope");
  }

  if (typeof data.kind !== "string" || !["conversation", "memory", "artifact", "operation"].includes(data.kind)) throw new Error("invalid-record-kind");

  const allowedStates = data.kind === "memory" ? ["proposed", "approved", "inactive"] : ["draft", "final"];

  if (typeof data.state !== "string" || !allowedStates.includes(data.state)
    || (data.kind === "memory" && scope.type === "task")) throw new Error("invalid-record-state");

  return { ...data, scope: { ...scope } } as LocalRecord;
}

export function canUseMemory(record: LocalRecord, activeProjectId?: string): boolean {
  return record.kind === "memory" && record.state === "approved"
    && (record.scope.type === "global" || (record.scope.type === "project" && record.scope.id === activeProjectId));
}
