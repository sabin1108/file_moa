import { describe, expect, it, vi } from "vitest";
import { withAbsentVaultMarker } from "../../fixtures/absent-vault-marker";
import { inspectCopyPlan } from "../../../../src/features/local-folders/operations/copying/copy-inspection";
import { COPY_INSPECTION_LIMITS } from "../../../../src/features/local-folders/operations/copying/copy-inspection-rules";
import type { FileChangePlan } from "../../../../src/features/local-folders/operations/planning/file-change-plan";
import type { FolderHandle } from "../../../../src/features/local-folders/types";

// Only filesystem and Worker boundaries are faked. Production validation and read ordering run.

function fixture(names = ["노트.md"]) {
  const files = new Map(names.map(name => [name, new File(["abc"], name, { lastModified: 123 })]));
  const targetNames: string[] = [];
  const handles = new Map(names.map(name => {
    const handle = {
      name,
      kind: "file",
      getFile: vi.fn(async () => files.get(name)!),
      isSameEntry: vi.fn<(other: unknown) => Promise<boolean>>(async () => true)
    };

    return [name, handle];
  }));
  const source = {
    getFileHandle: vi.fn(async (name: string, options: { create: boolean }) => {
      expect(options.create).toBe(false);

      const found = handles.get(name);

      if (!found) throw new DOMException("missing", "NotFoundError");

      return found;
    }),
    values: async function* () {
      for (const name of names) yield { name, kind: "file" };
    },
  };
  const destination = {
    values: async function* () {
      for (const name of targetNames) yield { name, kind: "file" };
    }
  };
  const root = {
    name: "fixture",
    kind: "directory",
    queryPermission: vi.fn(async (): Promise<PermissionState> => "granted"),
    requestPermission: vi.fn(),
    getDirectoryHandle: vi.fn(async (name: string, options: { create: boolean }) => {
      expect(options.create).toBe(false);

      return name === "출발" ? source : destination;
    }),
  };
  const plan: FileChangePlan = {
    operation: "copy",
    rows: names.map(name => ({ from: ["출발", name], to: ["도착", name], issues: [] })),
    conflictCount: 0,
    directoriesToCreate: []
  };
  const hash = vi.fn(async (file: File) => {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());

    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  });

  withAbsentVaultMarker(root);
  withAbsentVaultMarker(source);
  withAbsentVaultMarker(destination);

  const inspect = (input = plan, signal?: AbortSignal, assertCurrent = () => { }) => inspectCopyPlan(root as unknown as FolderHandle, input, assertCurrent, signal, hash);

  return { files, targetNames, handles, source, root, plan, hash, inspect };
}

