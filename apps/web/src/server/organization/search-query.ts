import "server-only";
import { liveAiRules } from "../ai/ai-quota";
import { buildSearchQueryRequest } from "./search-query-request";
import { searchQueryRequestSchema, compileSearchQuerySuggestion, type SearchQueryResult } from "../../shared/search-query";
import type { AiProvider } from "../../shared/ai-provider";
import type { SampleAiUsage } from "../../shared/sample-ai";
import { readChatSession, revalidateChatStream } from "../chat/chat-session";
import { createAuthRateLimiter } from "../auth/auth-rate-limit";
import { getDatabase } from "../database/client";
import { generateAiJson } from "../ai/ai-generation";
import { AI_LIMITS, requireAiProvider, SampleAiError } from "../ai/ai-provider";
import { startUsage, finishUsage } from "../ai/ai-usage";

let quota: ReturnType<typeof createAuthRateLimiter> | undefined;

export async function interpretSearchQuery(value: unknown, requestHeaders: Headers, expectedProvider: AiProvider | null): Promise<SearchQueryResult> {
  let tracked: { session: NonNullable<Awaited<ReturnType<typeof readChatSession>>>; requestId: string; model: string | null; usage: SampleAiUsage | null } | null = null;

  try {
    if (process.env.ENABLE_REMOTE_QUERY_PLAN !== "true") return { ok: false, code: "unavailable" };
    if (requestHeaders.get("origin") !== new URL(process.env.BETTER_AUTH_URL ?? "").origin) return { ok: false, code: "origin" };

    const session = await readChatSession(requestHeaders);

    if (!session) return { ok: false, code: "session" };

    const parsed = searchQueryRequestSchema.safeParse(value);

    if (!parsed.success || Buffer.byteLength(JSON.stringify(value), "utf8") > 8192) return { ok: false, code: "input" };

    const input = parsed.data;

    if (input.owner.userId !== session.userId || input.owner.workspaceId !== session.workspaceId) return { ok: false, code: "session" };

    const provider = requireAiProvider(expectedProvider);

    quota ??= createAuthRateLimiter(getDatabase, process.env.BETTER_AUTH_SECRET!);

    const reserved = await quota.consumeAll(liveAiRules(session, input.requestId, Date.now()));

    if (!reserved.allowed) return { ok: false, code: "limit", retryAfter: reserved.retryAfter ?? 60 };

    await startUsage(session, input.requestId, provider, "query");
    tracked = { session, requestId: input.requestId, model: null, usage: null };

    if (!await revalidateChatStream(session)) return { ok: false, code: "session" };

    const duration = Math.min(AI_LIMITS.timeoutMs, session.expiresAt - Date.now());

    if (duration <= 0) return { ok: false, code: "session" };

    const generated = await generateAiJson(buildSearchQueryRequest(input.question), AbortSignal.timeout(duration), AI_LIMITS, provider);

    tracked.model = generated.model;
    tracked.usage = generated.usage;

    if (!await revalidateChatStream(session)) return { ok: false, code: "session" };

    return { ok: true, question: input.question, suggestion: compileSearchQuerySuggestion(generated.value, input.question), model: generated.model };
  } catch (error) {
    return { ok: false, code: error instanceof SampleAiError ? error.code : error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? "timeout" : "unavailable" };
  } finally {
    if (tracked) await finishUsage(tracked.session, tracked.requestId, tracked.model, tracked.usage).catch(() => { console.error("AI usage settlement unavailable."); });
  }
}
