import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ConversationStore } from "../../src/features/conversation-workspace/store/conversation-store";
import { useConversationRecords } from "../../src/features/ai-records/hooks/useConversationRecords";
import type { useGeneralChat } from "../../src/features/conversation-workspace/hooks/useGeneralChat";
import type { AiRecordsController } from "../../src/features/ai-records/store/ai-records-controller";

let store: ConversationStore;
vi.mock("../../src/features/conversation-workspace/providers/ConversationStateProvider", () => ({ useConversationStore: () => store }));
beforeEach(() => { store = new ConversationStore(); });

function records(assertAvailable: () => void = vi.fn()) {
  const controller = { subscribe: () => () => {}, getServerSnapshot: () => ({ phase: "ready" }) } as unknown as AiRecordsController;
  const restore = vi.fn();
  const chat = { state: store.getSnapshot(), restore } as unknown as ReturnType<typeof useGeneralChat>;
  let result!: ReturnType<typeof useConversationRecords>;
  function Probe() { result = useConversationRecords(controller, chat, { assertAvailable, beforeRestore: vi.fn() }); return null; }
  renderToStaticMarkup(<Probe />);
  return { result, restore };
}

it.each([true, false])("detaching storage preserves the transcript and draft when temporary=%s", temporary => {
  store.dispatch({ type: "draft", value: "저장하지 않은 질문" });
  store.dispatch({ type: "local", id: "turn-one", kind: "find", question: "찾을 자료", answer: "찾은 자료", status: "completed" });
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
  const { result } = records(() => { throw new Error("active-request"); });
  expect(() => result.detachStorage()).toThrow("active-request");
  expect(store.getSelection()).toBe(before);
});
