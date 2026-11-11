import { describe, expect, it, vi } from "vitest";
import type { FolderHandle, HandleRepository } from "../../../src/features/local-folders/types";
import { FolderConnectionSession } from "../../../src/features/local-folders/services/connection-session";
import { SourceConnectionController } from "../../../src/features/local-folders/store/source-connection-controller";
// 실제 controller와 session을 검사한다. 저장소·폴더 권한 응답만 가짜다.
// 이 테스트가 통과해도 브라우저 저장소나 실제 권한 창을 검증한 것은 아니다.

const owner = { userId: "test-a", workspaceId: "workspace" };
// 파일 읽기/쓰기는 제공하지 않는 최소 가짜 핸들이다. 테스트 밖에서 사용하지 않는다.

function folder(name = "자료") {
  return {
    kind: "directory",
    name,
    queryPermission: vi.fn(async () => "granted"),
    requestPermission: vi.fn(async () => "granted"),
  } as unknown as FolderHandle;
}

// 비동기 응답을 원하는 시점까지 멈춰 늦은 완료·실패를 재현한다.

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((onSuccess, onFailure) => {
    resolve = onSuccess;
    reject = onFailure;
  });

  return { promise, resolve, reject };
}

function setup() {
  const repo: HandleRepository = {
    read: vi.fn(async () => undefined),
    write: vi.fn(async () => { }),
    remove: vi.fn(async () => { }),
  };
  const picker = vi.fn(async () => folder());
  const controller = new SourceConnectionController(new FolderConnectionSession(repo), picker);

  return { repo, picker, controller };
}

