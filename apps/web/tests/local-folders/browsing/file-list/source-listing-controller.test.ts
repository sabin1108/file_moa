import { describe, expect, it, vi } from "vitest";
import { withAbsentVaultMarker } from "../../fixtures/absent-vault-marker";
import { FolderConnectionSession } from "../../../../src/features/local-folders/connection-session";
import { SourceConnectionController } from "../../../../src/features/local-folders/connection/source-connection-controller";
import type { FolderHandle, HandleRepository } from "../../../../src/features/local-folders/types";

const owner = { userId: "browser-test", workspaceId: "fixture" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });

  return { promise, resolve };
}

function folder(name = "자료", names = ["원본.md"]) {
  return withAbsentVaultMarker({
    kind: "directory" as const,
    name,
    queryPermission: vi.fn(async (): Promise<PermissionState> => "granted"),
    requestPermission: vi.fn(async (): Promise<PermissionState> => "granted"),
    getDirectoryHandle: vi.fn(),
    values: vi.fn(async function* () {
      for (const entry of names) yield { name: entry, kind: "file" as const };
    }),
  });
}

const handle = (value: ReturnType<typeof folder>) => value as unknown as FolderHandle;

async function setup() {
  const root = folder();
  const repository: HandleRepository = {
    read: vi.fn(async () => undefined),
    write: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
  };
  const picker = vi.fn(async () => handle(root));
  const controller = new SourceConnectionController(new FolderConnectionSession(repository), picker);

  await controller.load(owner);
  await controller.connect();

  return { root, repository, picker, controller, listing: controller.listing };
}
// Uses real connection/listing controllers and session. Only browser I/O is synthetic.

async function ready(listing: SourceConnectionController["listing"]) {
  await vi.waitFor(() => expect(listing.getSnapshot().phase).toBe("ready"));
}

