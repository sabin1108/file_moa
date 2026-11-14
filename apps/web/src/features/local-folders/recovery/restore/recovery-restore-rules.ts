import { z } from "zod";
import { comparableName } from "../../operations/planning/file-change-plan";
import { resolveEntryName } from "../../creation/new-entry";
import { BACKUP_LIMITS } from "../backup/recovery-backup-rules";
import { createdAtSchema, ownerSchema, recoveryIdSchema } from "../recovery-vault-rules";

const segment = z.string().min(1).max(255).refine(value => value !== "." && value !== ".."
  && !/[/\\:\u0000-\u001f\u007f]/u.test(value)
  && !comparableName(value).startsWith(".moa-"));
const parent = z.array(segment).max(32);

export function restoreDestinationPath(value: unknown): string[] {
  return parent.parse(value);
}

/** 승인 전에만 빈 이름을 제안한다. 실행 중에는 승인된 이름을 바꾸지 않는다. */

export function restoreFileName(original: string, existing: readonly string[]) {
  const name = resolveEntryName(original, "folder");

  if (comparableName(name).startsWith(".moa-")) throw Error("restore-name-invalid");

  const used = new Set(existing.map(comparableName));

  if (!used.has(comparableName(name))) return name;

  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot) : "";
  const stem = dot > 0 ? name.slice(0, dot) : name;

  for (let index = 1; index <= 1000; index++) {
    const suffix = ` (복원 ${index})`;
    const maxStem = 255 - extension.length - suffix.length;

    if (maxStem < 1) throw Error("restore-name-invalid");

    let prefix = "";

    for (const point of stem) {
      if (prefix.length + point.length > maxStem) break;

      prefix += point;
    }

    const candidate = resolveEntryName(`${prefix}${suffix}${extension}`, "folder");

    if (!used.has(comparableName(candidate))) return candidate;
  }

  throw Error("restore-name-unavailable");
}

export type RestorePreview = Readonly<{
  id: string;
  destination: readonly string[];
  name: string;
  originalName: string;
  size: number;
  renamed: boolean;
}>;

export type RestoreExecution = Readonly<{
  id: string;
  phase: "preparing" | "restoring" | "completed" | "cancelled" | "error";
  status: "not-run" | "uncertain" | "verified";
  path: readonly string[];
  issue: string | null;
  journalComplete: boolean;
}>;

const base = {
  schemaVersion: z.literal(1),
  operation: z.literal("recovery-restore"),
  operationId: recoveryIdSchema,
  backupOperationId: recoveryIdSchema,
  itemId: z.string().regex(/^item-\d{4}$/u),
  recoveryId: recoveryIdSchema,
  vaultId: recoveryIdSchema,
  owner: ownerSchema,
  createdAt: createdAtSchema,
};
const status = z.enum(["not-run", "uncertain", "verified"]);
const schema = z.union([
  z.strictObject({
    ...base,
    type: z.literal("prepared"),
    from: z.array(segment).min(1).max(32),
    to: z.array(segment).min(1).max(33),
    size: z.number().int().min(0).max(BACKUP_LIMITS.fileBytes),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u)
  }),
  z.strictObject({ ...base, type: z.enum(["target-started", "target-verified"]) }),
  z.strictObject({
    ...base,
    type: z.literal("stopped"),
    reason: z.enum(["completed", "cancelled", "error"]),
    status,
    issue: z.string().max(64).nullable()
  }).refine(value => value.reason !== "completed" || (value.status === "verified" && value.issue === null)),
]);

export type RestoreRecord = z.infer<typeof schema>;

export function parseRestoreRecord(value: unknown): RestoreRecord | null {
  const result = schema.safeParse(value);

  return result.success ? result.data : null;
}
