import { describe, expect, it, vi } from "vitest";
import { withAbsentVaultMarker } from "../fixtures/absent-vault-marker";
import { FolderConnectionSession } from "../../../src/features/local-folders/services/connection-session";
import { SourceConnectionController } from "../../../src/features/local-folders/store/source-connection-controller";
import type { FolderHandle, HandleRepository } from "../../../src/features/local-folders/types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
async function setup() {
  const getFile = vi.fn(async () => new File(["첫 본문"], "a.md"));
  const root = {
    name: "자료", kind: "directory" as const,
    queryPermission: vi.fn(async (): Promise<PermissionState> => "granted"),
    requestPermission: vi.fn(async (): Promise<PermissionState> => "granted"),
    getFileHandle: vi.fn(async () => ({ getFile })),
    values: vi.fn(async function* () { yield { name: "a.md", kind: "file" as const }; }),
  };
  const repository: HandleRepository = { read: vi.fn(async () => undefined), write: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) };
  const session = new FolderConnectionSession(repository);
  withAbsentVaultMarker(root);
  const picker = vi.fn(async () => root as unknown as FolderHandle);
  const controller = new SourceConnectionController(session, picker);
  await controller.load({ userId: "A", workspaceId: "A" });
  await controller.connect();
  controller.listing.activate();
  await vi.waitFor(() => expect(controller.listing.getSnapshot().phase).toBe("ready"));
  return { controller, preview: controller.preview, root, getFile, picker, repository };
}