describe("settings source connection state", () => {

  it("keeps preload distinct from disconnected and exposes a cached snapshot", async () => {
    const { repo, picker, controller } = setup();
    const waiting = deferred<FolderHandle | undefined>();

    vi.mocked(repo.read).mockReturnValueOnce(waiting.promise);

    const loading = controller.load(owner);

    expect(controller.getSnapshot()).toMatchObject({ phase: "loading", view: null });
    expect(controller.getSnapshot()).toBe(controller.getSnapshot());
    await controller.connect();

    expect(picker).not.toHaveBeenCalled();

    const saved = folder();

    waiting.resolve(saved);
    await loading;

    expect(controller.getSnapshot()).toMatchObject({ phase: "ready", view: { status: "connected", folderName: "자료" } });
    expect(saved.requestPermission).not.toHaveBeenCalled();

    expect(saved.queryPermission).toHaveBeenCalledExactlyOnceWith({ mode: "read" });
  });
  it("keeps an expired stored permission disconnected without opening a permission prompt", async () => {
    const { repo, controller } = setup();
    const saved = folder();

    vi.mocked(saved.queryPermission).mockResolvedValue("prompt");
    vi.mocked(repo.read).mockResolvedValueOnce(saved);
    await controller.load(owner);
    expect(controller.getSnapshot().view?.status).toBe("needs-permission");
    expect(saved.requestPermission).not.toHaveBeenCalled();
  });

  it("calls picker before the first await and blocks double activation", async () => {
    const { controller, picker } = setup();

    await controller.load(owner);

    const waiting = deferred<FolderHandle>();

    picker.mockReturnValueOnce(waiting.promise);

    const pending = controller.connect();

    expect(picker).toHaveBeenCalledExactlyOnceWith({ mode: "read" });
    expect(await controller.connect()).toBe(false);

    expect(picker).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().pending).toBe("connect");
    waiting.resolve(folder());
    expect(await pending).toBe(true);

    expect(controller.getSnapshot()).toMatchObject({ phase: "ready", pending: null, view: { status: "connected" } });
  });

  it("does not publish the selected name before saving succeeds", async () => {
    const { controller, repo } = setup();

    await controller.load(owner);

    const waiting = deferred<void>();

    vi.mocked(repo.write).mockReturnValueOnce(waiting.promise);

    const pending = controller.connect();

    await vi.waitFor(() => expect(repo.write).toHaveBeenCalled());
    expect(controller.getSnapshot().view).toEqual({ status: "disconnected", folderName: null });
    waiting.resolve();
    expect(await pending).toBe(true);

    expect(controller.getSnapshot().view?.folderName).toBe("자료");
  });

  it("preserves the old connection on cancellation and does not claim a definite cause", async () => {
    // 준비: 실제 상태 관리자에 가짜 폴더를 연결해 둔다.
    const { controller, picker } = setup();

    await controller.load(owner);
    await controller.connect();
    // 실행: 다음 폴더 선택만 취소된 것처럼 응답한다.
    picker.mockRejectedValueOnce(new DOMException("private path", "AbortError"));
    expect(await controller.connect()).toBe(false);
    // 확인: 이전 연결 유지 + 안내 표시 + 원시 오류의 개인 경로 미노출.

    expect(controller.getSnapshot()).toMatchObject({ phase: "ready", notice: { state: "attention" }, view: { status: "connected", folderName: "자료" } });
    expect(JSON.stringify(controller.getSnapshot())).not.toContain("private path");
  });

  it("shows storage failure while retaining prior connection and allows another selection", async () => {
    const { controller, repo } = setup();

    await controller.load(owner);
    await controller.connect();
    vi.mocked(repo.write).mockRejectedValueOnce(new DOMException("private quota details", "QuotaExceededError"));
    expect(await controller.connect()).toBe(false);

    expect(controller.getSnapshot()).toMatchObject({ notice: { state: "error" }, view: { status: "connected" }, pending: null });
    await controller.connect();

    expect(controller.getSnapshot().notice?.state).toBe("success");
  });

  it("calls restored handle permission immediately, keeps denial and allows retry", async () => {
    const { controller, repo } = setup();
    const saved = folder();

    vi.mocked(repo.read).mockResolvedValueOnce(saved);
    vi.mocked(saved.requestPermission).mockResolvedValueOnce("denied");
    await controller.load(owner);

    const pending = controller.reconnect();

    expect(saved.requestPermission).toHaveBeenCalledExactlyOnceWith({ mode: "read" });
    expect(await pending).toBe(false);

    expect(controller.getSnapshot()).toMatchObject({ notice: { state: "attention" }, view: { status: "needs-permission" } });
    expect(await controller.reconnect()).toBe(true);

    expect(controller.getSnapshot().view?.status).toBe("connected");
  });

  it("clears memory immediately, blocks a new selection after failed removal, and retries removal", async () => {
    const { controller, repo, picker } = setup();

    await controller.load(owner);
    await controller.connect();

    const waiting = deferred<void>();

    vi.mocked(repo.remove).mockReturnValueOnce(waiting.promise);

    const pending = controller.disconnect();

    expect(controller.getSnapshot().view?.status).toBe("disconnected");
    waiting.reject(new Error("storage failed"));
    await pending;

    expect(controller.getSnapshot()).toMatchObject({ phase: "disconnect-error", notice: { state: "error" } });
    await controller.connect();

    expect(picker).toHaveBeenCalledTimes(1);
    await controller.disconnect();

    expect(repo.remove).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot()).toMatchObject({ phase: "ready", view: { status: "disconnected" } });
  });

  it("allows preload retry without requesting permission", async () => {
    const { controller, repo, picker } = setup();

    vi.mocked(repo.read).mockRejectedValueOnce(new Error("blocked"));
    await controller.load(owner);

    expect(controller.getSnapshot()).toMatchObject({ phase: "load-error", view: null });
    await controller.load(owner);

    expect(controller.getSnapshot().phase).toBe("ready");
    expect(picker).not.toHaveBeenCalled();
  });

  it("ignores a late picker after leaving the settings lifecycle", async () => {
    const { controller, picker, repo } = setup();

    await controller.load(owner);

    const waiting = deferred<FolderHandle>();

    picker.mockReturnValueOnce(waiting.promise);

    const pending = controller.connect();

    controller.stop();
    waiting.resolve(folder());
    expect(await pending).toBe(false);

    expect(controller.getSnapshot()).toMatchObject({ phase: "loading", view: null });
    expect(repo.write).not.toHaveBeenCalled();
  });

  it("ignores late success and failure after owner changes or effect restarts", async () => {
    const { controller, picker } = setup();

    await controller.load(owner);

    const waiting = deferred<FolderHandle>();

    picker.mockReturnValueOnce(waiting.promise);

    const pending = controller.connect();

    controller.stop();
    await controller.load({ ...owner, userId: "test-b" });
    waiting.reject(new Error("old error"));
    expect(await pending).toBe(false);

    expect(controller.getSnapshot()).toMatchObject({ phase: "ready", notice: null, view: { status: "disconnected" } });
  });

  it("notifies subscribers, unsubscribes, and does no IO when unsupported", async () => {
    const { controller, repo, picker } = setup();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    controller.unavailable("미지원");

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    await controller.connect();

    expect(repo.read).not.toHaveBeenCalled();
    expect(picker).not.toHaveBeenCalled();
    controller.stop();

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
