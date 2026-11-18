import { z } from "zod";
import { sampleAnswerSchema } from "./sample-answer";
import { organizationResponseSchema } from "./organization";

const usage = z.object({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative(), totalTokens: z.number().int().nonnegative() });
const questions = z.array(z.object({ id: z.string().max(200), documentId: z.string().max(64), kind: z.enum(["date", "destination"]), reason: z.string().max(240), dates: z.array(z.object({ id: z.string(), date: z.string(), label: z.string(), evidence: z.string() })).max(100) })).max(200);
const failure = z.object({ ok: z.literal(false), code: z.enum(["session", "origin", "input", "limit", "timeout", "unavailable"]), reason: z.enum(["configuration", "authorization", "capacity", "output-limit", "invalid-response", "invalid-json", "invalid-evidence", "invalid-date", "invalid-plan", "invalid-review", "upstream", "network"]).optional(), retryAfter: z.number().nonnegative().optional(), questions: questions.optional() });
const success = { ok: z.literal(true), model: z.string().min(1).max(200), usage };
export const sampleStreamResultSchema = z.union([failure, z.object({ ...success, answer: sampleAnswerSchema }), z.object({ ...success, organization: organizationResponseSchema, questions: questions.optional() })]);
export const sampleStreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("accepted"), requestId: z.uuid(), sequence: z.number().int().nonnegative() }),
  z.object({ type: z.literal("text"), requestId: z.uuid(), sequence: z.number().int().nonnegative(), text: z.string().max(8000) }),
  z.object({ type: z.literal("result"), requestId: z.uuid(), sequence: z.number().int().nonnegative(), result: sampleStreamResultSchema }),
]);