describe("preview UI lifetime with real session/reader", () => {
  it("UI-001 does not read bodies on connection or listing, opens only explicitly", async () => {
    const { preview, getFile } = await setup();
    expect(getFile).not.toHaveBeenCalled();
    expect(preview.getSnapshot().path).toBeNull();
    await preview.open(["a.md"]);
    expect(preview.getSnapshot()).toMatchObject({ phase: "ready", result: { text: "첫 본문" }, stale: false });
  });
  it("UI-004 retains the same file on failed refresh and retry fetches a new File", async () => {
    const { preview, getFile } = await setup();
    await preview.open(["a.md"]);
    getFile.mockRejectedValueOnce(new DOMException("deleted", "NotFoundError"));
    await preview.refresh();
    expect(preview.getSnapshot()).toMatchObject({ issue: "missing", stale: true, result: { text: "첫 본문" } });
    getFile.mockResolvedValueOnce(new File(["수정 본문"], "a.md"));
    await preview.refresh();
    expect(preview.getSnapshot()).toMatchObject({ phase: "ready", stale: false, result: { text: "수정 본문" } });
  });
  it("UI-004 removes old text when another file is requested, including failure", async () => {
    const { preview, getFile } = await setup();
    await preview.open(["a.md"]);
    const gate = deferred<File>(); getFile.mockReturnValueOnce(gate.promise);
    const pending = preview.open(["b.txt"]);
    expect(preview.getSnapshot()).toMatchObject({ path: ["b.txt"], result: null, phase: "loading" });
    await vi.waitFor(() => expect(getFile).toHaveBeenCalledTimes(2));
    gate.reject(new DOMException("read", "NotReadableError")); await pending;
    expect(preview.getSnapshot()).toMatchObject({ result: null, issue: "read" });
  });
  it("UI-004 cancel ends pending immediately and discards late success", async () => {
    const { preview, getFile } = await setup();
    await preview.open(["a.md"]);
    const gate = deferred<File>(); getFile.mockReturnValueOnce(gate.promise);
    const pending = preview.refresh();
    await vi.waitFor(() => expect(getFile).toHaveBeenCalledTimes(2));
    preview.cancel();
    expect(preview.getSnapshot()).toMatchObject({ phase: "cancelled", stale: true, result: { text: "첫 본문" } });
    gate.resolve(new File(["늦은 본문"], "a.md")); await pending;
    expect(preview.getSnapshot()).toMatchObject({ phase: "cancelled", result: { text: "첫 본문" } });
  });
  it("UI-002/006 close clears text and blocks late errors without clearing listing", async () => {
    const { preview, controller, getFile } = await setup();
    const list = controller.listing.getSnapshot().result;
    const gate = deferred<File>(); getFile.mockReturnValueOnce(gate.promise);
    const pending = preview.open(["a.md"]);
    await vi.waitFor(() => expect(getFile).toHaveBeenCalled());
    preview.close();
    gate.reject(new DOMException("old permission", "NotAllowedError")); await pending;
    expect(preview.getSnapshot()).toMatchObject({ path: null, result: null, issue: null });
    expect(controller.listing.getSnapshot().result).toBe(list);
    expect(controller.getSnapshot().view?.status).toBe("connected");
  });
  it("UI-005 synchronizes preview permission loss with listing and reconnects explicitly", async () => {
    const { preview, controller, root } = await setup();
    await preview.open(["a.md"]);
    root.queryPermission.mockResolvedValue("denied");
    await preview.refresh();
    expect(preview.getSnapshot()).toMatchObject({ available: false, issue: "permission", stale: true });
    expect(controller.listing.getSnapshot()).toMatchObject({ available: false, issue: "permission" });
    expect(controller.getSnapshot().view?.status).toBe("needs-permission");
    expect(root.requestPermission).not.toHaveBeenCalled();
    root.queryPermission.mockResolvedValue("granted");
    await controller.reconnect();
    await vi.waitFor(() => expect(preview.getSnapshot().phase).toBe("ready"));
    expect(preview.getSnapshot().path).toEqual(["a.md"]);
  });
  it("UI-005 listing permission loss disables the open preview too", async () => {
    const { preview, controller, root } = await setup();
    await preview.open(["a.md"]);
    root.queryPermission.mockResolvedValue("denied"); await controller.listing.refresh();
    expect(preview.getSnapshot()).toMatchObject({ available: false, issue: "permission", result: { text: "첫 본문" } });
  });
  it("UI-005 picker cancel/save failure preserve text, successful replacement clears it", async () => {
    const { preview, controller, picker, repository } = await setup();
    await preview.open(["a.md"]);
    picker.mockRejectedValueOnce(new DOMException("cancel", "AbortError"));
    await controller.connect();
    expect(preview.getSnapshot()).toMatchObject({ available: true, result: { text: "첫 본문" } });
    vi.mocked(repository.write).mockRejectedValueOnce(new Error("quota"));
    await controller.connect();
    expect(preview.getSnapshot().result?.text).toBe("첫 본문");
    await controller.connect();
    expect(preview.getSnapshot()).toMatchObject({ path: null, result: null });
  });
  it("UI-005 disconnect failure, owner switch and stop clear body immediately", async () => {
    for (const action of ["disconnect", "owner", "stop"]) {
      const { preview, controller, repository } = await setup();
      await preview.open(["a.md"]);
      if (action === "disconnect") { vi.mocked(repository.remove).mockRejectedValueOnce(new Error("failure")); await controller.disconnect(); }
      if (action === "owner") await controller.load({ userId: "B", workspaceId: "B" });
      if (action === "stop") controller.stop();
      expect(preview.getSnapshot()).toMatchObject({ path: null, result: null, available: false });
    }
  });
  it("UI-007 distinguishes encoding, limit and unsupported failures", async () => {
    const { preview, getFile } = await setup();
    getFile.mockResolvedValueOnce(new File([new Uint8Array([0xff])], "a.md"));
    await preview.open(["a.md"]); expect(preview.getSnapshot().issue).toBe("encoding");
    getFile.mockResolvedValueOnce(new File(["a".repeat(2097153)], "a.md"));
    await preview.refresh(); expect(preview.getSnapshot().issue).toBe("too-large");
    await preview.open(["a.exe"]); expect(preview.getSnapshot().issue).toBe("unsupported");
  });
});
