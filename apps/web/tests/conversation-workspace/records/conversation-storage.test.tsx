import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ConversationStore } from "../../../src/features/conversation-workspace/conversation-store";
import { useConversationRecords } from "../../../src/features/conversation-workspace/records/useConversationRecords";
import { useGeneralChat } from "../../../src/features/conversation-workspace/messaging/useGeneralChat";
import type { AiRecordsController } from "../../../src/features/ai-records/ai-records-controller";
import { aiRecordPayloadSchema, restoreConversation, type ConversationPayload } from "../../../src/shared/ai-records";

vi.mock("react", async importActual => ({
  ...await importActual<typeof import("react")>(),
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot()
}));
const stream = vi.hoisted(() => vi.fn());

vi.mock("../../../src/features/conversation-workspace/messaging/chat-stream", () => ({ readChatStream: stream }));

let store: ConversationStore;

vi.mock(
  "../../../src/features/conversation-workspace/ConversationStateProvider",
  () => ({ useConversationStore: () => store })
);
beforeEach(() => {
  store = new ConversationStore();
});

function records(assertAvailable: () => void = vi.fn(), save = vi.fn<AiRecordsController["save"]>().mockImplementation(async input => ({
  payload: aiRecordPayloadSchema.parse(input), revisionId: "rev-fixture", revisions: 1
}))) {
  const revision = { value: 0 };
  const controller = {
    subscribe: () => () => { }, getSnapshot: () => ({ phase: "ready" }), getServerSnapshot: () => ({ phase: "ready" }), save,
    getConnectionRevision: () => revision.value,
    assertConnectionRevision: (value: number) => {
      if (value !== revision.value) throw new Error("stale-record-confirmation");
    }
  } as unknown as AiRecordsController;
  const restore = vi.fn((payload: ConversationPayload | null) => store.dispatch(payload ? { type: "restore", state: restoreConversation(payload) } : { type: "reset" }));
  const chat = { state: store.getSnapshot(), restore } as unknown as ReturnType<typeof useGeneralChat>;
  let result!: ReturnType<typeof useConversationRecords>;

  function Probe() {
    result = useConversationRecords(controller, chat, { assertAvailable, beforeRestore: vi.fn() });

    return null;
  }

  renderToStaticMarkup(<Probe />);

  return { result, restore, save, revision };
}

function selectConversation(turns: number, temporary = false) {
  store.dispatch({ type: "restore", state: {
    draft: "보존할 질문", active: null, sequence: -1,
    turns: Array.from({ length: turns }, (_, index) => ({ id: `turn-${index}`, question: "질문", answer: "답변", visibleLength: 2, status: "completed" }))
  } });
  store.select({ id: "chat-limit", temporary, lastSaved: "checkpoint" });
}

it.each([true, false])("detaching storage preserves the transcript and draft when temporary=%s", temporary => {
  store.dispatch({ type: "draft", value: "저장하지 않은 질문" });
  store.dispatch({
    type: "local",
    id: "turn-one",
    kind: "find",
    question: "찾을 자료",
    answer: "찾은 자료",
    status: "completed"
  });
  store.select({ id: "chat-one", temporary, lastSaved: "checkpoint", projectId: "project-one" });

  const before = store.getSnapshot();
  const { result, restore } = records();

  result.detachStorage();
  expect(store.getSnapshot()).toBe(before);
  expect(store.getSelection()).toMatchObject({ id: null, temporary: true, lastSaved: "", projectId: "project-one" });
  expect(restore).not.toHaveBeenCalled();
});

it("an active request rejects detaching storage before changing state", () => {
  store.select({ id: "chat-one", temporary: false });

  const before = store.getSelection();
  const { result } = records(() => {
    throw new Error("active-request");
  });

  expect(() => result.detachStorage()).toThrow("active-request");
  expect(store.getSelection()).toBe(before);
});

it("a committed deletion detaches the live conversation while preserving all unsaved content", () => {
  selectConversation(1);
  const before = store.getSnapshot();
  const { result, restore } = records(() => { throw new Error("active-request"); });

  result.detachDeletedConversation("chat-limit");
  expect(store.getSnapshot()).toBe(before);
  expect(store.getSelection()).toMatchObject({ id: null, temporary: true, lastSaved: "" });
  expect(store.getSelection().status).toContain("삭제");
  expect(restore).not.toHaveBeenCalled();
});

it("a late deletion callback leaves a newly selected conversation untouched", () => {
  selectConversation(1);
  const { result } = records();

  store.select({ id: "chat-new", temporary: false });
  const selection = store.getSelection();
  const state = store.getSnapshot();

  result.detachDeletedConversation("chat-limit");
  expect(store.getSelection()).toBe(selection);
  expect(store.getSnapshot()).toBe(state);
});

