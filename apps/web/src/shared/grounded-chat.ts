import { z } from "zod";
import { chatRequestSchema } from "./general-chat";
import { groundedEvidenceSchema, sourceSegmentSchema as segment, sourceHashSchema as hash, type GroundedEvidence } from "./grounded-evidence";

export const groundedRequestSchema = z.strictObject({
  requestId: chatRequestSchema.shape.requestId,
  owner: chatRequestSchema.shape.owner,
  consent: z.literal(true),
  question: z.string().trim().min(1).max(800),
  documents: z.array(z.strictObject({
    id: z.string().regex(/^document-[1-9]\d{0,2}$/u),
    name: segment.refine(value => /\.(md|txt|pdf)$/iu.test(value)),
    path: z.array(segment).min(1).max(65), excerpt: z.string().min(1).max(1200),
    excerptHash: hash, sha256: hash, size: z.number().int().min(0).max(2 * 1024 * 1024),
    lastModified: z.number().int().nonnegative(),
  })).min(1).max(40),
}).refine(input => input.documents.reduce((sum, document) => sum + document.excerpt.length, 0) <= 6000 && new Set(input.documents.map(document => document.id)).size === input.documents.length && new Set(input.documents.map(document => JSON.stringify(document.path))).size === input.documents.length && input.documents.every(document => document.name === document.path.at(-1)));
export const groundedAnswerSchema = z.strictObject({
  answer: z.string().trim().min(1).max(8000),
  citations: z.array(z.strictObject({ documentId: z.string(), quote: z.string().min(8).max(200) })).max(40),
});
export type GroundedAnswer = z.infer<typeof groundedAnswerSchema>;
export type GroundedRequest = z.infer<typeof groundedRequestSchema>;
export type GroundedResult = { ok: true; answer: GroundedAnswer; model: string } | { ok: false; code: "session" | "origin" | "input" | "limit" | "timeout" | "unavailable" };
export type GroundedAction = (input: unknown) => Promise<GroundedResult>;

export function validateGroundedAnswer(value: unknown, documents: GroundedRequest["documents"]): GroundedAnswer {
  const result = groundedAnswerSchema.parse(value);
  for (const citation of result.citations) {
    const document = documents.find(item => item.id === citation.documentId);
    if (!document || !document.excerpt.includes(citation.quote)) throw new Error("invalid-citation");
  }
  return result;
}

export function createGroundedEvidence(owner: GroundedRequest["owner"], connectionId: string, documents: GroundedRequest["documents"], answer: GroundedAnswer): GroundedEvidence {
  const validated = validateGroundedAnswer(answer, documents);
  return groundedEvidenceSchema.parse({ owner, connectionId, citations: validated.citations.map(citation => {
    const document = documents.find(item => item.id === citation.documentId)!;
    return { path: document.path, sha256: document.sha256, size: document.size, quote: citation.quote };
  }) });
}
