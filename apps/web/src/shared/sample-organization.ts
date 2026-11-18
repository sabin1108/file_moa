import { z } from "zod";
import type { SampleAiResult, SampleAiUsage } from "./sample-ai";
import { reviewAnswerSchema, type ReviewQuestion } from "./live-organization-review";
import type { OrganizationResponse } from "./organization";
import type { SampleMaterial } from "./sample-materials";

export const SAMPLE_ORGANIZATION_LIMITS = { documents: 100, excerptCharacters: 50_000 } as const;
const path = z.array(z.string().trim().min(1).max(120).refine(value => !/[\\/\u0000-\u001f<>:"|?*]/u.test(value) && ![".", "..", ".moa-history"].includes(value.toLowerCase()))).max(20);
export const sampleOrganizationContextSchema = z.strictObject({
  reference: path.nullable(),
  destination: path.nullable(),
  answers: z.array(reviewAnswerSchema).max(SAMPLE_ORGANIZATION_LIMITS.documents).default([]),
});
export type SampleOrganizationContext = z.infer<typeof sampleOrganizationContextSchema>;

export type SampleOrganizationResult =
  | Readonly<{
    ok: true;
    organization: OrganizationResponse;
    usage: SampleAiUsage;
    model: string;
    questions?: readonly ReviewQuestion[]
  }>
  | (Extract<SampleAiResult, { ok: false }> & Readonly<{ questions?: readonly ReviewQuestion[] }>);

export type SampleOrganizationAction = (input: {
  requestId: string;
  documentIds: string[];
  instruction: string;
  consent: true;
  context?: SampleOrganizationContext;
  documents?: SampleMaterial[];
}) => Promise<SampleOrganizationResult>;