describe("file browser state integration", () => {
  it("PLAN-007 real connection owner switch discards a pending plan and late reads", async () => {
    const { listing, root, controller } = await setup();

    listing.activate();
    await ready(listing);
    listing.toggleSelection("원본.md");
    controller.plan.open();

    const gate = deferred<void>();

    root.values.mockImplementationOnce(async function* () {
      await gate.promise;
      yield { name: "원본.md", kind: "file" as const };
    });

    const pending = controller.plan.generate();

    await controller.load({ userId: "other-owner", workspaceId: "other-workspace" });
    gate.resolve();
    await pending;
    expect(controller.plan.getSnapshot()).toMatchObject({ open: false, result: null });
    expect(listing.getSnapshot().selectedNames).toEqual([]);
    expect(controller.getSnapshot().view).toEqual({ status: "disconnected", folderName: null });
  });

  it("PLAN-008 real session permission loss from a plan invalidates all readers", async () => {
    const { listing, root, controller } = await setup();

    listing.activate();
    await ready(listing);
    listing.toggleSelection("원본.md");
    controller.plan.open();
    controller.plan.setDestination("");
    root.queryPermission.mockResolvedValue("denied");
    await controller.plan.generate();
    expect(controller.plan.getSnapshot().open).toBe(false);
    expect(listing.getSnapshot()).toMatchObject({ available: false, issue: "permission" });
    expect(controller.getSnapshot().view?.status).toBe("needs-permission");
  });
  it("UI-001/009 reads only when files mounts and retains results through route changes", async () => {
    const { listing, root } = await setup();

    expect(root.values).not.toHaveBeenCalled();

    const leave = listing.activate();

    await ready(listing);

    const snapshot = listing.getSnapshot();

    leave();

    const leaveAgain = listing.activate();

    expect(listing.getSnapshot()).toBe(snapshot);
    expect(root.values).toHaveBeenCalledTimes(1);
    leaveAgain();
  });

  it("UI-002 opens requested folders and can return to root", async () => {
    const { listing, root } = await setup();
    const child = folder("하위", ["내용.txt"]);

    root.getDirectoryHandle.mockResolvedValue(child);
    listing.activate();
    await ready(listing);
    await listing.open(["하위"]);
    expect(listing.getSnapshot().result).toMatchObject({ path: ["하위"], entries: [{ name: "내용.txt" }] });
    await listing.open([]);
    expect(listing.getSnapshot().result?.path).toEqual([]);
  });

  it("UI-003 preserves the last list on refresh failure, marks it stale and recovers", async () => {
    const { listing, root } = await setup();

    listing.activate();
    await ready(listing);

    const previous = listing.getSnapshot().result;

    root.values.mockImplementationOnce(async function* () {
      throw new DOMException("I/O", "NotReadableError");
    });
    await listing.refresh();
    expect(listing.getSnapshot()).toMatchObject({ phase: "error", result: previous, stale: true, issue: "read" });
    await listing.retry();
    expect(listing.getSnapshot()).toMatchObject({ phase: "ready", stale: false, issue: null });
  });

  it("UI-004 keeps the displayed path on navigation failure; retry uses failed destination", async () => {
    const { listing, root } = await setup();

    listing.activate();
    await ready(listing);
    root.getDirectoryHandle.mockRejectedValueOnce(new DOMException("gone", "NotFoundError"));
    await listing.open(["하위"]);
    expect(listing.getSnapshot()).toMatchObject({ result: { path: [] }, requestedPath: ["하위"], issue: "missing" });
    root.getDirectoryHandle.mockResolvedValue(folder("하위"));
    await listing.retry();
    expect(listing.getSnapshot().result?.path).toEqual(["하위"]);
  });

  it("UI-005 cancels immediately and drops a late iterator result", async () => {
    const { listing, root } = await setup();
    const gate = deferred<void>();
    const entered = deferred<void>();

    root.values.mockImplementationOnce(async function* () {
      entered.resolve();
      await gate.promise;
      yield { name: "late.txt", kind: "file" };
    });

    const pending = listing.open([]);

    await entered.promise;
    listing.cancel();
    expect(listing.getSnapshot()).toMatchObject({ phase: "cancelled", result: null, issue: "cancelled" });
    gate.resolve();
    await pending;
    expect(listing.getSnapshot().result).toBeNull();
    await listing.retry();
    expect(listing.getSnapshot().phase).toBe("ready");
  });

  it("UI-006 clears old data even when the replacement has the same folder name", async () => {
    const { listing, picker, controller } = await setup();

    listing.activate();
    await ready(listing);
    listing.selectAll();

    const replacement = folder("자료", ["새 파일.txt"]);
    const permission = deferred<PermissionState>();

    replacement.queryPermission.mockResolvedValueOnce("granted").mockReturnValueOnce(permission.promise);
    picker.mockResolvedValueOnce(handle(replacement));
    await controller.connect();
    expect(listing.getSnapshot()).toMatchObject({ phase: "loading", result: null, selectedNames: [] });
    permission.resolve("granted");
    await ready(listing);
    expect(listing.getSnapshot().result?.entries).toEqual([{ name: "새 파일.txt", kind: "file" }]);
  });

  it("UI-006 keeps previous results after picker cancellation without rereading", async () => {
    const { listing, picker, root, controller } = await setup();

    listing.activate();
    await ready(listing);
    listing.selectAll();

    const previous = listing.getSnapshot().result;

    picker.mockRejectedValueOnce(new DOMException("cancel", "AbortError"));
    await controller.connect();
    expect(listing.getSnapshot()).toMatchObject({ available: true, result: previous, stale: true, selectedNames: ["원본.md"] });
    expect(root.values).toHaveBeenCalledTimes(1);
  });

  it("UI-007 clears results even if disconnect persistence fails", async () => {
    const { listing, repository, controller } = await setup();

    listing.activate();
    await ready(listing);
    listing.selectAll();
    vi.mocked(repository.remove).mockRejectedValueOnce(new Error("IDB failed"));

    const pending = controller.disconnect();

    expect(listing.getSnapshot()).toMatchObject({ available: false, result: null, selectedNames: [] });
    await pending;
    expect(listing.getSnapshot().result).toBeNull();
    expect(controller.getSnapshot().phase).toBe("disconnect-error");
  });

  it("UI-007 drops a late list on owner switch and never leaks old errors/results", async () => {
    const { listing, root, controller } = await setup();

    await listing.open([]);
    listing.selectAll();

    const gate = deferred<PermissionState>();

    root.queryPermission.mockReturnValueOnce(gate.promise);

    const pending = listing.open([]);

    await controller.load({ ...owner, userId: "other" });
    gate.resolve("granted");
    await pending;
    expect(listing.getSnapshot()).toMatchObject({ available: false, result: null, issue: null, selectedNames: [] });
  });

  it("UI-008 synchronizes lost permission with connection UI and refreshes on explicit reconnect", async () => {
    const { listing, root, controller } = await setup();

    listing.activate();
    await ready(listing);
    root.queryPermission.mockResolvedValueOnce("denied");
    await listing.refresh();
    expect(listing.getSnapshot()).toMatchObject({ available: false, stale: true, issue: "permission" });
    expect(controller.getSnapshot().view?.status).toBe("needs-permission");
    expect(root.requestPermission).not.toHaveBeenCalled();
    await controller.reconnect();
    await ready(listing);
    expect(listing.getSnapshot().issue).toBeNull();
  });

  it("UI-008 reconnects at the same subdirectory", async () => {
    const { listing, root, controller } = await setup();

    root.getDirectoryHandle.mockResolvedValue(folder("하위"));
    listing.activate();
    await ready(listing);
    await listing.open(["하위"]);
    root.queryPermission.mockResolvedValueOnce("denied");
    await listing.refresh();
    await controller.reconnect();
    await ready(listing);
    expect(listing.getSnapshot().result?.path).toEqual(["하위"]);
  });

  it("UI-007 stop clears results; restart resumes only an already granted connection", async () => {
    const { listing, root, repository, controller } = await setup();

    listing.activate();
    await ready(listing);
    controller.stop();
    expect(listing.getSnapshot()).toMatchObject({ result: null, available: false });
    vi.mocked(repository.read).mockResolvedValue(handle(root));
    await controller.load(owner);
    expect(controller.getSnapshot().view?.status).toBe("connected");
    await ready(listing);
    expect(root.values).toHaveBeenCalledTimes(2);
  });
});
