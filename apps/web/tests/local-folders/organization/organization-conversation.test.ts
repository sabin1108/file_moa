import { expect, it, vi } from "vitest";
import { OrganizationPreparationController } from "../../../src/features/local-folders/organization/organization-preparation-controller";
import type { SourceSnapshot } from "../../../src/features/local-folders/organization/source-snapshot-rules";
import { parseOrganizationReply } from "../../../src/features/local-folders/organization/organization-reply";
import { isOrganizationFollowup } from "../../../src/features/local-folders/organization/organization-conversation";
import { inferOrganizationConditions } from "../../../src/features/local-folders/organization/organization-intent";

const snapshot: SourceSnapshot = {
  documents: [{ id: "one", name: "memo.md", path: ["회사", "memo.md"], excerpt: "보고 내용", size: 10, lastModified: 1, sha256: "a".repeat(64), excerptHash: "b".repeat(64) }],
  complete: true, excluded: [], limits: [], discoveredFiles: 1, directories: 1, bytes: 10,
};
function fixture() {
  const read = vi.fn(async () => snapshot);
  const infer = vi.fn(async (text: string) => inferOrganizationConditions(text, "note", [[], ["회사"], ["정리"]]));
  const controller = new OrganizationPreparationController(read, vi.fn(), undefined, async () => ({ userId: "A", workspaceId: "A" }), infer);
  controller.update({ request: "자료를 정리해줘" });
  return { controller, read, infer };
}

it("asks missing conditions in chat and reads only after explicit local preparation", async () => {
  const { controller, read } = fixture();
  await controller.beginConversation();
  expect(controller.getSnapshot().conversationStep).toBe("scope");
  expect(read).not.toHaveBeenCalled();
  await controller.replyToConversation("전체");
  expect(controller.getSnapshot()).toMatchObject({ scope: { kind: "all" }, conversationStep: "basis" });
  await controller.replyToConversation("주제별로");
  expect(controller.getSnapshot().conversationStep).toBe("destination");
  await controller.replyToConversation("나중에 정할게");
  expect(controller.getSnapshot().conversationStep).toBe("confirm");
  expect(read).not.toHaveBeenCalled();
  await controller.replyToConversation("이대로 자료 확인해줘");
  expect(read).toHaveBeenCalledOnce();
  expect(controller.getSnapshot()).toMatchObject({ phase: "ready", conversationStep: null, consentKey: null });
});

it("accepts a natural destination answer without stripping characters from actual folder names", async () => {
  const { controller, read } = fixture();
  await controller.beginConversation();
  await controller.replyToConversation("전체");
  await controller.replyToConversation("주제별로");
  await controller.replyToConversation("note / 정리 폴더에 넣어줘");
  expect(controller.getSnapshot()).toMatchObject({ destination: ["정리"], conversationStep: "confirm", issue: null });
  expect(read).not.toHaveBeenCalled();
});

it("never expands an absent current path or ambiguous folder reply to all files", async () => {
  const { controller, read } = fixture();
  await controller.beginConversation();
  await controller.replyToConversation("현재 폴더");
  expect(controller.getSnapshot().scope).toBeNull();
  expect(controller.getSnapshot().issue).toBeTruthy();
  await controller.replyToConversation("없는 폴더만");
  expect(controller.getSnapshot().scope).toBeNull();
  await controller.replyToConversation("현재 폴더", { currentPath: ["회사"] });
  expect(controller.getSnapshot().scope).toEqual({ kind: "folder", path: ["회사"] });
  expect(read).not.toHaveBeenCalled();
});

it("keeps next/yes separate from provider consent and invalidates a prepared selection on a condition correction", async () => {
  const { controller } = fixture();
  controller.update({ scope: { kind: "all" }, basis: "주제별", destination: ["정리"] });
  await controller.prepare();
  const action = vi.fn(async () => ({ ok: true as const, model: "fixture", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, organization: { summary: "제안", matches: [], held: [] } }));
  await controller.replyToConversation("다음", {}, action);
  await controller.replyToConversation("네", {}, action);
  expect(action).not.toHaveBeenCalled();
  await controller.replyToConversation("전송에 동의해", {}, action);
  expect(action).toHaveBeenCalledOnce();
  await controller.replyToConversation("기준은 본문 언어별로");
  expect(controller.getSnapshot()).toMatchObject({ snapshot: null, result: null, consentKey: null, basis: "본문 언어별로", conversationStep: "confirm" });
});

it("ignores a late folder inference after account/connection reset", async () => {
  const { controller, infer } = fixture();
  await controller.beginConversation();
  let finish!: (value: { scope: { kind: "folder"; path: string[] } }) => void;
  infer.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = controller.replyToConversation("회사 폴더만");
  controller.reset();
  finish({ scope: { kind: "folder", path: ["회사"] } });
  await pending;
  expect(controller.getSnapshot()).toMatchObject({ request: "", scope: null, snapshot: null });
});

