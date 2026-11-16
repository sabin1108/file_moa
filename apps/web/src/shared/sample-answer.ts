import { z } from "zod";
import { chatRequestSchema } from "./general-chat";
import { groundedAnswerSchema, type GroundedAnswer } from "./grounded-chat";
import type { SampleAiResult, SampleAiUsage } from "./sample-ai";

export const SAMPLE_ANSWER_LIMITS = { documents: 40, excerptCharacters: 6000, citations: 5 } as const;
export const sampleAnswerSchema = groundedAnswerSchema.extend({ citations: groundedAnswerSchema.shape.citations.max(SAMPLE_ANSWER_LIMITS.citations) });
export const sampleAnswerRequestSchema = z.strictObject({
  requestId: z.uuid(),
  mode: z.enum(["chat", "grounded"]),
  messages: chatRequestSchema.shape.messages,
  documentIds: z.array(z.string().min(1).max(64)).max(SAMPLE_ANSWER_LIMITS.documents),
  consent: z.literal(true),
}).refine(value => new Set(value.documentIds).size === value.documentIds.length
  && (value.mode === "chat" ? value.documentIds.length === 0 : value.documentIds.length > 0));

export type SampleAnswerRequest = z.infer<typeof sampleAnswerRequestSchema>;
export type SampleAnswerResult = { ok: true; answer: GroundedAnswer; model: string; usage: SampleAiUsage }
  | Extract<SampleAiResult, { ok: false }>;
export type SampleAnswerAction = (input: SampleAnswerRequest) => Promise<SampleAnswerResult>;
