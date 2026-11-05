import { describe, expect, it, vi } from "vitest";
import { InlineEditorController } from "../../../src/features/local-folders/store/inline-editor-controller";

function fixture() {
  const write = vi.fn(async () => ({ hasBackup: true, savedAt: "2026-11-04T12:00:00Z" }));
  const remove = vi.fn(async () => {});
  const controller = new InlineEditorController(async () => ({ id: crypto.randomUUID(), path: ["a.md"],
    text: "original", originalText: "original", hasBackup: false, conflict: false }), write,
  async () => {}, remove, () => {});
  return { controller, write, remove };
}

describe("inline editor interaction boundaries", () => {
  it("keeps input typed during a pending save dirty after completion", async () => {
    const { controller, write } = fixture();
    let finish!: () => void;
    write.mockImplementationOnce(() => new Promise(resolve => {
      finish = () => resolve({ hasBackup: true, savedAt: "2026-11-04T12:00:00Z" });
    }));
    await controller.open(["a.md"]);
    controller.setText("first");
    const saving = controller.save();
    controller.setText("first plus second");
    expect(controller.close()).toBe(false);
    finish();
    await saving;
    expect(controller.getSnapshot()).toMatchObject({ phase: "ready", text: "first plus second", savedText: "first", hasBackup: true });
  });

  it("skips periodic saves before first backup and during IME composition", async () => {
    const { controller, write } = fixture();
    await controller.open(["a.md"]);
    controller.setText("changed");
    expect(await controller.save(false)).toBe(false);
    controller.setComposing(true);
    expect(await controller.save(true)).toBe(false);
    expect(write).not.toHaveBeenCalled();
    controller.setComposing(false);
    expect(await controller.save(true)).toBe(true);
  });

  it("requires explicit dirty discard before removing the local draft", async () => {
    const { controller, remove } = fixture();
    await controller.open(["a.md"]);
    controller.setText("draft");
    expect(controller.close()).toBe(false);
    expect(remove).not.toHaveBeenCalled();
    controller.continueEditing();
    expect(controller.getSnapshot().closeRequested).toBe(false);
    expect(controller.close(true)).toBe(true);
    expect(remove).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().open).toBe(false);
  });
});
