import { z } from "zod";
import type { ConnectionOwner } from "../types";

export const VAULT_IDENTITY_NAME = ".moa-vault.json";
export const VAULT_IDENTITY_MAX_BYTES = 8 * 1024;

const ownerPartSchema = z.string()
  .min(1)
  .max(128)
  .refine(value => value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value));

export const ownerSchema = z.strictObject({
  userId: ownerPartSchema,
  workspaceId: ownerPartSchema,
}) satisfies z.ZodType<ConnectionOwner>;

export const createdAtSchema = z.iso.datetime({ precision: 3 })
  .refine(value => Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value);

export const recoveryIdSchema = z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);

const vaultIdentitySchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal("moa-recovery-vault"),
  vaultId: recoveryIdSchema,
  owner: ownerSchema,
  createdAt: createdAtSchema,
});

/** 형식과 타입을 같은 스키마에서 정한다. 권한/복구본 검증/쓰기 승인은 별도다. */
export type VaultIdentity = Readonly<z.infer<typeof vaultIdentitySchema>>;

export function parseVaultIdentity(value: unknown): VaultIdentity | null {
  const result = vaultIdentitySchema.safeParse(value);

  return result.success ? result.data : null;
}
