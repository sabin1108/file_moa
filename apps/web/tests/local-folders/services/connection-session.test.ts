import { describe, expect, it, vi } from "vitest";
import { FolderConnectionSession } from "../../../src/features/local-folders/services/connection-session";
import { connectionKey } from "../../../src/features/local-folders/lib/connection-validation";
import type { ConnectionOwner, FolderHandle, HandleRepository } from "../../../src/features/local-folders/types";

const a = { userId: "a", workspaceId: "work" };
const b = { userId: "b", workspaceId: "work" };
function handle(name = "notes"): FolderHandle {
  return { kind: "directory", name, queryPermission: vi.fn().mockResolvedValue("granted"), requestPermission: vi.fn().mockResolvedValue("granted") } as unknown as FolderHandle;
}
function repository() {
  const entries = new Map<string, FolderHandle>();
  const repo: HandleRepository = {
    read: vi.fn(async (owner, kind) => entries.get(JSON.stringify(connectionKey(owner, kind)))),
    write: vi.fn(async (owner, kind, folder) => { entries.set(JSON.stringify(connectionKey(owner, kind)), folder); }),
    remove: vi.fn(async (owner, kind) => { entries.delete(JSON.stringify(connectionKey(owner, kind))); }),
  };
  return repo;
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

describe("account-scoped folder connections", () => {
  it("uses non-colliding structured account/workspace/kind keys", () => {
    expect(connectionKey({ userId: "a:b", workspaceId: "c" }, "source")).not.toEqual(connectionKey({ userId: "a", workspaceId: "b:c" }, "source"));
    expect(() => connectionKey({ userId: "", workspaceId: "w" }, "source")).toThrow("invalid-connection-owner");
  });
  it("preloads without permission or automatic connection, and clears immediately on logout", async () => {
    const repo = repository(); const folder = handle(); await repo.write(a, "source", folder);
    const session = new FolderConnectionSession(repo); await session.switchOwner(a);
    expect(session.state("source")).toBe("needs-permission"); expect(folder.requestPermission).not.toHaveBeenCalled();
    await session.reconnect("source"); expect(session.state("source")).toBe("connected");
    const pending = session.switchOwner(null); expect(session.state("source")).toBe("disconnected"); await pending;
  });
  it("isolates A, B and different workspaces without borrowing another handle", async () => {
    const repo = repository(); const session = new FolderConnectionSession(repo);
    await session.switchOwner(a); await session.select("source", async () => handle("A"));
    const switching = session.switchOwner(b);
    expect(session.view("source")).toEqual({ status: "disconnected", folderName: null });
    await switching; expect(session.state("source")).toBe("disconnected");
    await session.switchOwner({ ...a, workspaceId: "other" }); expect(session.state("source")).toBe("disconnected");
    await session.switchOwner(a); expect(session.state("source")).toBe("needs-permission");
  });
  it("discards a late A preload after switching to B", async () => {
    const repo = repository(); const slow = deferred<FolderHandle | undefined>();
    vi.mocked(repo.read).mockImplementation(async (owner, kind) => owner.userId === "a" && kind === "source" ? slow.promise : undefined);
    const session = new FolderConnectionSession(repo); const old = session.switchOwner(a); await session.switchOwner(b);
    slow.resolve(handle("A")); await expect(old).rejects.toThrow("stale-connection-operation");
    expect(session.state("source")).toBe("disconnected");
  });
  it("invokes requestPermission synchronously with the fixed kind-specific mode", async () => {
    const repo = repository(); const source = handle(); const records = handle();
    await repo.write(a, "source", source); await repo.write(a, "ai-records", records);
    const session = new FolderConnectionSession(repo); await session.switchOwner(a);
    const pending = session.reconnect("source"); expect(source.requestPermission).toHaveBeenCalledWith({ mode: "read" }); await pending;
    await session.reconnect("ai-records"); expect(records.requestPermission).toHaveBeenCalledWith({ mode: "readwrite" });
  });
  it("rejects a late permission grant after account change", async () => {
    const repo = repository(); const folder = handle(); const slow = deferred<PermissionState>();
    vi.mocked(folder.requestPermission).mockReturnValue(slow.promise); await repo.write(a, "source", folder);
    const session = new FolderConnectionSession(repo); await session.switchOwner(a); const pending = session.reconnect("source");
    await session.switchOwner(b); slow.resolve("granted"); await expect(pending).rejects.toThrow("stale-connection-operation");
    expect(session.state("source")).toBe("disconnected");
  });
  it("rejects late picker results before persisting under either account", async () => {
    const repo = repository(); const slow = deferred<FolderHandle>(); const session = new FolderConnectionSession(repo);
    await session.switchOwner(a); const pending = session.select("source", () => slow.promise);
    await session.switchOwner(b); slow.resolve(handle()); await expect(pending).rejects.toThrow("stale-connection-operation");
    expect(repo.write).not.toHaveBeenCalled();
    expect(session.view("source")).toEqual({ status: "disconnected", folderName: null });
  });
  it("keeps the previous connection after picker cancellation or persistence failure", async () => {
    const repo = repository(); const session = new FolderConnectionSession(repo); await session.switchOwner(a);
    await session.select("source", async () => handle());
    await expect(session.select("source", async () => { throw new DOMException("cancel", "AbortError"); })).rejects.toMatchObject({ name: "AbortError" });
    vi.mocked(repo.write).mockRejectedValueOnce(new Error("idb failure"));
    await expect(session.select("source", async () => handle("new"))).rejects.toThrow("idb failure");
    expect(session.state("source")).toBe("connected");
    expect(session.view("source")).toEqual({ status: "connected", folderName: "notes" });
  });
  it("denied reconnection retains the stored handle without claiming connection", async () => {
    const repo = repository(); const folder = handle(); await repo.write(a, "source", folder);
    vi.mocked(folder.requestPermission).mockResolvedValueOnce("denied");
    const session = new FolderConnectionSession(repo); await session.switchOwner(a);
    await expect(session.reconnect("source")).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(session.state("source")).toBe("needs-permission"); expect(repo.remove).not.toHaveBeenCalled();
    await session.reconnect("source"); expect(session.state("source")).toBe("connected");
  });
  it("disconnect invalidates an outstanding permission response and removes only that reference", async () => {
    const repo = repository(); const folder = handle(); const slow = deferred<PermissionState>(); await repo.write(a, "source", folder);
    vi.mocked(folder.requestPermission).mockReturnValue(slow.promise);
    const session = new FolderConnectionSession(repo); await session.switchOwner(a); const pending = session.reconnect("source");
    await session.disconnect("source"); slow.resolve("granted"); await expect(pending).rejects.toThrow("stale-connection-operation");
    expect(repo.remove).toHaveBeenCalledWith(a, "source"); expect(session.state("source")).toBe("disconnected");
  });
  it("keeps memory disconnected even when removing the persisted reference fails", async () => {
    const repo = repository(); const session = new FolderConnectionSession(repo); await session.switchOwner(a); await session.select("source", async () => handle());
    vi.mocked(repo.remove).mockRejectedValueOnce(new Error("remove failed"));
    await expect(session.disconnect("source")).rejects.toThrow("remove failed"); expect(session.state("source")).toBe("disconnected");
    expect(session.view("source")).toEqual({ status: "disconnected", folderName: null });
  });
  it("requires a valid current owner and finished preload before selection", async () => {
    const session = new FolderConnectionSession(repository()); const picker = vi.fn(async () => handle());
    await expect(session.select("source", picker)).rejects.toThrow("no-connection-owner"); expect(picker).not.toHaveBeenCalled();
    await expect(session.switchOwner({ userId: " ", workspaceId: "work" } as ConnectionOwner)).rejects.toThrow("invalid-connection-owner");
  });
  it("a pending A save remains scoped to A and cannot activate B", async () => {
    const repo = repository(); const slow = deferred<void>(); vi.mocked(repo.write).mockReturnValueOnce(slow.promise);
    const session = new FolderConnectionSession(repo); await session.switchOwner(a);
    const folder = handle(); const pending = session.select("source", async () => folder);
    await vi.waitFor(() => expect(repo.write).toHaveBeenCalledWith(a, "source", folder));
    await session.switchOwner(b); slow.resolve(); await expect(pending).rejects.toThrow("stale-connection-operation");
    expect(session.state("source")).toBe("disconnected"); expect(repo.write).toHaveBeenCalledTimes(1);
  });
  it("a pending A disconnect never removes B's reference", async () => {
    const repo = repository(); const slow = deferred<void>(); vi.mocked(repo.remove).mockReturnValueOnce(slow.promise);
    const session = new FolderConnectionSession(repo); await session.switchOwner(a);
    const pending = session.disconnect("source"); await session.switchOwner(b);
    slow.resolve(); await expect(pending).rejects.toThrow("stale-connection-operation");
    expect(repo.remove).toHaveBeenCalledExactlyOnceWith(a, "source");
  });
  it("an old A preload cannot enter a later A session after A-B-A switching", async () => {
    const repo = repository(); const slow = deferred<FolderHandle | undefined>();
    vi.mocked(repo.read).mockImplementationOnce(() => slow.promise);
    const session = new FolderConnectionSession(repo); const first = session.switchOwner(a);
    await session.switchOwner(b); await session.switchOwner(a);
    slow.resolve(handle()); await expect(first).rejects.toThrow("stale-connection-operation");
    expect(session.state("source")).toBe("disconnected");
  });
  it("late failures are also marked stale so old errors do not masquerade as current account failures", async () => {
    const repo = repository(); const slow = deferred<FolderHandle>(); const session = new FolderConnectionSession(repo);
    await session.switchOwner(a); const pending = session.select("source", () => slow.promise); await session.switchOwner(b);
    slow.reject(new Error("old picker failed")); await expect(pending).rejects.toThrow("stale-connection-operation");
    expect(session.state("source")).toBe("disconnected");
  });

  it("exposes only display values and does not let callers mutate the connection through a view", async () => {
    const session = new FolderConnectionSession(repository());
    expect(session.view("source")).toEqual({ status: "disconnected", folderName: null });
    await session.switchOwner(a);
    await session.select("source", async () => handle("학습 노트"));
    const view = session.view("source");
    expect(view).toEqual({ status: "connected", folderName: "학습 노트" });
    // Even a caller bypassing TypeScript readonly cannot alter the private connection.
    Reflect.set(view, "folderName", "다른 폴더");
    Reflect.set(view, "status", "disconnected");
    expect(session.view("source")).toEqual({ status: "connected", folderName: "학습 노트" });
  });

  it("shows restored folder names by kind without triggering I/O or permission requests on view reads", async () => {
    const repo = repository(); const source = handle("자료"); const records = handle("내 AI");
    await repo.write(a, "source", source); await repo.write(a, "ai-records", records);
    const session = new FolderConnectionSession(repo); await session.switchOwner(a);
    expect(session.view("source")).toEqual({ status: "needs-permission", folderName: "자료" });
    expect(session.view("ai-records")).toEqual({ status: "needs-permission", folderName: "내 AI" });
    expect(repo.read).toHaveBeenCalledTimes(3);
    expect(source.queryPermission).not.toHaveBeenCalled(); expect(source.requestPermission).not.toHaveBeenCalled();
    expect(records.queryPermission).not.toHaveBeenCalled(); expect(records.requestPermission).not.toHaveBeenCalled();
    await session.reconnect("source");
    expect(session.view("source")).toEqual({ status: "connected", folderName: "자료" });
    expect(session.view("ai-records")).toEqual({ status: "needs-permission", folderName: "내 AI" });
  });

  it("publishes the new folder name only after the connection reference is saved", async () => {
    const repo = repository(); const session = new FolderConnectionSession(repo); await session.switchOwner(a);
    await session.select("source", async () => handle("기존 자료"));
    const saved = deferred<void>(); vi.mocked(repo.write).mockReturnValueOnce(saved.promise);
    const next = handle("새 자료"); const pending = session.select("source", async () => next);
    await vi.waitFor(() => expect(repo.write).toHaveBeenLastCalledWith(a, "source", next));
    expect(session.view("source")).toEqual({ status: "connected", folderName: "기존 자료" });
    saved.resolve(); await pending;
    expect(session.view("source")).toEqual({ status: "connected", folderName: "새 자료" });
    await session.disconnect("source");
    expect(session.view("source")).toEqual({ status: "disconnected", folderName: null });
  });
});