it("saves a 500-turn conversation before opening a new stored conversation", async () => {
  selectConversation(500);
  const { result, restore, save } = records();

  await result.open(null, false);
  expect(save).toHaveBeenCalledOnce();
  expect(restore).toHaveBeenCalledOnce();
  expect(store.getSnapshot().turns).toHaveLength(0);
  expect(store.getSelection()).toMatchObject({ temporary: false });
});

it("does not replace freshly saved edits with the old list snapshot when reopening the same conversation", async () => {
  selectConversation(1);
  const current = store.getSnapshot();
  const { result, restore, save } = records();

  await result.open({ type: "conversation", id: "chat-limit", title: "이전 목록", updatedAt: "2026-11-13T00:00:00.000Z", draft: "이전 초안", projectId: null, turns: [] });
  expect(save).toHaveBeenCalledOnce();
  expect(restore).not.toHaveBeenCalled();
  expect(store.getSnapshot()).toBe(current);
});

it.each([false, true])("requires explicit discard before leaving a legacy 501-turn conversation for temporary=%s", async temporary => {
  selectConversation(501);
  const before = store.getSnapshot();
  const { result, restore } = records();

  await expect(result.open(null, temporary)).rejects.toThrow("unsaved-conversation");
  expect(restore).not.toHaveBeenCalled();
  result.cancelOpen();
  expect(store.getSnapshot()).toBe(before);
  await expect(result.open(null, temporary)).rejects.toThrow("unsaved-conversation");
  result.discardAndOpen();
  expect(restore).toHaveBeenCalledOnce();
  expect(store.getSnapshot().turns).toHaveLength(0);
  expect(store.getSelection().temporary).toBe(temporary);
});

it("allows restoring the same saved conversation only after an explicit discard when saving fails", async () => {
  selectConversation(501);
  const { result, restore } = records();
  const checkpoint: ConversationPayload = { type: "conversation", id: "chat-limit", title: "저장본", updatedAt: "2026-11-13T00:00:00.000Z", draft: "이전 저장본", projectId: null, turns: [] };

  await expect(result.open(checkpoint)).rejects.toThrow("unsaved-conversation");
  expect(restore).not.toHaveBeenCalled();
  result.discardAndOpen();
  expect(restore).toHaveBeenCalledWith(checkpoint);
  expect(store.getSnapshot().draft).toBe("이전 저장본");
});

it.each(["edited", "connection", "active"])("rejects a stale discard confirmation after %s changes", async kind => {
  selectConversation(501);
  let active = false;
  const { result, restore, revision } = records(() => {
    if (active) throw new Error("active-request");
  });

  await expect(result.open(null)).rejects.toThrow("unsaved-conversation");
  if (kind === "edited") store.dispatch({ type: "draft", value: "확인 뒤 추가한 내용" });
  if (kind === "connection") revision.value++;
  if (kind === "active") active = true;
  expect(() => result.discardAndOpen()).toThrow(kind === "edited" ? "stale-conversation-confirmation" : kind === "connection" ? "stale-record-confirmation" : "active-request");
  expect(restore).not.toHaveBeenCalled();
  expect(store.getSelection().id).toBe("chat-limit");
  expect(store.getSnapshot().turns).toHaveLength(501);
});

it("does not discard a temporary draft merely because a new conversation was requested", async () => {
  selectConversation(1, true);
  const before = store.getSnapshot();
  const { result, save, restore } = records();

  await expect(result.open(null)).rejects.toThrow("unsaved-conversation");
  expect(store.getSnapshot()).toBe(before);
  expect(save).not.toHaveBeenCalled();
  expect(restore).not.toHaveBeenCalled();
  result.discardAndOpen();
  expect(store.getSnapshot().turns).toHaveLength(0);
});

it("preserves edits made while the old conversation is being saved for a switch", async () => {
  selectConversation(1);
  let finish!: (value: Awaited<ReturnType<AiRecordsController["save"]>>) => void;
  const save = vi.fn<AiRecordsController["save"]>().mockImplementation(() => new Promise(resolve => {
    finish = resolve;
  }));
  const { result, restore } = records(vi.fn(), save);
  const opening = result.open(null);

  store.dispatch({ type: "draft", value: "저장 대기 중 추가한 질문" });
  finish({ payload: save.mock.calls[0][0], revisionId: "saved-old", revisions: 1 });
  await expect(opening).rejects.toThrow();
  expect(restore).not.toHaveBeenCalled();
  expect(store.getSnapshot().draft).toBe("저장 대기 중 추가한 질문");
});

it("does not send or create a local task after the turn limit, even before React rerenders", async () => {
  selectConversation(500);
  let chat!: ReturnType<typeof useGeneralChat>;

  function Probe() {
    chat = useGeneralChat({ userId: "user-a", workspaceId: "workspace-a" }, "openai");

    return null;
  }

  renderToStaticMarkup(<Probe />);
  const before = store.getSnapshot();

  await chat.send();
  expect(chat.recordTask("find", "질문", "검색")).toBeNull();
  expect(stream).not.toHaveBeenCalled();
  expect(store.getSnapshot()).toBe(before);
});
