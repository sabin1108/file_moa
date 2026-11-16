import { afterEach, expect, it, vi } from "vitest";
import { SampleWorkspaceStore } from "../../src/features/sample-workspace/sample-workspace-store";
import type { SampleAnswerResult } from "../../src/shared/sample-answer";
import type { SampleCatalog } from "../../src/shared/sample-contract";

const catalog: SampleCatalog = { version: "1", folders: [{ id: "work", label: "업무" }], documents: [{ id: "one", name: "회의.md", format: "md", excerpt: "합성 회의 자료입니다.", proposal: { folderId: "work", reason: "회의", reviewRequired: false } }] };
const success: SampleAnswerResult = { ok: true, answer: { answer: "API 응답", citations: [] }, model: "gpt-6-luna", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
function fixture() {
  const records = new Map<string, string>();
  const storage = { getItem: (key: string) => records.get(key) ?? null, setItem: (key: string, value: string) => { records.set(key, value); } };
  const session = { kind: "sample" as const, id: "answer-store", expiresAt: Date.now() + 3600000, version: "1" as const };
  const store = new SampleWorkspaceStore(catalog, session, () => storage);
  const off = store.subscribe(() => {});
  return { store, off, storage, session };
}
afterEach(() => vi.useRealTimers());

it("calls only once on explicit send and restores the real answer without replay", async () => {
  const { store, off, storage, session } = fixture();
  const action = vi.fn().mockResolvedValue(success);
  expect(action).not.toHaveBeenCalled();
  store.dispatch({ type: "mode", mode: "chat" });
  store.dispatch({ type: "draft", value: "새 질문" });
  const pending = store.requestAnswer(action, "chat");
  await store.requestAnswer(action, "chat");
  await pending;
  expect(action).toHaveBeenCalledOnce();
  expect(store.getSnapshot().state.messages.at(-1)?.text).toBe("API 응답");
  const restored = new SampleWorkspaceStore(catalog, session, () => storage);
  const close = restored.subscribe(() => {});
  expect(restored.getSnapshot().state.messages.at(-1)?.text).toBe("API 응답");
  expect(action).toHaveBeenCalledOnce();
  close(); off();
});
it("sends and restores only the separate question selection without changing a reviewed organization result", async () => {
  const { store, off, storage, session } = fixture();
  store.dispatch({ type: "select", ids: ["one"] });
  store.dispatch({ type: "select-question", ids: [] });
  store.dispatch({ type: "draft", value: "자료 질문" });
  const action = vi.fn().mockResolvedValue(success);
  await store.requestAnswer(action, "grounded");
  expect(action).not.toHaveBeenCalled();
  store.dispatch({ type: "select-question", ids: ["one"] });
  await store.requestAnswer(action, "grounded");
  expect(action.mock.calls[0][0].documentIds).toEqual(["one"]);
  store.dispatch({ type: "select-question", ids: [] });
  const restored = new SampleWorkspaceStore(catalog, session, () => storage);
  const close = restored.subscribe(() => {});
  expect(restored.getSnapshot().state.questionSelected).toEqual([]);
  expect(restored.getSnapshot().state.selected).toEqual(["one"]);
  close(); off();
});
it.each(["cancel", "unmount", "expire"])("discards a late API answer after %s", async reason => {
  vi.useFakeTimers();
  const { store, off } = fixture();
  store.dispatch({ type: "draft", value: "보존할 질문" });
  let resolve!: (result: SampleAnswerResult) => void;
  const pending = store.requestAnswer(() => new Promise(done => { resolve = done; }), "chat");
  if (reason === "cancel") store.cancelAi();
  else if (reason === "unmount") off();
  else vi.advanceTimersByTime(3600001);
  resolve(success);
  await pending;
  expect(store.getSnapshot().state.messages).toEqual([]);
  expect(store.getSnapshot().state.draft).toBe("보존할 질문");
  off();
});
it.each(["limit", "unavailable", "timeout"] as const)("keeps the draft without a prepared answer on %s", async code => {
  const { store, off } = fixture();
  store.dispatch({ type: "draft", value: "답변을 못 받은 질문" });
  await store.requestAnswer(async () => ({ ok: false, code }), "chat");
  expect(store.getSnapshot().state.messages).toEqual([]);
  expect(store.getSnapshot().state.draft).toBe("답변을 못 받은 질문");
  expect(store.getSnapshot().notice).toBeTruthy();
  off();
});
it("keeps unique turn IDs and alternating bounded context after the forty-message cap", async () => {
  const { store, off } = fixture();
  const action = vi.fn().mockResolvedValue(success);
  for (let n = 0; n < 25; n++) {
    store.dispatch({ type: "draft", value: `질문 ${n}` });
    await store.requestAnswer(action, "chat");
  }
  const messages = store.getSnapshot().state.messages;
  expect(messages).toHaveLength(40);
  expect(new Set(messages.map(message => message.id)).size).toBe(40);
  expect(action.mock.calls.at(-1)?.[0].messages.map((message: { role: string }) => message.role)).toEqual(["user", "assistant", "user", "assistant", "user", "assistant", "user"]);
  off();
});
