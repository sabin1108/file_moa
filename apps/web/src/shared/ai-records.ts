import { z } from "zod";
import { isRecordId } from "@personal-ai/domain";
import { chatErrorCodes } from "./general-chat";
import { groundedEvidenceSchema } from "./grounded-evidence";

const id = z.string().refine(isRecordId, "invalid-record-id");
const date = z.iso.datetime({ precision: 3 });
const usage = z.strictObject({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative(), totalTokens: z.number().int().nonnegative() });
export const conversationKinds = ["chat", "find", "organize", "grounded"] as const;
export type ConversationKind = typeof conversationKinds[number];

export const savedTurnSchema = z.strictObject({
  kind: z.enum(conversationKinds).optional(),
  id: z.string().min(1).max(80), question: z.string().min(1).max(800),
  answer: z.string().max(8000), visibleLength: z.number().int().nonnegative(),
  status: z.enum(["pending", "completed", "stopped", "error"]),
  evidence: groundedEvidenceSchema.optional(),
  error: z.enum(chatErrorCodes).optional(), model: z.string().min(1).max(200).optional(), usage: usage.nullable().optional(),
}).refine(turn => turn.visibleLength <= turn.answer.length, "invalid-visible-length")
  .refine(turn => !turn.evidence || (turn.kind === "grounded" && turn.status === "completed"), "invalid-evidence-turn");

const base = { id, title: z.string().trim().min(1).max(120), updatedAt: date };
export const conversationPayloadSchema = z.strictObject({
  ...base, type: z.literal("conversation"), draft: z.string().max(800),
  projectId: id.nullable(), turns: z.array(savedTurnSchema).max(500),
});
export const artifactPayloadSchema = z.strictObject({
  ...base, type: z.literal("artifact"), markdown: z.string().max(500_000),
  sourceConversationId: id.nullable(), status: z.enum(["draft", "final"]),
});
export const memoryPayloadSchema = z.strictObject({
  ...base, type: z.literal("memory"), content: z.string().trim().min(1).max(4000),
  sourceConversationId: id.nullable(), status: z.enum(["proposed", "approved", "inactive"]),
  scope: z.discriminatedUnion("type", [z.strictObject({ type: z.literal("global") }), z.strictObject({ type: z.literal("project"), id })]),
});
export const profilePayloadSchema = z.strictObject({
  ...base, type: z.literal("profile"), displayName: z.string().trim().max(100),
  description: z.string().max(4000), preferences: z.string().max(4000),
});
export const aiRecordPayloadSchema = z.union([conversationPayloadSchema, artifactPayloadSchema, memoryPayloadSchema, profilePayloadSchema]);
export type AiRecordPayload = z.infer<typeof aiRecordPayloadSchema>;
export type ConversationPayload = z.infer<typeof conversationPayloadSchema>;
export type ArtifactPayload = z.infer<typeof artifactPayloadSchema>;
export type MemoryPayload = z.infer<typeof memoryPayloadSchema>;
export type ProfilePayload = z.infer<typeof profilePayloadSchema>;

export function restoreConversation(input: unknown) {
  const payload = conversationPayloadSchema.parse(input);
  return {
    ...payload, active: null, sequence: -1,
    turns: payload.turns.map(turn => turn.status === "pending"
      ? { ...turn, answer: turn.answer.slice(0, turn.visibleLength), status: "stopped" as const }
      : turn),
  };
}
