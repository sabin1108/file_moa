import { describe, expect, it, vi } from "vitest";
import { RecoveryConnectionController } from "../../../src/features/local-folders/recovery/recovery-connection-controller";
import { RecoveryConnectionError } from "../../../src/features/local-folders/recovery/recovery-connection-error";
import type { FolderConnectionSession } from "../../../src/features/local-folders/connection-session";

function fixture(error?: Error) {
  const session = {
    prepareRecoveryCreation: vi.fn(async () => ({ folderName: "parent" })),
    createPreparedRecovery: vi.fn(async () => {
      if (error) throw error;
    }),
    cancelRecovery: vi.fn(),
  };

  return {
    session,
    controller: new RecoveryConnectionController(session as unknown as FolderConnectionSession, vi.fn())
  };
}

describe("recovery creation feedback", () => {
  it("gives a short location error with an explicit repair action", async () => {
    const { controller, session } = fixture();

    session.prepareRecoveryCreation.mockRejectedValueOnce(new RecoveryConnectionError("check-location", Error("recovery-vault-location")));
    await controller.run("choose");

    const state = controller.getSnapshot();

    expect(state.message.length).toBeLessThan(30);
    expect(state.help).toContain("자료 폴더 최상위");
    expect(state.remedy).toBe("choose-location");
  });
  it("selection is not reported as creation and only create performs mutation", async () => {
    const { session, controller } = fixture();

    await controller.run("choose");
    expect(controller.getSnapshot().creationParentName).toBe("parent");
    expect(session.createPreparedRecovery).not.toHaveBeenCalled();
    await controller.run("create");
    expect(session.createPreparedRecovery).toHaveBeenCalledOnce();
    expect(controller.getSnapshot()).toMatchObject({ failed: false, creationParentName: null });
  });

  it("distinguishes permission denial from storage failure without leaking raw error text", async () => {
    for (const stage of ["request-write", "save-connection"] as const) {
      const error = new RecoveryConnectionError(stage, stage === "request-write"
        ? new DOMException("private/path/body", "NotAllowedError")
        : new DOMException("private/path/body", "DataCloneError"));
      const { controller } = fixture(error);

      await controller.run("create");

      const state = controller.getSnapshot();

      expect(state.failed).toBe(true);
      expect(state.message).toContain(stage === "request-write" ? "쓰기 권한 확인" : "브라우저 연결 저장");
      expect(state.diagnostic).toContain(stage);
      expect(JSON.stringify(state)).not.toContain("private/path/body");

      if (stage === "request-write") expect(state.message).not.toContain("남아 있을");
    }
  });

  it("reports cancellation and clears the selected location", async () => {
    const { controller, session } = fixture();

    await controller.run("choose");
    controller.cancel();
    expect(controller.getSnapshot()).toMatchObject({ pending: null, creationParentName: null });
    expect(session.cancelRecovery).toHaveBeenCalledOnce();
  });
});
