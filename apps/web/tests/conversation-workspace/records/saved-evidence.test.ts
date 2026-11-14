import { expect, it } from "vitest";
import { savedTurnSchema, restoreConversation } from "../../../src/shared/ai-records";
import { createGroundedEvidence } from "../../../src/shared/grounded-chat";
import { chatContext, chatReducer, initialChatState } from "../../../src/features/conversation-workspace/messaging/general-chat-state";

const owner = { userId: "A", workspaceId: "A" };
const document = {
  id: "document-1",
  name: "note.md",
  path: ["note.md"],
  sha256: "a".repeat(64),
  size: 80,
  lastModified: 1,
  excerptHash: "b".repeat(64),
  excerpt: "Only this quoted text is a citation. Private extra source."
};
const answer = { answer: "합성 답변", citations: [{ documentId: document.id, quote: "Only this quoted text" }] };
const turn = {
  id: "turn-1",
  kind: "grounded" as const,
  question: "자료 설명",
  answer: answer.answer,
  visibleLength: answer.answer.length,
  status: "completed" as const
};

it("persists only a bound file reference and quoted text, never the original excerpt", () => {
  const evidence = createGroundedEvidence(owner, "source-1", [document], answer);
  const parsed = savedTurnSchema.parse({ ...turn, evidence });

  expect(parsed.evidence).toEqual({
    owner,
    connectionId: "source-1",
    citations: [{ path: ["note.md"], sha256: document.sha256, size: 80, quote: answer.citations[0].quote }]
  });
  expect(JSON.stringify(parsed)).not.toContain("Private extra source");
  expect(() => createGroundedEvidence(
    owner,
    "source-1",
    [document],
    { ...answer, citations: [{ documentId: "missing", quote: answer.citations[0].quote }] }
  )).toThrow();
});

it("rejects unsafe paths, arbitrary properties, and evidence on incomplete/general turns", () => {
  const evidence = createGroundedEvidence(owner, "source-1", [document], answer);

  for (const path of [["..", "note.md"], [".moa-ai-v1", "note.md"], ["a/b.md"], ["a.exe"]]) {
    expect(savedTurnSchema.safeParse({ ...turn, evidence: { ...evidence, citations: [{ ...evidence.citations[0], path }] } }).success).toBe(false);
  }

  expect(savedTurnSchema.safeParse({ ...turn, kind: "chat", evidence }).success).toBe(false);
  expect(savedTurnSchema.safeParse({ ...turn, status: "stopped", evidence }).success).toBe(false);
  expect(savedTurnSchema.safeParse({ ...turn, evidence: { ...evidence, excerpt: document.excerpt } }).success).toBe(false);
});

it("restores legacy turns and preserves new evidence without sending it to ordinary chat", () => {
  const evidence = createGroundedEvidence(owner, "source-1", [document], answer);
  let state = chatReducer(
    initialChatState,
    {
      type: "local",
      id: turn.id,
      kind: "grounded",
      question: turn.question,
      answer: "기다림",
      status: "pending"
    }
  );

  state = chatReducer(
    state,
    { type: "local-update", id: turn.id, answer: turn.answer, status: "completed", evidence }
  );

  const restored = restoreConversation({
    type: "conversation",
    id: "conversation-a",
    title: "기록",
    updatedAt: "2026-11-09T03:00:00.000Z",
    projectId: null,
    draft: "",
    turns: state.turns
  });

  expect(restored.turns[0].evidence).toEqual(evidence);
  expect(chatContext(state, "일반 질문")).toEqual([{ role: "user", content: "일반 질문" }]);
  expect(savedTurnSchema.parse(turn).evidence).toBeUndefined();
});
