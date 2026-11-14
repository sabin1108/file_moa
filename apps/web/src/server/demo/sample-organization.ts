import "server-only";
import { z } from "zod";
import { generateOrganization } from "../organization/organization-generation";
import { getSampleCatalog } from "./sample-catalog";
import { readSampleSession } from "./sample-session";
import { reserveSampleAi, sampleAiFailure, type SampleAiContext } from "./sample-ai";
import { SampleAiError } from "../ai/ai-provider";
import type { AiProvider } from "../../shared/ai-provider";
import { parseOrganizationResponse, type OrganizationRequest } from "../../shared/organization";
import type { SampleOrganizationResult } from "../../shared/sample-organization";

const inputSchema = z.strictObject({
  requestId: z.uuid(),
  documentIds: z.array(z.string().min(1).max(64)).min(1).max(40),
  instruction: z.string().trim().min(2).max(800),
  consent: z.literal(true)
});

export async function organizeSample(value: unknown, context: SampleAiContext, expectedProvider?: AiProvider | null): Promise<SampleOrganizationResult> {
  try {
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
    const reservation = await reserveSampleAi(input.requestId, context, expectedProvider);

    if (!reservation.allowed) return { ok: false, code: "limit", retryAfter: reservation.retryAfter };

    const result = await generateOrganization(request, reservation.signal, reservation.provider);

    if (!readSampleSession(context.token)) throw new SampleAiError("session");

    return {
      ok: true,
      organization: parseOrganizationResponse(result.value, request),
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
