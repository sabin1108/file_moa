import { afterEach, describe, expect, it, vi } from "vitest";
import { withAbsentVaultMarker } from "../fixtures/absent-vault-marker";
import { DirectoryFolderCreationJournal } from "../../../src/features/local-folders/creation/folder-creation-journal";
import { FolderConnectionSession } from "../../../src/features/local-folders/connection-session";
import type { FolderHandle, HandleRepository } from "../../../src/features/local-folders/types";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const owner = { userId: "test", workspaceId: "work" };

function handle(name: string): FolderHandle {
  return withAbsentVaultMarker({
    kind: "directory",
    name,
    queryPermission: vi.fn(async () => "granted"),
    requestPermission: vi.fn(async () => "granted"),
    values: async function* () { },
    isSameEntry: vi.fn(async () => true),
    getDirectoryHandle: vi.fn()
  } as unknown as FolderHandle);
}

async function sessionFixture() {
  const repo: HandleRepository = { read: vi.fn(), write: vi.fn(), remove: vi.fn() };
  const session = new FolderConnectionSession(repo), root = handle("source"), records = handle("records");

  await session.switchOwner(owner);
  await session.select("source", async () => root);
  vi.stubGlobal(
    "navigator",
    { locks: { request: async (_name: string, task: () => Promise<unknown>) => await task() } }
  );

  return { session, root, records };
}

describe("folder creation journal and connection lifetime", () => {
  it("verifies committed bytes and rejects corrupted intent", async () => {
    const root = handle("records"), write = vi.fn(), abort = vi.fn();
    const file = {
      getFile: vi.fn(async () => ({ size: 0, text: async () => "corrupt" })),
      createWritable: vi.fn(async () => ({ write, close: vi.fn(), abort }))
    };

    vi.mocked(root.getDirectoryHandle).mockResolvedValue(root);
    root.getFileHandle = vi.fn().mockRejectedValueOnce(new DOMException("missing", "NotFoundError")).mockResolvedValueOnce(file);

    const journal = new DirectoryFolderCreationJournal(root, owner, "source");

    await expect(journal.put({ version: 1, id: "op", path: ["new"], status: "pending", time: "now" })).rejects.toThrow("journal-verification-failed");
    expect(write).toHaveBeenCalledOnce();
  });
  it("write permission denial preserves source read connection", async () => {
    const { session, root } = await sessionFixture();

    vi.mocked(root.requestPermission).mockResolvedValue("denied");
    await expect(session.createSourceEntry([], "new")).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(session.state("source")).toBe("connected");
    expect(root.getDirectoryHandle).not.toHaveBeenCalled();
  });
  it("source replacement before mutation stops old operation", async () => {
    const { session, root } = await sessionFixture();
    const statuses: string[] = [];

    vi.spyOn(DirectoryFolderCreationJournal.prototype, "put").mockImplementation(async record => {
      statuses.push(record.status);

      if (record.status === "pending") await session.select("source", async () => handle("replacement"));
    });
    await expect(session.createSourceEntry([], "new")).rejects.toThrow("stale-connection-operation");
    expect(root.getDirectoryHandle).not.toHaveBeenCalled();
    expect(statuses).toEqual(["pending", "failed"]);
  });
  it("creates in current nested folder without any records connection", async () => {
    const { session, root } = await sessionFixture();
    const parent = handle("nested"), created = handle("new");

    vi.mocked(root.getDirectoryHandle).mockResolvedValue(parent);
    vi.mocked(parent.getDirectoryHandle).mockResolvedValue(created);
    vi.spyOn(DirectoryFolderCreationJournal.prototype, "put").mockResolvedValue();
    expect(await session.createSourceEntry(["nested"], "new")).toEqual(["nested", "new"]);
    expect(parent.getDirectoryHandle).toHaveBeenCalledWith("new", { create: true });
    expect(root.requestPermission).toHaveBeenCalledWith({ mode: "readwrite" });
    expect(session.state("ai-records")).toBe("disconnected");
  });
  it("keeps journal in the current parent rather than the connected root", async () => {
    const root = handle("root"), parent = handle("nested"), history = handle(".moa-history");
    let text = "";
    const file = {
      getFile: async () => ({ size: text.length, text: async () => text }),
      createWritable: async () => ({
        write: async (value: string) => {
          text = value;
        },
        close: async () => { },
        abort: async () => { }
      })
    };

    vi.mocked(root.getDirectoryHandle).mockResolvedValue(parent);
    vi.mocked(parent.getDirectoryHandle).mockResolvedValue(history);
    history.getFileHandle = vi.fn().mockRejectedValueOnce(new DOMException("missing", "NotFoundError")).mockResolvedValueOnce(file);

    const journal = new DirectoryFolderCreationJournal(root, owner, "root", ["nested"], () => { });

    await journal.put({ version: 1, id: "op", path: ["nested", "new"], status: "pending", time: "now" });
    expect(root.getDirectoryHandle).toHaveBeenCalledWith("nested", { create: false });
    expect(parent.getDirectoryHandle).toHaveBeenCalledWith(".moa-history", { create: true });
    expect(JSON.parse(text).path).toEqual(["nested", "new"]);
  });
  it("owner change while permission is pending cannot create", async () => {
    const { session, root } = await sessionFixture();
    let release!: (value: PermissionState) => void;

    vi.mocked(root.requestPermission).mockReturnValue(new Promise(resolve => {
      release = resolve;
    }));

    const result = session.createSourceEntry([], "new");

    await session.switchOwner({ userId: "other", workspaceId: "work" });
    release("granted");
    await expect(result).rejects.toThrow("stale-connection-operation");
    expect(root.getDirectoryHandle).not.toHaveBeenCalled();
  });
  it("existing file at the journal directory name blocks creation without replacing it", async () => {
    const { session, root } = await sessionFixture();

    vi.mocked(root.getDirectoryHandle).mockRejectedValue(new DOMException("existing file", "TypeMismatchError"));
    await expect(session.createSourceEntry([], "new")).rejects.toThrow("journal-location-conflict");
    expect(root.getDirectoryHandle).toHaveBeenCalledTimes(1);
    expect(root.getDirectoryHandle).toHaveBeenCalledWith(".moa-history", { create: true });
  });
});
