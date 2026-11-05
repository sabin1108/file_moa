import { z } from "zod";
import { createdAtSchema, ownerSchema, recoveryIdSchema } from "./recovery-vault";
import { comparableName, type FileChangePlan } from "./file-change-plan";
import { COPY_INSPECTION_LIMITS } from "./copy-inspection";

export const BACKUP_LIMITS = Object.freeze({ ...COPY_INSPECTION_LIMITS, manifestBytes: 1024 * 1024, operationEntries: 500 });
const segment = z.string().min(1).max(255).refine(value => value !== "." && value !== ".."
  && !/[/\\:\u0000-\u001f\u007f]/u.test(value) && !comparableName(value).startsWith(".moa-"));
const path = z.array(segment).min(1).max(32);
const row = z.strictObject({ from: path, to: path, issues: z.tuple([z.literal("name-conflict")]) });
const planSchema = z.strictObject({
  operation: z.literal("copy"), rows: z.array(row).min(1).max(BACKUP_LIMITS.files),
  conflictCount: z.number().int().positive(), directoriesToCreate: z.array(z.never()).length(0),
});

/** 충돌 백업 전용 입력이다. 기존 무충돌 copy 검사/실행의 허용 범위는 바꾸지 않는다. */
export function backupPlanInput(value: unknown) {
  const plan = planSchema.parse(value);
  const sourcePath = plan.rows[0].from.slice(0, -1);
  const destinationPath = plan.rows[0].to.slice(0, -1);
  const key = (parts: readonly string[]) => JSON.stringify(parts.map(comparableName));
  if (plan.conflictCount !== plan.rows.length || key(sourcePath) === key(destinationPath)) {
    throw Error("invalid-backup-plan");
  }
  const seen = new Set<string>();
  for (const item of plan.rows) {
    const name = item.from.at(-1)!;
    if (name !== item.to.at(-1) || JSON.stringify(item.from.slice(0, -1)) !== JSON.stringify(sourcePath)
      || JSON.stringify(item.to.slice(0, -1)) !== JSON.stringify(destinationPath) || seen.has(comparableName(name))) {
      throw Error("invalid-backup-plan");
    }
    seen.add(comparableName(name));
  }
  return { rows: plan.rows, sourcePath, destinationPath };
}

/** 혼합 선택에서 정확한 이름 충돌만 백업 대상으로 좁힌다. 다른 위험 신호는 전체 진행을 막는다. */
export function conflictingBackupPlan(plan: FileChangePlan): FileChangePlan | null {
  if (plan.operation !== "copy" || plan.directoriesToCreate.length
    || plan.rows.some(row => row.issues.some(issue => issue !== "name-conflict"))) return null;
  const rows = plan.rows.filter(row => row.issues.length === 1 && row.issues[0] === "name-conflict");
  const result: FileChangePlan = { ...plan, rows, conflictCount: rows.length };
  try {
    backupPlanInput(result);
    return result;
  } catch {
    return null;
  }
}

const metadata = z.strictObject({
  size: z.number().int().min(0).max(BACKUP_LIMITS.fileBytes),
  lastModified: z.number().int().nonnegative(), sha256: z.string().regex(/^[a-f0-9]{64}$/u),
});
const itemSchema = z.strictObject({
  itemId: z.string().regex(/^item-\d{4}$/u), recoveryId: recoveryIdSchema,
  from: path, to: path, source: metadata, target: metadata,
});
const base = {
  schemaVersion: z.literal(1), operation: z.literal("recovery-backup"), operationId: recoveryIdSchema,
  vaultId: recoveryIdSchema, owner: ownerSchema, createdAt: createdAtSchema,
};
const preparedSchema = z.strictObject({ ...base, type: z.literal("prepared"),
  retention: z.strictObject({ policy: z.literal("undecided"), expiresAt: z.null() }),
  items: z.array(itemSchema).min(1).max(BACKUP_LIMITS.files),
}).superRefine((value, context) => {
  try {
    backupPlanInput({ operation: "copy", conflictCount: value.items.length, directoriesToCreate: [],
      rows: value.items.map(item => ({ from: item.from, to: item.to, issues: ["name-conflict"] })) });
    const ids = new Set(value.items.map(item => item.recoveryId));
    const total = value.items.reduce((sum, item) => sum + item.source.size + item.target.size, 0);
    if (total > BACKUP_LIMITS.totalBytes || ids.size !== value.items.length
      || value.items.some((item, index) => item.itemId !== `item-${String(index + 1).padStart(4, "0")}`)) throw Error("invalid");
  } catch {
    context.addIssue({ code: "custom", message: "Invalid backup items" });
  }
});
const verifiedSchema = z.strictObject({ ...base, type: z.literal("item-verified"),
  itemId: z.string().regex(/^item-\d{4}$/u), recoveryId: recoveryIdSchema,
  size: z.number().int().min(0).max(BACKUP_LIMITS.fileBytes), sha256: metadata.shape.sha256,
});
const statusSchema = z.enum(["not-run", "uncertain", "verified"]);
const stoppedSchema = z.strictObject({ ...base, type: z.literal("stopped"),
  reason: z.enum(["completed", "cancelled", "error"]), issue: z.string().max(64).nullable(),
  items: z.array(z.strictObject({ itemId: z.string().regex(/^item-\d{4}$/u), status: statusSchema })).min(1).max(BACKUP_LIMITS.files),
}).refine(value => value.items.every((item, index) => item.itemId === `item-${String(index + 1).padStart(4, "0")}`)
  && (value.reason !== "completed" || (value.issue === null && value.items.every(item => item.status === "verified"))));
const manifestSchema = z.union([preparedSchema, verifiedSchema, stoppedSchema]);

export type BackupManifest = z.infer<typeof manifestSchema>;
export type BackupPrepared = z.infer<typeof preparedSchema>;
export type BackupItem = z.infer<typeof itemSchema>;
export type BackupStatus = z.infer<typeof statusSchema>;
export type BackupInspection = Readonly<{ vaultId: string; files: readonly Omit<BackupItem, "itemId" | "recoveryId">[]; totalBytes: number }>;

export function parseBackupManifest(value: unknown): BackupManifest | null {
  const result = manifestSchema.safeParse(value);
  return result.success ? result.data : null;
}
