import { describe, expect, it, vi } from "vitest";
import { FolderConnectionSession } from "../../../src/features/local-folders/services/connection-session";
import { createRecoveryVault } from "../../../src/features/local-folders/services/create-recovery-vault";
import { readVaultIdentity } from "../../../src/features/local-folders/services/recovery-vault";
import type { FolderHandle, HandleRepository } from "../../../src/features/local-folders/types";

const owner = { userId: "a", workspaceId: "w" };

/** In-memory File System Access boundary; no OS permissions or external process races simulated. */
function fixture() {
  const entries = new Map<string, FolderHandle>();
  let body = "";
  let exists = false;
  const stream = { write: vi.fn(async (text: string) => { body = text; }), close: vi.fn(async () => {}), abort: vi.fn(async () => {}) };
  const file = {
    getFile: vi.fn(async () => new File([body], ".moa-vault.json", { lastModified: 1 })),
    isSameEntry: vi.fn(async () => true),
    createWritable: vi.fn(async () => stream),
  };
  const base = () => ({ kind: "directory", name: "same-name", queryPermission: vi.fn(async () => "granted"), requestPermission: vi.fn(async () => "granted"),
    resolve: vi.fn(async () => null), getDirectoryHandle: vi.fn(), getFileHandle: vi.fn(), removeEntry: vi.fn() });
  const source = base() as unknown as FolderHandle;
  const vault = base() as unknown as FolderHandle;
  const parent = base() as unknown as FolderHandle;
  for (const handle of [source, vault, parent]) handle.isSameEntry = vi.fn(async other => other === handle);
  parent.getDirectoryHandle = vi.fn(async (_name, options) => {
    if (!options?.create) throw new DOMException("missing", "NotFoundError");
    return vault;
  });
  vault.getFileHandle = vi.fn(async (_name, options) => {
    if (!exists && !options?.create) throw new DOMException("missing", "NotFoundError");
    exists = true;
    return file as unknown as FileSystemFileHandle;
  });
  const repo: HandleRepository = {
    read: vi.fn(async (who, kind) => entries.get(JSON.stringify([who, kind]))),
    write: vi.fn(async (who, kind, handle) => { entries.set(JSON.stringify([who, kind]), handle); }),
    remove: vi.fn(async (who, kind) => { entries.delete(JSON.stringify([who, kind])); }),
  };
  const seed = () => {
    exists = true;
    body = JSON.stringify({ schemaVersion: 1, kind: "moa-recovery-vault", vaultId: "11111111-1111-4111-8111-111111111111", owner, createdAt: "2026-11-04T00:00:00.000Z" });
  };
  return { repo, source, vault, parent, stream, file, seed };
}

