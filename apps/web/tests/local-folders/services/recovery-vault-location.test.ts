import { describe, expect, it, vi } from "vitest";
import { assertVaultLocation, assertVaultParentLocation } from "../../../src/features/local-folders/services/recovery-vault-location";
import type { FolderHandle } from "../../../src/features/local-folders/types";

function folder(path: string): FolderHandle {
  const result = {
    kind: "directory", name: "same name",
    queryPermission: vi.fn(async () => "granted"),
    requestPermission: vi.fn(),
    isSameEntry: vi.fn(async (other: FolderHandle) => other === result),
    resolve: vi.fn(async (other: FolderHandle) => {
      const target = paths.get(other)!;
      return target.startsWith(path + "/") ? target.slice(path.length + 1).split("/") : null;
    }),
  } as unknown as FolderHandle;
  return result;
}

const paths = new WeakMap<FolderHandle, string>();
function make(path: string) {
  const current = folder(path);
  paths.set(current, path);
  return current;
}

describe("RV-002 vault location", () => {
  it.each(["root", "root/child/deep", ""])("rejects same/deep/ancestor location %s", async path => {
    const source = make("root");
    const vault = path === "root" ? source : make(path);
    if (path === "") vi.mocked(vault.resolve).mockResolvedValue(["root"]);
    await expect(assertVaultLocation(vault, [source], () => {})).rejects.toThrow("recovery-vault-location");
  });

  it("allows a vault directly under the source and allows source root as creation parent", async () => {
    const root = make("root");
    await expect(assertVaultLocation(make("root/vault"), [root], () => {})).resolves.toBeUndefined();
    await expect(assertVaultParentLocation(root, [root], () => {})).resolves.toBeUndefined();
    await expect(assertVaultParentLocation(make("root/child"), [root], () => {})).rejects.toThrow("recovery-vault-location");
  });

  it("accepts disjoint handles even with identical names without prompting", async () => {
    const vault = make("vault");
    await assertVaultLocation(vault, [make("source")], () => {});
    expect(vault.requestPermission).not.toHaveBeenCalled();
  });

  it("fails closed on denied permission, relationship errors and cancellation", async () => {
    const source = make("source");
    const vault = make("vault");
    vi.mocked(vault.queryPermission).mockResolvedValueOnce("denied");
    await expect(assertVaultLocation(vault, [source], () => {})).rejects.toMatchObject({ name: "NotAllowedError" });
    vi.mocked(vault.resolve).mockRejectedValueOnce(Error("unavailable"));
    await expect(assertVaultLocation(vault, [source], () => {})).rejects.toThrow("unavailable");
    await expect(assertVaultLocation(vault, [source], () => { throw Error("stale"); })).rejects.toThrow("stale");
  });
});
