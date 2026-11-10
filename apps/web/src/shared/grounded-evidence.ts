import { z } from "zod";
import { chatRequestSchema } from "./general-chat";

export const sourceSegmentSchema = z.string().min(1).max(255).refine(value => value === value.trim() && !/[\\/\u0000-\u001f<>:"|?*]/u.test(value) && ![".", "..", ".moa-history", ".moa-ai-v1"].includes(value.toLowerCase()) && !/[. ]$/u.test(value));
export const sourceHashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
export const sourceReferenceSchema = z.strictObject({
  path: z.array(sourceSegmentSchema).min(1).max(65).refine(path => /\.(md|txt|pdf|png|jpe?g)$/iu.test(path.at(-1) ?? "")),
  sha256: sourceHashSchema,
  size: z.number().int().min(0).max(2 * 1024 * 1024),
  quote: z.string().min(8).max(200),
});

export const groundedEvidenceSchema = z.strictObject({
  owner: chatRequestSchema.shape.owner,
  connectionId: z.string().min(1).max(128),
  citations: z.array(sourceReferenceSchema).max(40),
});
export type GroundedEvidence = z.infer<typeof groundedEvidenceSchema>;
export const sourceFileExpectationSchema = sourceReferenceSchema.extend({ owner: groundedEvidenceSchema.shape.owner, connectionId: groundedEvidenceSchema.shape.connectionId });
export type SourceFileExpectation = z.infer<typeof sourceFileExpectationSchema>;