describe("read-only copy inspection", () => {
  it("INSPECT-003 reads known SHA-256 and metadata without requesting write permission", async () => {
    const f = fixture();
    const result = await f.inspect();

    expect(result).toEqual({
      totalBytes: 3,
      files: [{
        from: ["출발", "노트.md"],
        to: ["도착", "노트.md"],
        size: 3,
        lastModified: 123,
        sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
      }]
    });
    expect(f.root.requestPermission).not.toHaveBeenCalled();
    expect(f.root.queryPermission.mock.calls.every(call => JSON.stringify(call) === '[{"mode":"read"}]')).toBe(true);
    expect(Object.isFrozen(result.files[0].from)).toBe(true);
  });
  it("INSPECT-002 rejects unsupported, tampered, empty and duplicate plans before I/O", async () => {
    const f = fixture();
    const invalid: FileChangePlan[] = [
      { ...f.plan, operation: "move" }, { ...f.plan, rows: [] },
      { ...f.plan, directoriesToCreate: [["new"]] },
      { ...f.plan, rows: [...f.plan.rows, ...f.plan.rows] },
      { ...f.plan, rows: [{ from: ["..", "a"], to: ["to", "a"], issues: [] }] },
      { ...f.plan, rows: [{ from: ["a"], to: ["to", "b"], issues: [] }] },
    ];

    for (const plan of invalid) await expect(f.inspect(plan)).rejects.toThrow();

    expect(f.root.queryPermission).not.toHaveBeenCalled();
  });
  it("INSPECT-002 rejects fresh destination conflicts before content read", async () => {
    const f = fixture();

    f.targetNames.push("노트.md");
    await expect(f.inspect()).rejects.toThrow("copy-conflict");
    expect(f.hash).not.toHaveBeenCalled();
  });
  it("INSPECT-002 rejects a truncated destination even when no visible name conflicts", async () => {
    const f = fixture();

    f.targetNames.push(...Array.from({ length: 1001 }, (_, i) => `unrelated-${i}`));
    await expect(f.inspect()).rejects.toThrow("copy-conflict");
    expect(f.hash).not.toHaveBeenCalled();
  });
  it("INSPECT-004 rejects file/count/total limits before hashing", async () => {
    const count = fixture(Array.from({ length: COPY_INSPECTION_LIMITS.files + 1 }, (_, i) => `${i}.bin`));

    await expect(count.inspect()).rejects.toThrow("copy-limit");
    expect(count.root.queryPermission).not.toHaveBeenCalled();

    for (const total of [false, true]) {
      const f = fixture(total ? ["a", "b", "c", "d", "e"] : ["a"]);

      for (const file of f.files.values()) Object.defineProperty(file, "size", { value: COPY_INSPECTION_LIMITS.fileBytes + (total ? 0 : 1) });

      await expect(f.inspect()).rejects.toThrow("copy-limit");
      expect(f.hash).not.toHaveBeenCalled();
    }
  });
  it("INSPECT-003 detects source changes with identical size and mtime", async () => {
    const f = fixture();

    f.hash.mockImplementationOnce(async () => {
      f.files.set("노트.md", new File(["xyz"], "노트.md", { lastModified: 123 }));

      return "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    });
    await expect(f.inspect()).rejects.toThrow("source-changed");
  });
  it("INSPECT-003 detects entry replacement and final destination collision", async () => {
    const replaced = fixture();

    replaced.handles.get("노트.md")!.isSameEntry.mockResolvedValue(false);
    await expect(replaced.inspect()).rejects.toThrow("source-changed");

    const conflict = fixture();

    conflict.hash.mockImplementation(async () => {
      conflict.targetNames.push("notes.md", "노트.md");

      return "a".repeat(64);
    });
    await expect(conflict.inspect()).rejects.toThrow("copy-conflict");
  });
  it("INSPECT-003 re-resolves the source directory rather than trusting a detached handle", async () => {
    const f = fixture();
    const old = f.handles.get("노트.md")!;

    old.isSameEntry.mockImplementation(async other => other === old);

    const replacement = { ...old };

    f.hash.mockImplementationOnce(async () => {
      f.root.getDirectoryHandle.mockImplementation(async () => ({ ...f.source, getFileHandle: vi.fn(async () => replacement) }));

      return "a".repeat(64);
    });
    await expect(f.inspect()).rejects.toThrow("source-changed");
    expect(old.isSameEntry).toHaveBeenCalledWith(replacement);
  });
  it("INSPECT-005 rejects aborted and stale results after pending I/O", async () => {
    for (const stale of [false, true]) {
      const f = fixture();
      const abort = new AbortController();
      let current = true;

      f.hash.mockImplementationOnce(async () => {
        current = false;

        if (!stale) abort.abort();

        return "a".repeat(64);
      });
      await expect(f.inspect(f.plan, abort.signal, () => {
        if (stale && !current) throw new Error("stale-connection-operation");
      })).rejects.toThrow(stale ? "stale-connection-operation" : "cancelled");
    }
  });
  it("INSPECT-005 permission rejection performs no content read or permission request", async () => {
    const f = fixture();

    f.root.queryPermission.mockResolvedValue("denied");
    await expect(f.inspect()).rejects.toThrow("permission");
    expect(f.hash).not.toHaveBeenCalled();
    expect(f.root.requestPermission).not.toHaveBeenCalled();
  });
  it("INSPECT-005 does not publish hashed data after permission is revoked", async () => {
    const f = fixture();

    f.hash.mockImplementation(async () => {
      f.root.queryPermission.mockResolvedValue("denied");

      return "a".repeat(64);
    });
    await expect(f.inspect()).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(f.root.requestPermission).not.toHaveBeenCalled();
  });
  it("INSPECT-002 snapshots caller paths before the first asynchronous read", async () => {
    const f = fixture();
    const pending = f.inspect();

    (f.plan.rows[0].from as string[])[0] = "changed";
    expect((await pending).files[0].from).toEqual(["출발", "노트.md"]);
  });
});
