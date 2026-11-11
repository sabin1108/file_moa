import { z } from "zod";
import { BACKUP_LIMITS, parseBackupManifest, type BackupPrepared } from "./recovery-backup";
import { createdAtSchema, ownerSchema, recoveryIdSchema } from "./recovery-vault";

const base = {
  schemaVersion: z.literal(1),
  operation: z.literal("recovery-overwrite"),
  operationId: recoveryIdSchema,
  backupOperationId: recoveryIdSchema,
  vaultId: recoveryIdSchema,
  owner: ownerSchema,
  createdAt: createdAtSchema,
};
const itemId = z.string().regex(/^item-\d{4}$/u);
const status = z.enum(["not-run", "uncertain", "verified"]);
const schema = z.union([
  z.strictObject({
    ...base,
    type: z.literal("prepared"),
    backup: z.custom<BackupPrepared>(value => parseBackupManifest(value)?.type === "prepared")
  }),
  z.strictObject({ ...base, type: z.enum(["target-started", "target-verified"]), itemId }),
  z.strictObject({
    ...base,
    type: z.literal("stopped"),
    reason: z.enum(["completed", "cancelled", "error"]),
    issue: z.string().max(64).nullable(),
    items: z.array(z.strictObject({ itemId, status })).min(1).max(BACKUP_LIMITS.files)
  }),
]);

export type OverwriteRecord = z.infer<typeof schema>;

export type OverwriteExecution = Readonly<{
  id: string;
  phase: "preparing" | "replacing" | "completed" | "cancelled" | "error";
  items: readonly {
    itemId: string;
    status: z.infer<typeof status>
  }[];
  issue: string | null;
  journalComplete: boolean;
}>;

/** 외부 JSON의 필드/owner/UUID/상태 형식을 런타임에서 검사한다. */

export function parseOverwriteRecord(value: unknown): OverwriteRecord | null {
  const parsed = schema.safeParse(value);

  return parsed.success ? parsed.data : null;
}
