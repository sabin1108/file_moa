import { describe, expect, it, vi } from "vitest";
import { executeCopy } from "../../../../src/features/local-folders/operations/copying/copy-execution";
import type { FolderHandle } from "../../../../src/features/local-folders/types";
import type { FileChangePlan } from "../../../../src/features/local-folders/operations/planning/file-change-plan";
import { readCopyHistory } from "../../../../src/features/local-folders/operations/copying/copy-journal-storage";
import { inspectCopyHistoryTargets } from "../../../../src/features/local-folders/operations/copying/copy-history-inspection";

async function fixture() {
  const bytes = new Map<string, File>(), dirs = new Map<string, ReturnType<typeof directory>>();
  const writes: string[] = [], removes = vi.fn();
  let failName = "", deny = false, changedEntry = "";
  let onWrite: (key: string) => void = () => { }, onClose: (key: string) => void = () => { }, onHash: () => void = () => { }, onMissing: (key: string) => void = () => { };

  function directory(path: string) {
    const handles = new Map<string, FileSystemFileHandle>();
    const obj = {
      kind: "directory" as const,
      name: path.split("/").at(-1),
      isSameEntry: async (other: unknown) => other === obj,
      queryPermission: vi.fn(async () => deny ? "denied" : "granted"),
      requestPermission: vi.fn(async () => deny ? "denied" : "granted"),
      removeEntry: removes,
      getDirectoryHandle: vi.fn(async (name: string, options?: { create?: boolean }) => {
        const key = [path, name].filter(Boolean).join("/");

        if (!dirs.has(key)) {
          if (!options?.create) throw new DOMException("missing", "NotFoundError");

          dirs.set(key, directory(key));
        }

        return dirs.get(key)!;
      }),
      getFileHandle: vi.fn(async (name: string, options?: { create?: boolean }) => {
        const key = [path, name].filter(Boolean).join("/");

        if (!bytes.has(key)) {
          if (!options?.create) {
            onMissing(key);

            throw new DOMException("missing", "NotFoundError");
          }

          bytes.set(key, new File([], name));
        }

        if (!handles.has(name)) {
          const handle = {
            name,
            kind: "file",
            getFile: async () => bytes.get(key)!,
            isSameEntry: async (other: unknown) => other === handle && key !== changedEntry,
            createWritable: async () => {
              writes.push(key);

              let pending: File | null = null;

              return {
                write: async (data: BlobPart) => {
                  if (key === failName || (failName === "journal" && key.includes(".moa-history"))) throw new DOMException("full", "QuotaExceededError");

                  pending = new File([data], name);
                  onWrite(key);
                },
                close: async () => {
                  if (pending) bytes.set(key, pending);

                  onClose(key);
                },
                abort: async () => { }
              };
            }
          } as unknown as FileSystemFileHandle;

          handles.set(name, handle);
        }

        return handles.get(name)!;
      }),
      values: async function* () {
        const prefix = path ? path + "/" : "";

        for (const key of [...dirs.keys()]) if (key.startsWith(prefix) && key !== path && !key.slice(prefix.length).includes("/")) yield { name: key.slice(prefix.length), kind: "directory" };

        for (const key of [...bytes.keys()]) if (key.startsWith(prefix) && !key.slice(prefix.length).includes("/")) yield await obj.getFileHandle(key.slice(prefix.length));
      },
    };

    return obj;
  }

  const root = directory("");

  dirs.set("from", directory("from"));
  dirs.set("to", directory("to"));

  const names = ["a.txt", "b.txt", "c.txt"];

  for (const name of names) bytes.set(`from/${name}`, new File([name], name, { lastModified: 123 }));

  const hash = async (file: File) => {
    const result = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))].map(n => n.toString(16).padStart(2, "0")).join("");

    onHash();

    return result;
  };
  const plan: FileChangePlan = {
    operation: "copy",
    rows: names.map(name => ({ from: ["from", name], to: ["to", name], issues: [] })),
    conflictCount: 0,
    directoriesToCreate: []
  };
  const files = await Promise.all(names.map(async name => ({
    from: ["from", name],
    to: ["to", name],
    size: name.length,
    lastModified: 123,
    sha256: await hash(bytes.get(`from/${name}`)!)
  })));
  const abort = new AbortController();
  const run = () => executeCopy(root as unknown as FolderHandle, plan, { files, totalBytes: 15 }, { userId: "test", workspaceId: "work" }, () => { }, abort.signal, () => { }, hash, async work => work());
  const history = () => readCopyHistory(root as unknown as FolderHandle, ["to"], { userId: "test", workspaceId: "work" }, () => { });
  const observe = async () => inspectCopyHistoryTargets(root as unknown as FolderHandle, ["to"], (await history()).groups[0], { userId: "test", workspaceId: "work" }, () => { }, new AbortController().signal, hash);

  return {
    run,
    history,
    observe,
    bytes,
    writes,
    root,
    removes,
    abort,
    fail: (name: string) => {
      failName = name;
    },
    deny: () => {
      deny = true;
    },
    onWrite: (fn: typeof onWrite) => {
      onWrite = fn;
    },
    onClose: (fn: typeof onClose) => {
      onClose = fn;
    },
    onHash: (fn: typeof onHash) => {
      onHash = fn;
    },
    onMissing: (fn: typeof onMissing) => {
      onMissing = fn;
    },
    replaceHistory: () => {
      dirs.set("to/.moa-history", directory("to/.moa-history"));
    },
    replaceEntry: (key: string) => {
      changedEntry = key;
    }
  };
}

