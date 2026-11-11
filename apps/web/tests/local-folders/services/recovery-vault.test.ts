import { describe, expect, it, vi } from "vitest";
import { parseVaultIdentity } from "../../../src/features/local-folders/lib/recovery-vault";
import { readVaultIdentity } from "../../../src/features/local-folders/services/recovery-vault";
import type { FolderHandle } from "../../../src/features/local-folders/types";

const owner = { userId: "test", workspaceId: "work" };
const identity = () => ({
  schemaVersion: 1,
  kind: "moa-recovery-vault",
  vaultId: "11111111-1111-4111-8111-111111111111",
  owner: { ...owner },
  createdAt: "2026-11-03T00:00:00.000Z"
});

function fixture(body: Uint8Array = new TextEncoder().encode(JSON.stringify(identity()))) {
  const getFile = vi.fn(async () => new File([body.slice().buffer], ".moa-vault.json", { lastModified: 1 }));
  const file = { getFile, isSameEntry: vi.fn(async () => true) };
  const directory = {
    kind: "directory",
    queryPermission: vi.fn(async () => "granted"),
    requestPermission: vi.fn(),
    getFileHandle: vi.fn(async () => file),
    getDirectoryHandle: vi.fn(),
    removeEntry: vi.fn()
  };

  return {
    directory,
    file,
    read: (check = () => { }) => readVaultIdentity(directory as unknown as FolderHandle, owner, check)
  };
}

describe("recovery vault identity foundation", () => {
  it("VAULT-001 normalizes a valid identity without sharing owner references", () => {
    const value = identity(), result = parseVaultIdentity(value);

    expect(result).toEqual(value);
    value.owner.userId = "changed";
    expect(result?.owner.userId).toBe("test");
  });
  it("VAULT-001 rejects unknown versions, extra payloads, malformed UUID/time and invalid owners", () => {
    for (const value of [null, [], { ...identity(), schemaVersion: 2 }, { ...identity(), body: "private" },
      { ...identity(), vaultId: "../escape" }, { ...identity(), createdAt: "2026-02-30T00:00:00.000Z" },
      { ...identity(), owner: { ...owner, userId: " " } }, { ...identity(), owner: { ...owner, workspaceId: "x".repeat(129) } }]) {
      expect(parseVaultIdentity(value)).toBeNull();
    }
  });
  it("SCHEMA-001 preserves exact owner keys, UTC milliseconds and lowercase identifier rules", () => {
    for (const value of [
      { ...identity(), owner: { ...owner, extra: true } },
      { ...identity(), owner: { ...owner, userId: " test" } },
      { ...identity(), owner: { ...owner, userId: "test\n" } },
      { ...identity(), createdAt: "2026-11-03T00:00:00Z" },
      { ...identity(), createdAt: "2026-11-03T09:00:00.000+09:00" },
      { ...identity(), vaultId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" },
    ]) {
      expect(parseVaultIdentity(value)).toBeNull();
    }
  });
  it("VAULT-002 reads metadata with no permission prompt, creation or deletion", async () => {
    const { read, directory } = fixture();

    expect(await read()).toEqual({ status: "ready", identity: identity() });
    expect(directory.getFileHandle).toHaveBeenCalledWith(".moa-vault.json", { create: false });
    expect(directory.queryPermission).toHaveBeenCalledTimes(2);

    for (const call of [directory.requestPermission, directory.getDirectoryHandle, directory.removeEntry]) expect(call).not.toHaveBeenCalled();
  });
  it("VAULT-002 missing metadata does not adopt a normal directory as a vault", async () => {
    const { read, directory } = fixture();

    directory.getFileHandle.mockRejectedValue(new DOMException("missing", "NotFoundError"));
    expect(await read()).toEqual({ status: "missing" });
  });
  it("VAULT-002 refuses another owner", async () => {
    const { read } = fixture(new TextEncoder().encode(JSON.stringify({ ...identity(), owner: { ...owner, userId: "other" } })));

    expect(await read()).toEqual({ status: "foreign-owner" });
  });
  it("VAULT-002 rejects invalid UTF-8 and JSON", async () => {
    for (const bytes of [new Uint8Array([0xff]), new TextEncoder().encode("not json")]) expect(await fixture(bytes).read()).toEqual({ status: "invalid" });
  });
  it("VAULT-002 refuses oversize records before reading bytes", async () => {
    const { read, file } = fixture();
    const arrayBuffer = vi.fn();

    file.getFile.mockResolvedValue({ size: 8193, lastModified: 1, arrayBuffer } as unknown as File);
    expect(await read()).toEqual({ status: "invalid" });
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
  it("VAULT-003 propagates initial or final permission loss", async () => {
    for (const atEnd of [false, true]) {
      const { read, directory } = fixture();

      if (atEnd) directory.queryPermission.mockResolvedValueOnce("granted");

      directory.queryPermission.mockResolvedValue("denied");
      await expect(read()).rejects.toMatchObject({ name: "NotAllowedError" });
    }
  });
  it("VAULT-003 does not return stale success after cancellation", async () => {
    const { read, file } = fixture();
    let current = true;

    file.isSameEntry.mockImplementation(async () => {
      current = false;

      return true;
    });
    await expect(read(() => {
      if (!current) throw new DOMException("cancelled", "AbortError");
    })).rejects.toMatchObject({ name: "AbortError" });
  });
  it("VAULT-003 refuses replaced identity or changed metadata", async () => {
    const replaced = fixture();

    replaced.file.isSameEntry.mockResolvedValue(false);
    await expect(replaced.read()).rejects.toThrow("recovery-vault-changed");

    const changed = fixture();

    changed.file.getFile.mockResolvedValueOnce(new File([JSON.stringify(identity())], ".moa-vault.json", { lastModified: 2 }));
    await expect(changed.read()).rejects.toThrow("recovery-vault-changed");
  });
  it("VAULT-003 propagates I/O failure without misreporting missing or invalid", async () => {
    const { read, directory } = fixture();

    directory.getFileHandle.mockRejectedValue(new DOMException("io", "NotReadableError"));
    await expect(read()).rejects.toMatchObject({ name: "NotReadableError" });
  });
  it("VAULT-003 detects same-size same-time content changes", async () => {
    const { read, file } = fixture();

    file.getFile.mockResolvedValueOnce(new File([JSON.stringify(identity())], ".moa-vault.json", { lastModified: 1 }))
      .mockResolvedValueOnce(new File(
        [JSON.stringify({ ...identity(), vaultId: "22222222-2222-4222-8222-222222222222" })],
        ".moa-vault.json",
        { lastModified: 1 }
      ));
    await expect(read()).rejects.toThrow("recovery-vault-changed");
  });
});
