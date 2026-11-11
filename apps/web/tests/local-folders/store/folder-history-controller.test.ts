import { describe, expect, it, vi } from "vitest";
import { FolderHistoryController } from "../../../src/features/local-folders/store/folder-history-controller";
import type { FolderHistory } from "../../../src/features/local-folders/services/folder-history";

const empty: FolderHistory = {
  groups: [],
  missing: true,
  incomplete: false,
  truncated: false,
  invalid: 0,
  unsupported: 0,
  unreadable: 0,
  oversized: 0,
  excluded: 0
};

describe("history request lifetime", () => {
  it("discards a late result and aborts reading when closed", async () => {
    let finish!: (value: FolderHistory) => void;
    let signal!: AbortSignal;
    const controller = new FolderHistoryController((_path, nextSignal) => {
      signal = nextSignal;

      return new Promise(resolve => {
        finish = resolve;
      });
    });
    const pending = controller.open(["one"]);

    controller.close();
    finish(empty);
    await pending;
    expect(signal.aborted).toBe(true);
    expect(controller.getSnapshot()).toMatchObject({ open: false, result: null, phase: "idle" });
  });

  it("does not replace a newer folder result with an older response", async () => {
    let finish!: (value: FolderHistory) => void;
    const read = vi.fn().mockImplementationOnce(() => new Promise(resolve => {
      finish = resolve;
    })).mockResolvedValueOnce(empty);
    const controller = new FolderHistoryController(read);
    const old = controller.open(["old"]);

    await controller.open(["new"]);
    finish({ ...empty, invalid: 1, incomplete: true });
    await old;
    expect(controller.getSnapshot()).toMatchObject({ path: ["new"], phase: "ready", result: empty });
  });

  it("clears results on failed refresh and allows explicit retry", async () => {
    const read = vi.fn().mockResolvedValueOnce(empty).mockRejectedValueOnce(new DOMException("denied", "NotAllowedError")).mockResolvedValueOnce(empty);
    const controller = new FolderHistoryController(read);

    await controller.open([]);
    await controller.refresh();
    expect(controller.getSnapshot()).toMatchObject({ phase: "error", issue: "permission", result: null });
    await controller.refresh();
    expect(controller.getSnapshot()).toMatchObject({ phase: "ready", issue: null });
  });
});