describe("explicit copy execution", () => {
  it("copies fixed bytes, records success and never writes or removes a source", async () => {
    const f = await fixture();
    const source = [...f.bytes].filter(([path]) => path.startsWith("from/"));
    const result = await f.run();

    expect(result.phase).toBe("completed");

    for (const [path, file] of source) {
      expect(f.bytes.get(path)).toBe(file);
      expect(await f.bytes.get(path.replace("from/", "to/"))!.text()).toBe(await file.text());
    }

    expect(f.writes.every(path => path.startsWith("to/"))).toBe(true);
    expect(f.removes).not.toHaveBeenCalled();
    expect(f.root.requestPermission).toHaveBeenCalledOnce();
  });
  it("refuses an existing target without opening its writable stream", async () => {
    const f = await fixture();
    const original = new File(["keep"], "a.txt");

    f.bytes.set("to/a.txt", original);
    expect((await f.run()).phase).toBe("error");
    expect(f.bytes.get("to/a.txt")).toBe(original);
    expect(f.writes).toEqual([]);
  });
  it("refuses changed source bytes with unchanged metadata", async () => {
    const f = await fixture();

    f.bytes.set("from/a.txt", new File(["other"], "a.txt", { lastModified: 123 }));
    expect((await f.run()).phase).toBe("error");
    expect(f.writes).toEqual([]);
  });
  it("denied permission and pre-cancelled operation never create a journal or target", async () => {
    for (const mode of ["deny", "cancel"]) {
      const f = await fixture();

      if (mode === "deny") f.deny(); else f.abort.abort();

      expect((await f.run()).phase).not.toBe("completed");
      expect(f.writes).toEqual([]);
      expect([...f.bytes].length).toBe(3);
    }
  });
  it("keeps verified, uncertain and not-run results distinct after partial failure", async () => {
    const f = await fixture();

    f.fail("to/b.txt");

    const result = await f.run();

    expect(result.items.map(i => i.status)).toEqual(["verified", "uncertain", "not-run"]);
    expect(f.bytes.has("to/c.txt")).toBe(false);
    expect(f.removes).not.toHaveBeenCalled();
  });
  it("reconstructs the persisted result without any additional writes", async () => {
    const f = await fixture();

    await f.run();

    const before = [...f.writes], requests = f.root.requestPermission.mock.calls.length;

    expect((await f.history()).groups[0].status).toBe("completed");
    expect(f.writes).toEqual(before);
    expect(f.root.requestPermission).toHaveBeenCalledTimes(requests);
  });
  it("does not create missing history during a read", async () => {
    const f = await fixture();

    expect(await f.history()).toMatchObject({ groups: [], missing: true });
    expect(f.writes).toEqual([]);
    expect([...f.bytes.keys()].every(key => key.startsWith("from/"))).toBe(true);
  });
  it("stops before a target when initial journal write fails", async () => {
    const f = await fixture();

    f.fail("journal");

    const result = await f.run();

    expect(result.journalComplete).toBe(false);
    expect(f.bytes.has("to/a.txt")).toBe(false);
  });
  it("cancels after write without claiming rollback or starting the next file", async () => {
    const f = await fixture();

    f.onWrite(key => {
      if (key === "to/a.txt") f.abort.abort();
    });

    const result = await f.run();

    expect(result.phase).toBe("cancelled");
    expect(result.items.map(i => i.status)).toEqual(["uncertain", "not-run", "not-run"]);
    expect(f.bytes.has("to/b.txt")).toBe(false);
    expect(f.removes).not.toHaveBeenCalled();
    expect((await f.history()).groups[0]).toMatchObject({
      status: "cancelled",
      items: [expect.objectContaining({ status: "uncertain" }), expect.objectContaining({ status: "not-run" }), expect.objectContaining({ status: "not-run" })]
    });
  });
  it.each(["directory", "entry"])("detects journal %s replacement after close", async kind => {
    const f = await fixture();

    f.onClose(key => {
      if (key.includes(".moa-history")) {
        if (kind === "directory") f.replaceHistory(); else f.replaceEntry(key);
      }
    });

    const result = await f.run();

    expect(result.journalComplete).toBe(false);
    expect(result.phase).toBe("error");
    expect(f.bytes.has("to/a.txt")).toBe(false);
  });
  it("degrades corrupted persisted history without rewriting it", async () => {
    const f = await fixture();

    await f.run();
    f.bytes.set("to/.moa-history/moa-copy-broken.json", new File(["{bad"], "bad.json"));

    const writes = f.writes.length;
    const result = await f.history();

    expect(result.incomplete).toBe(true);
    expect(result.groups[0].status).toBe("uncertain");
    expect(f.writes.length).toBe(writes);
  });
  it("observes matches, changed contents and missing copies without changing the recorded result", async () => {
    const f = await fixture();

    await f.run();

    const recorded = await f.history();

    f.bytes.set("to/b.txt", new File(["other"], "b.txt"));
    f.bytes.delete("to/c.txt");

    const writes = f.writes.length, requests = f.root.requestPermission.mock.calls.length;

    expect((await f.observe()).items.map(i => i.status)).toEqual(["matches", "different", "missing"]);
    expect(await f.history()).toEqual(recorded);
    expect(f.writes.length).toBe(writes);
    expect(f.root.requestPermission).toHaveBeenCalledTimes(requests);
  });
  it("blocks a second operation before exceeding history capacity", async () => {
    const f = await fixture();

    for (let n = 0; n < 399; n++) f.bytes.set(`to/.moa-history/moa-copy-existing-${n}.json`, new File(["{}"], "record.json"));
    // Establish the existing folder while retaining the fixture's records.

    await f.root.getDirectoryHandle("to").then(dir => dir.getDirectoryHandle(".moa-history", { create: true }));

    const result = await f.run();

    expect(result.issue).toBe("copy-history-full");
    expect(f.writes).toEqual([]);
  });
  it("rejects observation when history changes while hashing", async () => {
    const f = await fixture();

    await f.run();
    f.onHash(() => f.bytes.set("to/.moa-history/moa-copy-broken.json", new File(["{broken"], "record.json")));
    await expect(f.observe()).rejects.toThrow("history-record-changed");
  });
  it("does not report missing after a file appears between observations", async () => {
    const f = await fixture();

    await f.run();
    f.bytes.delete("to/c.txt");
    f.onMissing(key => {
      if (key === "to/c.txt") f.bytes.set(key, new File(["appeared"], "c.txt"));
    });
    await expect(f.observe()).rejects.toThrow("history-target-changed");
  });
});