it("keeps manual corrections and chat on the same pending question", async () => {
  const { controller, read } = fixture();
  await controller.beginConversation();
  controller.update({ scope: { kind: "folder", path: ["회사"] } });
  expect(controller.getSnapshot().conversationStep).toBe("coverage");
  await controller.replyToConversation("하위 폴더까지 포함해줘");
  expect(controller.getSnapshot().conversationStep).toBe("basis");
  await controller.replyToConversation("다음");
  await controller.replyToConversation("어떤 기준이 좋아?");
  expect(controller.getSnapshot()).toMatchObject({ basis: "", conversationStep: "basis" });
  controller.update({ basis: "언어별", destination: ["정리"] });
  expect(controller.getSnapshot().conversationStep).toBe("confirm");
  await controller.replyToConversation("목적지는 현재 폴더로", { currentPath: [] });
  expect(controller.getSnapshot().destination).toEqual([]);
  expect(read).not.toHaveBeenCalled();
});

it("distinguishes explicit new requests from ongoing corrections", () => {
  for (const text of ["새 정리 시작", "새로운 질문", "다른 자료 찾아줘", "처음부터 다시"]) expect(isOrganizationFollowup(text)).toBe(false);
  for (const text of ["전체 말고 회사 폴더만", "기준은 언어별로", "전송하지 마", "네"]) expect(isOrganizationFollowup(text)).toBe(true);
});

it("asks coverage after folder selection and reads direct files only when requested", async () => {
  const read = vi.fn(async () => snapshot);
  const list = vi.fn(async () => ({ path: ["회사"], truncated: false, entries: [{ name: "memo.md", kind: "file" as const }, { name: "하위", kind: "directory" as const }] }));
  const controller = new OrganizationPreparationController(read, list);
  controller.update({ request: "자료 정리" });
  await controller.beginConversation();
  controller.update({ scope: { kind: "folder", path: ["회사"] } });
  expect(controller.getSnapshot().conversationStep).toBe("coverage");
  await controller.replyToConversation("이 폴더 파일만");
  expect(controller.getSnapshot()).toMatchObject({ scope: { kind: "selected", entries: [{ path: ["회사", "memo.md"], kind: "file" }] }, conversationStep: "basis" });
  expect(read).not.toHaveBeenCalled();
  await controller.replyToConversation("언어별로");
  controller.backConversation();
  expect(controller.getSnapshot()).toMatchObject({ conversationStep: "basis", basis: "언어별로" });
  controller.backConversation();
  expect(controller.getSnapshot()).toMatchObject({ conversationStep: "coverage", scope: { kind: "folder", path: ["회사"] } });
  await controller.replyToConversation("하위 폴더까지 포함해줘");
  expect(controller.getSnapshot()).toMatchObject({ conversationStep: "destination", includeSubfolders: true, scope: { kind: "folder", path: ["회사"] } });
});

it("retains conditions after cancellation and only retries a local read on request", async () => {
  const { controller, read } = fixture();
  controller.update({ scope: { kind: "all" }, basis: "주제별", destination: ["정리"] });
  await controller.beginConversation();
  controller.cancel();
  expect(controller.getSnapshot()).toMatchObject({ conversationStep: "confirm", snapshot: null, consentKey: null });
  expect(read).not.toHaveBeenCalled();
  await controller.replyToConversation("이대로 자료 확인해줘");
  expect(read).toHaveBeenCalledOnce();
});

it("does not reinterpret a mixed quoted sentence as a known folder", async () => {
  const { controller, infer } = fixture();
  await controller.beginConversation();
  infer.mockClear();
  await controller.replyToConversation('없는 폴더 말고 "회사"에서');
  expect(infer).not.toHaveBeenCalled();
  expect(controller.getSnapshot().scope).toBeNull();
});

it("accepts an explicit common folder reply but never partially applies an unsupported clause", () => {
  const documents = ["one", "two"].map(id => ({ id, name: `${id}.md`, sourcePath: ["자료"], excerpt: "한국어 본문" }));
  const questions = documents.map(document => ({ id: `${document.id}:destination`, documentId: document.id, kind: "destination" as const, reason: "언어 기준 확인", dates: [] }));
  expect(parseOrganizationReply("모두 영어 폴더에 넣어줘", questions, documents)).toEqual(documents.map(document => ({ documentId: document.id, destination: ["영어"] })));
  expect(() => parseOrganizationReply("모두 영어 폴더로, 그리고 알아서 삭제해줘", questions, documents)).toThrow();
  expect(() => parseOrganizationReply("모두 ../영어 폴더로", questions, documents)).toThrow();
  const named = { ...documents[0], name: "모두자료.md" };
  expect(parseOrganizationReply("모두자료.md는 영어 폴더로", questions, [named, documents[1]])).toEqual([{ documentId: named.id, destination: ["영어"] }]);
});
