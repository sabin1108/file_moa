import { expect, it, vi } from "vitest";
import { OrganizationPreparationController } from "../../../src/features/local-folders/organization/organization-preparation-controller";
import type { SourceSnapshot } from "../../../src/features/local-folders/organization/source-snapshot-rules";

async function reviewing() {
  const documents = ["one", "two"].map(id => ({ id, name: `${id}.md`, path: [`${id}.md`], excerpt: "정리할 자료", size: 10, lastModified: 1, sha256: "a".repeat(64), excerptHash: "b".repeat(64) }));
  const snapshot: SourceSnapshot = { documents, excluded: [], complete: true, limits: [], discoveredFiles: 2, directories: 1, bytes: 20 };
  const read = vi.fn(async () => snapshot);
  const controller = new OrganizationPreparationController(read, async path => ({ path: [...path], entries: [], truncated: false }), undefined, async () => ({ userId: "A", workspaceId: "A" }));
  controller.update({ request: "자료 정리", scope: { kind: "all" }, destination: ["정리"] });
  await controller.prepare();
  const action = vi.fn(async () => ({ ok: true as const, model: "fixture", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, organization: { summary: "목적지 확인", matches: [], held: documents.map(document => ({ documentId: document.id, reason: "목적지 확인" })) }, questions: documents.map(document => ({ id: `${document.id}:destination`, documentId: document.id, kind: "destination" as const, reason: "목적지 확인", dates: [] })) }));
  controller.consent(true);
  await controller.send(action);
  return { controller, read, action, snapshot };
}

it("chooses one existing destination for all requested files atomically without another read or AI call", async () => {
  const { controller, read, action, snapshot } = await reviewing();
  await controller.browseAnswers(["one", "two"]);
  await controller.picker.show(["정리", "영어"]);
  controller.chooseFolder();
  expect(controller.getSnapshot()).toMatchObject({ snapshot, answers: [{ documentId: "one", destination: ["영어"] }, { documentId: "two", destination: ["영어"] }], result: null, consentKey: null, picking: null, reviewConfirmed: false });
  expect(read).toHaveBeenCalledOnce();
  expect(action).toHaveBeenCalledOnce();
  controller.confirmReview();
  expect(controller.getSnapshot().reviewConfirmed).toBe(true);
  controller.clearAnswer("one");
  expect(controller.getSnapshot().reviewConfirmed).toBe(false);
});

it("rejects a parent, sibling or destination root instead of changing the meaning of a relative folder answer", async () => {
  for (const path of [[], ["다른곳", "영어"], ["정리"]]) {
    const { controller } = await reviewing();
    await controller.browseAnswers(["one", "two"]);
    await controller.picker.show(path);
    controller.chooseFolder();
    expect(controller.getSnapshot().answers).toEqual([]);
    expect(controller.getSnapshot().issue).toBeTruthy();
    expect(controller.picker.getSnapshot().open).toBe(true);
  }
});

it("preserves exclusions and does not confirm unanswered questions or accept stale choices after cancellation/reset", async () => {
  const { controller } = await reviewing();
  controller.confirmReview();
  expect(controller.getSnapshot().reviewConfirmed).toBe(false);
  controller.answer({ documentId: "two", exclude: true });
  await controller.browseAnswers(["one", "two"]);
  await controller.picker.show(["정리", "영어"]);
  controller.chooseFolder();
  expect(controller.getSnapshot().answers).toContainEqual({ documentId: "two", exclude: true });
  await controller.browseAnswers(["one"]);
  controller.closePicker();
  controller.chooseFolder();
  expect(controller.getSnapshot().answers).toHaveLength(2);
  await controller.browseAnswers(["one"]);
  controller.reset();
  controller.chooseFolder();
  expect(controller.getSnapshot().answers).toEqual([]);
});

it("validates planned child folder names and changes only the requested file", async () => {
  const { controller, action } = await reviewing();
  await controller.browseAnswers(["one"]);
  controller.chooseAnswerFolder(["..", "영어"]);
  expect(controller.getSnapshot().answers).toEqual([]);
  controller.chooseAnswerFolder(["새 폴더", "영어"]);
  expect(controller.getSnapshot().answers).toEqual([{ documentId: "one", destination: ["새 폴더", "영어"] }]);
  expect(controller.getSnapshot().consentKey).toBeNull();
  expect(action).toHaveBeenCalledOnce();
});
