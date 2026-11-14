import type { FolderHandle } from "../types";

/** 자료 루트에 직접 만들거나 자료 밖에 만들 수 있다. 자료의 깊은 하위는 거부한다. */

export async function assertVaultParentLocation(parent: FolderHandle, roots: readonly FolderHandle[], check: () => void) {
  for (const directory of [parent, ...roots]) {
    check();

    const permission = await directory.queryPermission({ mode: "read" });

    check();

    if (permission !== "granted") throw new DOMException("Read permission required", "NotAllowedError");
  }

  for (const root of roots) {
    const same = await parent.isSameEntry(root);

    check();

    const inside = await root.resolve(parent);

    check();

    if (!same && inside !== null) throw Error("recovery-vault-location");
  }
}

/** 보관함 연결/생성이 호출한다. 이름 대신 핸들 관계를 검사하며 실패는 호출자에게 전달한다. */

export async function assertVaultLocation(vault: FolderHandle, roots: readonly FolderHandle[], check: () => void): Promise<void> {
  for (const root of [vault, ...roots]) {
    check();

    const permission = await root.queryPermission({ mode: "read" });

    check();

    if (permission !== "granted") {
      throw new DOMException("Folder read permission required", "NotAllowedError");
    }
  }

  for (const root of roots) {
    const same = await vault.isSameEntry(root);

    check();

    const withinVault = await vault.resolve(root);

    check();

    const withinRoot = await root.resolve(vault);

    check();

    if (same || withinVault !== null || (withinRoot !== null && withinRoot.length !== 1)) {
      throw Error("recovery-vault-location");
    }
  }
}
