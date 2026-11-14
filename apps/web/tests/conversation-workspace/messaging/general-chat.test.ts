import { describe, expect, it } from "vitest";
import { chatReducer, initialChatState, chatContext } from "../../../src/features/conversation-workspace/messaging/general-chat-state";

describe("GC-005/007 conversation state", () => {
  it.each(["start", "local"] as const)("keeps the draft and existing 500 turns when another %s would overflow", type => {
    const turns = Array.from({ length: 500 }, (_, index) => ({ id: `turn-${index}`, question: "질문", answer: "답변", visibleLength: 2, status: "completed" as const }));
    const state = { ...initialChatState, draft: "보존할 다음 질문", turns };
    const action = type === "start"
      ? { type, id: "overflow", question: state.draft }
      : { type, id: "overflow", kind: "find" as const, question: state.draft, answer: "검색", status: "completed" as const };

    expect(chatReducer(state, action)).toBe(state);
    expect(chatReducer({ ...state, turns: turns.slice(0, 499) }, action).turns).toHaveLength(500);
  });

  it("does not split an emoji and shows all received text immediately on completion", () => {
    let state = chatReducer(initialChatState, { type: "start", id: "emoji", question: "질문" });

    state = chatReducer(
      state,
      { type: "event", event: { type: "accepted", generationId: "emoji", sequence: 0 } }
    );
    state = chatReducer(
      state,
      { type: "event", event: { type: "text_delta", generationId: "emoji", sequence: 1, text: "A😀B" } }
    );
    state = chatReducer(state, { type: "reveal", id: "emoji", characters: 2 });
    expect(state.turns[0].visibleLength).toBe(1);
    state = chatReducer(
      state,
      {
        type: "event",
        event: { type: "completed", generationId: "emoji", sequence: 2, model: "fixture", usage: null }
      }
    );
    expect(state.turns[0]).toMatchObject({ answer: "A😀B", visibleLength: 4, status: "completed" });
  });
  it("reveals received text independently from protocol sequence and drops unrevealed text on stop", () => {
    let state = chatReducer(initialChatState, { type: "start", id: "reveal", question: "질문" });

    state = chatReducer(
      state,
      { type: "event", event: { type: "accepted", generationId: "reveal", sequence: 0 } }
    );
    state = chatReducer(
      state,
      {
        type: "event",
        event: { type: "text_delta", generationId: "reveal", sequence: 1, text: "가나다라마바사아자차" }
      }
    );
    state = chatReducer(state, { type: "reveal", id: "reveal", characters: 3 });
    expect(state.turns[0]).toMatchObject({ answer: "가나다라마바사아자차", visibleLength: 3 });
    expect(state.sequence).toBe(1);
    state = chatReducer(state, { type: "stop", id: "reveal" });
    expect(state.turns[0].answer).toBe("가나다");
    expect(chatReducer(state, { type: "reveal", id: "reveal", characters: 10 })).toEqual(state);
  });

  it.each(["session", "interrupted"] as const)("settles the received queue correctly on %s", code => {
    let state = chatReducer(initialChatState, { type: "start", id: "error", question: "질문" });

    state = chatReducer(
      state,
      { type: "event", event: { type: "accepted", generationId: "error", sequence: 0 } }
    );
    state = chatReducer(
      state,
      {
        type: "event",
        event: { type: "text_delta", generationId: "error", sequence: 1, text: "보인부분숨은부분" }
      }
    );
    state = chatReducer(state, { type: "reveal", id: "error", characters: 4 });
    state = chatReducer(
      state,
      { type: "event", event: { type: "error", generationId: "error", sequence: 2, code } }
    );
    expect(state.turns[0].answer).toBe(code === "session" ? "보인부분" : "보인부분숨은부분");
    expect(state.turns[0].visibleLength).toBe(state.turns[0].answer.length);
  });

  it("preserves partial text on stop and ignores later events from a stopped generation", () => {
    let state = chatReducer(initialChatState, { type: "start", id: "first", question: "질문" });

    state = chatReducer(
      state,
      { type: "event", event: { type: "accepted", generationId: "first", sequence: 0 } }
    );
    state = chatReducer(
      state,
      { type: "event", event: { type: "text_delta", generationId: "first", sequence: 1, text: "부분" } }
    );
    state = chatReducer(state, { type: "reveal", id: "first", characters: 2 });
    state = chatReducer(state, { type: "stop", id: "first" });
    expect(state.turns[0]).toMatchObject({ answer: "부분", status: "stopped" });
    expect(chatReducer(
      state,
      {
        type: "event",
        event: { type: "completed", generationId: "first", sequence: 2, model: "fixture", usage: null }
      }
    )).toEqual(state);
    expect(chatContext(state, "새 질문")).toEqual([{ role: "user", content: "새 질문" }]);
  });

  it("requires acceptance and consecutive sequence numbers and excludes corrupt or unfinished turns from context", () => {
    let state = chatReducer(initialChatState, { type: "start", id: "first", question: "질문" });

    state = chatReducer(
      state,
      {
        type: "event",
        event: { type: "text_delta", generationId: "first", sequence: 3, text: "invalid" }
      }
    );
    expect(state.turns[0]).toMatchObject({ answer: "", status: "error", error: "interrupted" });
    expect(chatContext(state, "다음")).toEqual([{ role: "user", content: "다음" }]);
  });

  it("passes only completed recent turns and clears all conversation data on revocation", () => {
    let state = initialChatState;

    for (let index = 0; index < 5; index++) {
      const id = String(index);

      state = chatReducer(state, { type: "start", id, question: `질문${index}` });
      state = chatReducer(state, { type: "event", event: { type: "accepted", generationId: id, sequence: 0 } });
      state = chatReducer(
        state,
        { type: "event", event: { type: "text_delta", generationId: id, sequence: 1, text: `답변${index}` } }
      );
      state = chatReducer(
        state,
        {
          type: "event",
          event: { type: "completed", generationId: id, sequence: 2, model: "fixture", usage: null }
        }
      );
    }

    expect(chatContext(state, "새 질문").map(message => message.content)).toEqual(["질문2", "답변2", "질문3", "답변3", "질문4", "답변4", "새 질문"]);
    expect(chatReducer(state, { type: "reset" })).toEqual(initialChatState);
  });
});
