import "server-only";
import { z } from "zod";
import { generateLiveOrganizationBatches } from "../organization/live-organization-batches";
import { getSampleCatalog } from "./sample-catalog";
import { readSampleSession } from "./sample-session";
import { reserveSampleAi, sampleAiFailure, requireSampleContext, type SampleAiContext } from "./sample-ai";
import { SampleAiError } from "../ai/ai-provider";
import type { AiProvider } from "../../shared/ai-provider";
import type { OrganizationRequest } from "../../shared/organization";
import { validateReviewAnswers } from "../../shared/live-organization-review";
import { SAMPLE_ORGANIZATION_LIMITS, sampleOrganizationContextSchema, type SampleOrganizationResult } from "../../shared/sample-organization";
import { LIVE_ORGANIZATION_LIMITS } from "../../shared/live-organization-limits";

const inputSchema = z.strictObject({
  requestId: z.uuid(),
  documentIds: z.array(z.string().min(1).max(64)).min(1).max(SAMPLE_ORGANIZATION_LIMITS.documents),
  instruction: z.string().trim().min(2).max(800),
  consent: z.literal(true),
  context: sampleOrganizationContextSchema.optional(),
});

export async function organizeSample(value: unknown, context: SampleAiContext, expectedProvider?: AiProvider | null): Promise<SampleOrganizationResult> {
  try {
    requireSampleContext(context);
    if (!readSampleSession(context.token)) return { ok: false, code: "session" };

    if (context.origin !== new URL(process.env.BETTER_AUTH_URL ?? "").origin) return { ok: false, code: "origin" };

    const parsed = inputSchema.safeParse(value);

    if (!parsed.success) return { ok: false, code: "input" };

    const input = parsed.data;
    const catalog = getSampleCatalog();

    if (
      new Set(input.documentIds).size !== input.documentIds.length
      ||
      input.documentIds.some(id => !catalog.documents.some(document => document.id === id))
    )
      return { ok: false, code: "input" };

    const request: OrganizationRequest = {
      instruction: input.instruction,
      documents: input.documentIds.map(id => {
        const document = catalog.documents.find(document => document.id === id)!;
        const source = catalog.folders.find(folder => folder.id === document.sourceFolderId)?.label;

        return { id, name: document.name, excerpt: document.excerpt, sourcePath: source?.split("/") ?? ["받은 자료"] };
      })
    };
    if (request.documents.reduce((sum, document) => sum + document.excerpt.length, 0) > SAMPLE_ORGANIZATION_LIMITS.excerptCharacters) return { ok: false, code: "input" };
    let answers;
    try { answers = validateReviewAnswers(input.context?.answers ?? [], request.documents); }
    catch { return { ok: false, code: "input", reason: "invalid-review" }; }
    const prepared: OrganizationRequest = { ...request, context: {
      reference: input.context?.reference ?? null,
      destination: input.context?.destination ?? null,
      answers,
      liveReview: true,
    } };
    const reservation = await reserveSampleAi(input.requestId, context, expectedProvider, LIVE_ORGANIZATION_LIMITS.timeoutMs);

    if (!reservation.allowed) return { ok: false, code: "limit", retryAfter: reservation.retryAfter };

    let result: Awaited<ReturnType<typeof generateLiveOrganizationBatches>>;
    try {
      result = await generateLiveOrganizationBatches(prepared, answers, reservation.signal, reservation.provider,
        async () => { requireSampleContext(context); }, () => {}, "demo");
    } catch (error) {
      requireSampleContext(context);
      const failure = sampleAiFailure(error);
      if (failure.reason && ["invalid-json", "invalid-response", "invalid-plan"].includes(failure.reason)) {
        return { ...failure, questions: request.documents
          .filter(document => !answers.some(answer => answer.documentId === document.id && answer.exclude))
          .map(document => ({ id: `${document.id}:destination`, documentId: document.id, kind: "destination" as const, dates: [],
            reason: "AI 제안을 읽지 못해 분류를 아직 정하지 않았어요. 원문을 확인하고 목적지를 지정하거나 분류 기준을 바꿔 주세요." })) };
      }
      throw error;
    }

    requireSampleContext(context);

    return {
      ok: true,
      organization: result.organization,
      questions: result.questions,
      model: result.model,
      usage: result.usage
    };
  } catch (error) {
    const known = [
      "reserved-organization-root",
      "mismatched-organization-date-folder",
      "unconfirmed-organization-date",
      "ungrounded-organization-evidence",
      "invalid-organization-document",
    ];

    console.error("Sample organization failed.", {
      code: error instanceof SampleAiError
        ? error.code
        : error instanceof z.ZodError
          ? "INVALID_RESPONSE_SCHEMA"
          : error instanceof Error && known.includes(error.message) ? error.message : "UNAVAILABLE"
    });

    return sampleAiFailure(error);
  }
}
