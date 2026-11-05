import { describe, expect, it, vi } from "vitest";
import { FolderHistoryController } from "../../../src/features/local-folders/store/folder-history-controller";
import type { FolderHistory } from "../../../src/features/local-folders/services/folder-history";
import type { HistoryTargetInspection } from "../../../src/features/local-folders/services/history-target-inspection";
import type { HistoryGroup } from "../../../src/features/local-folders/lib/folder-history";

const group = { id: "id", path: ["note.txt"], kind: "txt", status: "uncertain", time: "2026-10-31T00:00:00.000Z", count: 1 } as const;
const history: FolderHistory = { groups: [group, { ...group, id: "other" }], missing: false, incomplete: false, truncated: false, invalid: 0, unsupported: 0, unreadable: 0, oversized: 0, excluded: 0 };
const result: HistoryTargetInspection = { path: group.path, status: "present", actualKind: "file", checkedAt: group.time };
describe("target inspection lifetime", () => {
  it.each(["close", "refresh", "cancelInspection", "dispose"] as const)("discards late target responses after %s", async action => {
    let finish!: (value: HistoryTargetInspection) => void;
    const inspect = vi.fn<(path: readonly string[], group: HistoryGroup, signal: AbortSignal) => Promise<HistoryTargetInspection>>(() => new Promise(resolve => { finish = resolve; }));
    const controller = new FolderHistoryController(async () => history, inspect);
    await controller.open([]);
    const pending = controller.inspectTarget("id");
    await controller[action](); finish(result); await pending;
    expect(inspect.mock.calls[0][2].aborted).toBe(true);
    expect(controller.getSnapshot().inspection?.result).toBeFalsy();
  });
  it("keeps only the latest selected target and does not alter recorded history", async () => {
    let finish!: (value: HistoryTargetInspection) => void;
    const inspect = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce(result);
    const controller = new FolderHistoryController(async () => history, inspect);
    await controller.open([]); const old = controller.inspectTarget("id"); await controller.inspectTarget("other");
    finish({ ...result, status: "missing" }); await old;
    expect(controller.getSnapshot().inspection).toMatchObject({ id: "other", phase: "ready", result });
    expect(controller.getSnapshot().result).toBe(history);
  });
  it("clears old target result on failed retry", async () => {
    const inspect = vi.fn().mockResolvedValueOnce(result).mockRejectedValueOnce(new Error("history-record-changed"));
    const controller = new FolderHistoryController(async () => history, inspect);
    await controller.open([]); await controller.inspectTarget("id"); await controller.inspectTarget("id");
    expect(controller.getSnapshot().inspection).toMatchObject({ phase: "error", issue: "record", result: null });
  });
  it("does not inspect missing or completed groups", async () => {
    const inspect = vi.fn(); const controller = new FolderHistoryController(async () => ({ ...history, groups: [{ ...group, status: "ready" }] }), inspect);
    await controller.open([]); await controller.inspectTarget("missing"); await controller.inspectTarget("id");
    expect(inspect).not.toHaveBeenCalled();
  });
});
