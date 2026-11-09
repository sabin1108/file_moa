import { describe, expect, it } from "vitest";
import { aiRecordPayloadSchema, restoreConversation } from "../../src/shared/ai-records";

const snapshot = () => ({
  type: "conversation", id: "chat-a", title: "첫 질문", draft: "작성 중",
  updatedAt: "2026-11-09T03:00:00.000Z", projectId: null,
  turns: [{ id: "generation-a", question: "질문", answer: "부분 답변", visibleLength: 2, status: "pending" }],
});

describe("local AI record payload boundary", () => {
  it("restores partial generations without restarting a request or exposing hidden text", () => {
    const restored = restoreConversation(snapshot());
    expect(restored.turns[0]).toMatchObject({ answer: "부분", visibleLength: 2, status: "stopped" });
    expect(restored.draft).toBe("작성 중");
    expect(restored.active).toBeNull();
  });

  it("rejects injected secret fields, unsafe IDs and inconsistent display lengths", () => {
    expect(aiRecordPayloadSchema.safeParse({ ...snapshot(), token: "private-token" }).success).toBe(false);
    expect(aiRecordPayloadSchema.safeParse({ ...snapshot(), id: "../escape" }).success).toBe(false);
    const invalid = snapshot();
    invalid.turns[0].visibleLength = 100;
    expect(aiRecordPayloadSchema.safeParse(invalid).success).toBe(false);
  });

  it("preserves source ownership and explicit memory approval rather than inferring it", () => {
    const memory = { type: "memory", id: "memory-a", title: "문체", content: "간결하게 작성", scope: { type: "global" }, status: "proposed", sourceConversationId: "chat-a", updatedAt: snapshot().updatedAt };
    expect(aiRecordPayloadSchema.parse(memory)).toEqual(memory);
    expect(aiRecordPayloadSchema.safeParse({ ...memory, status: "guessed" }).success).toBe(false);
    expect(aiRecordPayloadSchema.safeParse({ ...memory, scope: { type: "task", id: "task-a" } }).success).toBe(false);
  });
});
