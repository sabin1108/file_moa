import type { ConnectionOwner, FolderHandle } from "../types";
import { parseVaultIdentity, VAULT_IDENTITY_NAME } from "./recovery-vault-rules";
import { readVaultIdentity } from "./recovery-vault";
import { assertVaultLocation, assertVaultParentLocation } from "./recovery-vault-location";
import { recoveryStage } from "./recovery-connection-error";

/** 명시적 생성에서만 호출한다. 실패한 새 폴더를 자동 삭제하지 않으며 readback 뒤 핸들을 반환한다. */

export async function createRecoveryVault(parent: FolderHandle, owner: ConnectionOwner, roots: readonly FolderHandle[], check: () => void): Promise<FolderHandle> {
  check();
  await recoveryStage("request-write", async () => {
    const permission = await parent.queryPermission({ mode: "readwrite" });

    check();

    if (permission !== "granted") {
      throw new DOMException("Vault write permission required", "NotAllowedError");
    }
  });
  await recoveryStage("check-location", () => assertVaultParentLocation(parent, roots, check));

  const identity = parseVaultIdentity({
    schemaVersion: 1,
    kind: "moa-recovery-vault",
    vaultId: crypto.randomUUID(),
    owner: { ...owner },
    createdAt: new Date().toISOString(),
  });

  if (!identity) {
    throw Error("invalid-connection-owner");
  }

  const name = `모아 복구 보관함-${identity.vaultId}`;

  try {
    await parent.getDirectoryHandle(name, { create: false });
    check();

    throw Error("recovery-vault-exists");
  } catch (error) {
    check();

    if (!(error instanceof DOMException && error.name === "NotFoundError")) {
      throw error;
    }
  }

  const directory = await parent.getDirectoryHandle(name, { create: true }) as FolderHandle;

  check();
  await recoveryStage("check-location", () => assertVaultLocation(directory, roots, check));

  await recoveryStage("write-identity", async () => {
    try {
      await directory.getFileHandle(VAULT_IDENTITY_NAME, { create: false });
      check();

      throw Error("recovery-vault-exists");
    } catch (error) {
      check();

      if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error;
    }

    const file = await directory.getFileHandle(VAULT_IDENTITY_NAME, { create: true });

    check();

    const initial = await file.getFile();

    check();

    if (initial.size !== 0) {
      throw Error("recovery-vault-exists");
    }

    const stream = await file.createWritable({ keepExistingData: false });

    try {
      check();
      await stream.write(JSON.stringify(identity));
      check();
      await stream.close();
      check();
    } catch (error) {
      await stream.abort().catch(() => { });

      throw error;
    }
  });

  await recoveryStage("verify-identity", async () => {
    const result = await readVaultIdentity(directory, owner, check);

    check();

    if (result.status !== "ready" || JSON.stringify(result.identity) !== JSON.stringify(identity)) {
      throw Error("recovery-vault-changed");
    }

    await assertVaultLocation(directory, roots, check);
  });

  return directory;
}