describe("RV-003/004 recovery connection", () => {
  it("selects a creation location without writing and requests write permission on the separate creation action", async () => {
    const f = fixture();
    const session = new FolderConnectionSession(f.repo);
    await session.switchOwner(owner);
    await session.select("source", async () => f.source);
    const picker = vi.fn(async () => f.parent);
    vi.mocked(f.parent.queryPermission).mockImplementation(async options => options.mode === "readwrite" ? "prompt" : "granted");
    await session.prepareRecoveryCreation(picker);
    expect(picker).toHaveBeenCalledWith({ mode: "read" });
    expect(f.parent.getDirectoryHandle).not.toHaveBeenCalled();
    vi.mocked(f.parent.requestPermission).mockImplementation(async () => {
      vi.mocked(f.parent.queryPermission).mockResolvedValue("granted");
      return "granted";
    });
    const creating = session.createPreparedRecovery();
    expect(f.parent.requestPermission).toHaveBeenCalledWith({ mode: "readwrite" });
    await creating;
    expect(session.state("recovery")).toBe("connected");
  });

  it("denied creation leaves no folder and reports the exact permission stage", async () => {
    const f = fixture();
    const session = new FolderConnectionSession(f.repo);
    await session.switchOwner(owner);
    await session.select("source", async () => f.source);
    await session.prepareRecoveryCreation(async () => f.parent);
    vi.mocked(f.parent.requestPermission).mockResolvedValue("denied");
    await expect(session.createPreparedRecovery()).rejects.toMatchObject({ stage: "request-write", code: "permission" });
    expect(f.parent.getDirectoryHandle).not.toHaveBeenCalled();
  });

  it("invalidates a chosen creation location after source disconnect", async () => {
    const f = fixture();
    const session = new FolderConnectionSession(f.repo);
    await session.switchOwner(owner);
    await session.select("source", async () => f.source);
    await session.prepareRecoveryCreation(async () => f.parent);
    await session.disconnect("source");
    await expect(session.createPreparedRecovery()).rejects.toThrow("recovery-creation-location-required");
    expect(f.parent.requestPermission).not.toHaveBeenCalled();
    expect(f.parent.getDirectoryHandle).not.toHaveBeenCalled();
  });
  it("creates a new UUID child, closes and verifies identity without deleting entries", async () => {
    const f = fixture();
    expect(await createRecoveryVault(f.parent, owner, [f.source], () => {})).toBe(f.vault);
    expect(f.stream.close).toHaveBeenCalledOnce();
    expect((await readVaultIdentity(f.vault, owner, () => {})).status).toBe("ready");
    expect(f.parent.removeEntry).not.toHaveBeenCalled();
    expect(f.parent.getDirectoryHandle).toHaveBeenLastCalledWith(expect.stringMatching(/^모아 복구 보관함-/), { create: true });
  });

  it("blocks creating in a deep source child before any creation", async () => {
    const f = fixture();
    vi.mocked(f.source.resolve).mockResolvedValue(["child"]);
    await expect(createRecoveryVault(f.parent, owner, [f.source], () => {})).rejects.toThrow("recovery-vault-location");
    expect(f.parent.getDirectoryHandle).not.toHaveBeenCalled();
  });

  it("refuses a protected root with lost permission before creating anything", async () => {
    const f = fixture();
    vi.mocked(f.source.queryPermission).mockResolvedValue("denied");
    await expect(createRecoveryVault(f.parent, owner, [f.source], () => {})).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(f.parent.getDirectoryHandle).not.toHaveBeenCalled();
  });

  it.each(["write", "close"] as const)("propagates %s failures without deletion or success", async step => {
    const f = fixture();
    f.stream[step].mockRejectedValueOnce(Error("disk-full"));
    await expect(createRecoveryVault(f.parent, owner, [f.source], () => {})).rejects.toThrow("disk-full");
    expect(f.stream.abort).toHaveBeenCalled();
    expect(f.vault.removeEntry).not.toHaveBeenCalled();
  });

  it("rejects preexisting directories and identity files without opening writable", async () => {
    const f = fixture();
    vi.mocked(f.parent.getDirectoryHandle).mockResolvedValueOnce(f.vault);
    await expect(createRecoveryVault(f.parent, owner, [f.source], () => {})).rejects.toThrow("recovery-vault-exists");
    f.seed();
    await expect(createRecoveryVault(f.parent, owner, [f.source], () => {})).rejects.toThrow("recovery-vault-exists");
    expect(f.file.createWritable).not.toHaveBeenCalled();
  });

  it("stops after a cancelled write and aborts without closing or deleting", async () => {
    const f = fixture();
    let current = true;
    f.stream.write.mockImplementationOnce(async () => { current = false; });
    await expect(createRecoveryVault(f.parent, owner, [f.source], () => {
      if (!current) throw new DOMException("cancelled", "AbortError");
    })).rejects.toMatchObject({ name: "AbortError" });
    expect(f.stream.abort).toHaveBeenCalledOnce();
    expect(f.stream.close).not.toHaveBeenCalled();
    expect(f.vault.removeEntry).not.toHaveBeenCalled();
  });

  it("refuses identity readback corruption and write permission denial", async () => {
    const f = fixture();
    vi.mocked(f.parent.queryPermission).mockResolvedValueOnce("denied");
    await expect(createRecoveryVault(f.parent, owner, [f.source], () => {})).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(f.parent.getDirectoryHandle).not.toHaveBeenCalled();
    f.stream.close.mockImplementationOnce(async () => {
      f.file.getFile.mockResolvedValue(new File(["broken"], ".moa-vault.json"));
    });
    await expect(createRecoveryVault(f.parent, owner, [f.source], () => {})).rejects.toThrow("recovery-vault-changed");
  });

  it("refuses another owner's vault and revalidates revoked permissions", async () => {
    const f = fixture();
    f.seed();
    const session = new FolderConnectionSession(f.repo);
    await session.switchOwner({ userId: "b", workspaceId: "w" });
    await session.select("source", async () => f.source);
    await expect(session.selectRecovery(async () => f.vault, false)).rejects.toThrow("recovery-vault-foreign-owner");
    await session.switchOwner(owner);
    await session.select("source", async () => f.source);
    await session.selectRecovery(async () => f.vault, false);
    vi.mocked(f.vault.requestPermission).mockResolvedValueOnce("denied");
    await expect(session.reconnectRecovery()).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(session.state("recovery")).toBe("needs-permission");
  });

  it("requires source connection and refuses a normal directory without persisting", async () => {
    const f = fixture();
    const session = new FolderConnectionSession(f.repo);
    await session.switchOwner(owner);
    await expect(session.selectRecovery(async () => f.vault, false)).rejects.toThrow("source-folder-not-connected");
    await session.select("source", async () => f.source);
    await expect(session.selectRecovery(async () => f.vault, false)).rejects.toThrow("recovery-vault-missing");
    expect(session.state("recovery")).toBe("disconnected");
  });

  it("preloads reference without permission/read, explicitly reconnects and invalidates on source change", async () => {
    const f = fixture();
    f.seed();
    const session = new FolderConnectionSession(f.repo);
    await session.switchOwner(owner);
    await session.select("source", async () => f.source);
    await session.selectRecovery(async () => f.vault, false);
    expect(session.state("recovery")).toBe("connected");
    vi.mocked(f.vault.getFileHandle).mockClear();
    await session.switchOwner(owner);
    expect(session.state("recovery")).toBe("needs-permission");
    expect(f.vault.getFileHandle).not.toHaveBeenCalled();
    expect(f.vault.requestPermission).not.toHaveBeenCalled();
    await session.reconnect("source");
    const reconnect = session.reconnectRecovery();
    expect(f.vault.requestPermission).toHaveBeenCalledWith({ mode: "read" });
    await reconnect;
    expect(session.state("recovery")).toBe("connected");
    await session.disconnect("source");
    expect(session.state("recovery")).toBe("needs-permission");
  });

  it("discards late selection after owner switch without storing it", async () => {
    const f = fixture();
    f.seed();
    const session = new FolderConnectionSession(f.repo);
    await session.switchOwner(owner);
    await session.select("source", async () => f.source);
    let finish!: (value: FolderHandle) => void;
    const old = session.selectRecovery(() => new Promise(resolve => { finish = resolve; }), false);
    await session.switchOwner({ userId: "b", workspaceId: "w" });
    finish(f.vault);
    await expect(old).rejects.toThrow("stale-connection-operation");
    expect(session.state("recovery")).toBe("disconnected");
    expect(f.repo.write).toHaveBeenCalledTimes(1);
  });

  it("does not publish connected when persistence fails", async () => {
    const f = fixture();
    f.seed();
    const session = new FolderConnectionSession(f.repo);
    await session.switchOwner(owner);
    await session.select("source", async () => f.source);
    vi.mocked(f.repo.write).mockRejectedValueOnce(Error("quota"));
    await expect(session.selectRecovery(async () => f.vault, false)).rejects.toThrow("quota");
    expect(session.state("recovery")).toBe("disconnected");
  });
});
