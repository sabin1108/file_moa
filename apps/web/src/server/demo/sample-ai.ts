import "server-only";
import { z } from "zod";
import { parseClassificationRequest, parseClassificationResponse } from "../../shared/ai-classification";
import type { SampleAiResult } from "../../shared/sample-ai";
import { readSampleSession } from "./sample-session";
import { getSampleCatalog } from "./sample-catalog";
import { createAuthRateLimiter } from "../auth/auth-rate-limit";
import { getDatabase } from "../database/client";
import { generateClassification } from "../ai/ai-generation";
import { AI_LIMITS, requireSampleAiProvider, SampleAiError } from "../ai/ai-provider";
import type { AiProvider } from "../../shared/ai-provider";
import { readDemoVisitor } from "./demo-access";
import { dailyAiRules } from "../ai/ai-quota";

const inputSchema = z.strictObject({
  requestId: z.uuid(),
  documentIds: z.array(z.string().min(1).max(64)).min(1).max(10),
  consent: z.literal(true),
});
let quota: ReturnType<typeof createAuthRateLimiter> | undefined;

export type SampleAiContext = {
  token: string | undefined;
  visitorToken?: string;
  origin: string | null
};

export function requireSampleContext(context: SampleAiContext) {
  const session = readSampleSession(context.token);
  const visitor = readDemoVisitor(context.visitorToken);
  if (!session || !visitor) throw new SampleAiError("session");
  if (context.origin !== new URL(process.env.BETTER_AUTH_URL ?? "").origin) throw new SampleAiError("origin");
  return { session, visitor };
}

export async function reserveSampleAi(requestId: string, context: SampleAiContext, expectedProvider?: AiProvider | null, timeoutMs: number = AI_LIMITS.timeoutMs) {
  const { session, visitor } = requireSampleContext(context);
  const provider = requireSampleAiProvider(expectedProvider);

  quota ??= createAuthRateLimiter(getDatabase, process.env.BETTER_AUTH_SECRET!);

  const reservation = await quota.consumeAll([
    { key: `sample-ai-v1:request:${session.id}:${requestId}`, max: 1, window: 3600 },
    ...dailyAiRules("demo", visitor.id, Date.now()),
  ]);

  if (!reservation.allowed) return { allowed: false as const, retryAfter: reservation.retryAfter ?? 60 };

  requireSampleContext(context);

  return {
    allowed: true as const,
    provider,
    signal: AbortSignal.timeout(Math.max(1, Math.min(timeoutMs, 120_000, session.expiresAt - Date.now())))
  };
}

export function sampleAiFailure(error: unknown): Extract<SampleAiResult, { ok: false }> {
  if (error instanceof SampleAiError) return { ok: false, code: error.code, ...(error.reason ? { reason: error.reason } : {}) };
  if (error instanceof z.ZodError) return { ok: false, code: "unavailable", reason: "invalid-response" };
  if (error instanceof Error && error.message === "invalid-citation") return { ok: false, code: "unavailable", reason: "invalid-evidence" };

  if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) return { ok: false, code: "timeout" };

  return { ok: false, code: "unavailable" };
}

export async function classifySample(value: unknown, context: SampleAiContext, expectedProvider?: AiProvider | null): Promise<SampleAiResult> {
  try {
    requireSampleContext(context);
    const session = readSampleSession(context.token);

    if (!session) return { ok: false, code: "session" };

    const trustedOrigin = new URL(process.env.BETTER_AUTH_URL ?? "").origin;

    if (context.origin !== trustedOrigin) return { ok: false, code: "origin" };

    const parsed = inputSchema.safeParse(value);

    if (!parsed.success) return { ok: false, code: "input" };

    const input = parsed.data;
    const catalog = getSampleCatalog();

    if (new Set(input.documentIds).size !== input.documentIds.length
      || input.documentIds.some(id => !catalog.documents.some(document => document.id === id))) return { ok: false, code: "input" };

    const request = parseClassificationRequest({
      documents: input.documentIds.map(id => {
        const { name, excerpt } = catalog.documents.find(document => document.id === id)!;

        return { id, name, excerpt };
      }),
      folders: catalog.folders,
    }, { mode: "sample", documents: catalog.documents, folders: catalog.folders });

    requireSampleAiProvider(expectedProvider);

    // Reservations are never refunded: a canceled/failed request may already have reached the provider.

    const reservation = await reserveSampleAi(input.requestId, context, expectedProvider);

    if (!reservation.allowed) return { ok: false, code: "limit", retryAfter: reservation.retryAfter ?? 60 };

    requireSampleContext(context);

    const result = await generateClassification(request, reservation.signal, reservation.provider);

    requireSampleContext(context);

    return { ok: true, ...result, ...parseClassificationResponse({ proposals: result.proposals }, request) };
  } catch (error) {
    return sampleAiFailure(error);
  }
}
