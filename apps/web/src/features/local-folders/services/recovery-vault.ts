import { parseVaultIdentity, VAULT_IDENTITY_MAX_BYTES, VAULT_IDENTITY_NAME, type VaultIdentity } from "../lib/recovery-vault";
import type { ConnectionOwner, FolderHandle } from "../types";

export type VaultIdentityResult = Readonly<{
  status: "ready";
  identity: VaultIdentity
} | { status: "missing" | "invalid" | "foreign-owner" }>;

/** 명시적으로 전달된 폴더의 식별 파일만 읽는다. 연결/생성/백업은 아직 이 서비스의 책임이 아니다. */

export async function readVaultIdentity(directory: FolderHandle, owner: ConnectionOwner, assertCurrent: () => void): Promise<VaultIdentityResult> {
  const expectedOwner = { ...owner };
  const permission = async () => {
    assertCurrent();

    const result = await directory.queryPermission({ mode: "read" });

    assertCurrent();

    if (result !== "granted") throw new DOMException("Recovery vault read permission required", "NotAllowedError");
  };
  const finish = async (result: VaultIdentityResult) => {
    await permission();

    return result;
  };

  await permission();

  let handle: FileSystemFileHandle;

  try {
    handle = await directory.getFileHandle(VAULT_IDENTITY_NAME, { create: false });
    assertCurrent();
  }
  catch (error) {
    assertCurrent();

    if (error instanceof DOMException && error.name === "NotFoundError") return finish({ status: "missing" });

    if (error instanceof DOMException && error.name === "TypeMismatchError") return finish({ status: "invalid" });

    throw error;
  }

  const file = await handle.getFile();

  assertCurrent();

  if (file.size > VAULT_IDENTITY_MAX_BYTES) return finish({ status: "invalid" });

  const bytes = await file.arrayBuffer();

  assertCurrent();

  if (bytes.byteLength !== file.size || bytes.byteLength > VAULT_IDENTITY_MAX_BYTES) return finish({ status: "invalid" });

  let identity: VaultIdentity | null;

  try {
    identity = parseVaultIdentity(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  }
  catch {
    return finish({ status: "invalid" });
  }

  if (!identity) return finish({ status: "invalid" });

  const current = await directory.getFileHandle(VAULT_IDENTITY_NAME, { create: false });

  assertCurrent();

  const same = await handle.isSameEntry(current);

  assertCurrent();

  if (!same) throw Error("recovery-vault-changed");

  const latest = await current.getFile();

  assertCurrent();

  if (file.size !== latest.size || file.lastModified !== latest.lastModified) throw Error("recovery-vault-changed");

  const currentBytes = new Uint8Array(await latest.arrayBuffer());

  assertCurrent();

  if (currentBytes.length !== bytes.byteLength || !new Uint8Array(bytes).every((byte, index) => byte === currentBytes[index])) throw Error("recovery-vault-changed");

  return finish(identity.owner.userId === expectedOwner.userId && identity.owner.workspaceId === expectedOwner.workspaceId
    ? { status: "ready", identity }
    : { status: "foreign-owner" });
}
