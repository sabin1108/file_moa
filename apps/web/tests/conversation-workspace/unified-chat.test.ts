import { expect, it } from "vitest";
import { classifyWorkspaceRequest } from "../../src/features/conversation-workspace/lib/workspace-request";
import { chatContext, chatReducer, initialChatState } from "../../src/features/conversation-workspace/lib/general-chat-state";
import { restoreConversation } from "../../src/shared/ai-records";
import { ConversationStore } from "../../src/features/conversation-workspace/store/conversation-store";

it.each([
  ["안녕, 오늘 할 일을 같이 생각해줘", false, "chat"],
  ["지금 대화를 정리해줘", false, "chat"],
  ["회의 자료를 찾아줘", false, "find"],
  ["파일을 폴더별로 정리해줘", false, "organize"],
  ["회의 자료를 찾아서 정리해줘", false, "choose"],
  ["파일 정리하는 방법을 알려줘", false, "chat"],
  ["파일과 폴더의 차이가 뭐야", false, "chat"],
  ["PDF 파일이 무엇인지 설명해줘", false, "chat"],
  ["파일을 찾지 말고 용어를 설명해줘", false, "chat"],
  ["이 자료를 요약해줘", true, "grounded"],
  ["이 자료를 요약해줘", false, "choose"],
] as const)("routes %s without using a model", (text, prepared, expected) => {
  expect(classifyWorkspaceRequest(text, prepared)).toBe(expected);
});

it("keeps local task turns in the transcript and saved payload but out of implicit model context", () => {
  let state = chatReducer(
    initialChatState,
    {
      type: "local",
      id: "find-1",
      kind: "find",
      question: "로컬 비공개 자료 찾아줘",
      answer: "private/path.md 후보 확인",
      status: "completed"
    }
  );

  state = chatReducer(
    state,
    {
      type: "local",
      id: "grounded-1",
      kind: "grounded",
      question: "이 자료 요약",
      answer: "전송 동의한 자료의 답변",
      status: "completed"
    }
  );
  expect(state.turns).toHaveLength(2);
  expect(chatContext(state, "다음 일반 질문")).toEqual([{ role: "user", content: "다음 일반 질문" }]);

  const restored = restoreConversation({
    id: "chat-one",
    type: "conversation",
    title: "한 대화",
    updatedAt: "2026-11-09T00:00:00.000Z",
    projectId: null,
    draft: "보존할 초안",
    turns: state.turns
  });

  expect(restored.turns.map(turn => turn.kind)).toEqual(["find", "grounded"]);
  expect(chatContext(restored, "일반 질문")).toEqual([{ role: "user", content: "일반 질문" }]);
});

it("updates a task in place and ignores updates after the conversation is reset", () => {
  let state = chatReducer(
    initialChatState,
    { type: "local", id: "find-1", kind: "find", question: "자료 찾기", answer: "조건 확인", status: "pending" }
  );

  state = chatReducer(state, { type: "local-update", id: "find-1", answer: "후보 2개", status: "completed" });
  expect(state.turns).toHaveLength(1);
  expect(state.turns[0]).toMatchObject({ kind: "find", answer: "후보 2개", visibleLength: 5, status: "completed" });
  state = chatReducer(state, { type: "reset" });
  expect(chatReducer(state, { type: "local-update", id: "find-1", answer: "늦은 결과", status: "completed" })).toEqual(state);
});

it("retains one owner's state across subscribers and isolates another store", () => {
  const first = new ConversationStore();
  const other = new ConversationStore();
  let notifications = 0;
  const unsubscribe = first.subscribe(() => {
    notifications++;
  });

  first.dispatch({ type: "draft", value: "다녀와도 남을 초안" });
  unsubscribe();
  first.dispatch({
    type: "local",
    id: "find-1",
    kind: "find",
    question: "자료 찾기",
    answer: "후보 2개",
    status: "completed"
  });
  expect(first.getSnapshot()).toMatchObject({ draft: "다녀와도 남을 초안", turns: [{ kind: "find", answer: "후보 2개" }] });
  expect(notifications).toBe(1);
  expect(other.getSnapshot()).toBe(initialChatState);
  first.select({ id: "chat-selected", temporary: false, projectId: "project-one" });
  expect(first.getSelection()).toMatchObject({ id: "chat-selected", temporary: false, projectId: "project-one" });
  first.dispatch({ type: "reset" });
  expect(first.getSelection()).toMatchObject({ id: null, temporary: true, projectId: "" });
  first.select({ id: "empty-chat", temporary: false });
  first.dispatch({ type: "reset" });
  expect(first.getSelection()).toMatchObject({ id: null, temporary: true });
});
