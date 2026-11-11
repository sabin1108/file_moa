import "server-only";
import {
  chatRequestSchema,
  ChatError,
  CHAT_LIMITS,
  type ChatErrorCode,
  type ChatEvent,
  type ChatGenerationEvent
} from "../shared/general-chat";
import { AI_LIMITS, requireAiProvider, SampleAiError } from "./ai-provider";
import { createAuthRateLimiter } from "./auth-rate-limit";
import { getDatabase } from "./database/client";
import { readChatSession, revalidateChatStream } from "./chat-session";
import { generateChat } from "./chat-generation";
import type { SampleAiUsage } from "../shared/sample-ai";
import { startUsage, finishUsage } from "./ai-usage";

let quota: ReturnType<typeof createAuthRateLimiter> | undefined;

function errorCode(error: unknown): ChatErrorCode {
  if (error instanceof ChatError || error instanceof SampleAiError) return error.code;

  if (error instanceof Error && error.name === "TimeoutError") return "timeout";

  return "unavailable";
}

function failure(code: ChatErrorCode, retryAfter?: number) {
  const status = code === "input" ? 400 : code === "origin" ? 403 : code === "session" ? 401 : code === "limit" ? 429 : 503;

  return Response.json({ code, ...(retryAfter ? { retryAfter } : {}) }, {
    status,
    headers: { "cache-control": "no-store", ...(retryAfter ? { "retry-after": String(retryAfter) } : {}) },
  });
}

async function readInput(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json" || !request.body) throw new ChatError("input");

  const reader = request.body.getReader();
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]);
  const abort = () => {
    void reader.cancel().catch(() => undefined);
  };

  signal.addEventListener("abort", abort, { once: true });

  let bytes = 0;
  const chunks: Uint8Array[] = [];

  try {
    while (true) {
      signal.throwIfAborted();

      const { value, done } = await reader.read();

      signal.throwIfAborted();

      if (done) break;

      bytes += value.byteLength;

      if (bytes > CHAT_LIMITS.requestBytes) throw new ChatError("input");

      chunks.push(value);
    }

    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))) as unknown;
  } catch (error) {
    if (signal.aborted) throw signal.reason;

    throw error instanceof ChatError ? error : new ChatError("input");
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function handleChat(request: Request, waitUntil?: (work: Promise<void>) => void): Promise<Response> {
  const requestStarted = performance.now();
  const deadline = Date.now() + 45_000;

  try {
    request.signal.throwIfAborted();

    if (request.headers.get("origin") !== new URL(process.env.BETTER_AUTH_URL ?? "").origin) return failure("origin");

    const sessionStarted = performance.now();
    const session = await readChatSession(request.headers);
    const sessionMs = Math.round(performance.now() - sessionStarted);

    if (!session || session.expiresAt <= Date.now()) return failure("session");

    const parsed = chatRequestSchema.safeParse(await readInput(request));

    if (!parsed.success) return failure("input");

    const input = parsed.data;

    if (input.owner.userId !== session.userId || input.owner.workspaceId !== session.workspaceId) return failure("session");

    if (Date.now() >= deadline) return failure("timeout");

    const provider = requireAiProvider(input.provider);

    quota ??= createAuthRateLimiter(getDatabase, process.env.BETTER_AUTH_SECRET!);

    const quotaStarted = performance.now();
    const reserved = await quota.consumeAll([
      { key: `live-ai-v1:request:${session.workspaceId}:${input.requestId}`, max: 1, window: 3600 },
      { key: `live-ai-v1:workspace:${session.workspaceId}`, max: 10, window: 3600 },
      { key: `live-ai-v1:user:${session.sessionUserId}`, max: 10, window: 3600 },
      { key: "sample-ai-v1:global-minute", max: 1, window: 60 },
      { key: "sample-ai-v1:global-hour", max: 12, window: 3600 },
    ]);
    const quotaMs = Math.round(performance.now() - quotaStarted);

    if (!reserved.allowed) return failure("limit", reserved.retryAfter ?? 60);

    const timeout = Math.min(AI_LIMITS.timeoutMs, session.expiresAt - Date.now(), deadline - Date.now());

    if (timeout <= 0) return failure(session.expiresAt <= Date.now() ? "session" : "timeout");

    const usageReady = startUsage(session, input.requestId, provider, "chat");
    const cancellation = new AbortController();
    const signal = AbortSignal.any([request.signal, cancellation.signal, AbortSignal.timeout(timeout)]);
    const providerCancellation = new AbortController();
    const providerSignal = AbortSignal.any([signal, providerCancellation.signal]);
    let authorizationMs = 0;
    let authorizationChecks = 0;
    const assertSession = async () => {
      signal.throwIfAborted();

      const checkStarted = performance.now();
      let allowed: boolean;

      try {
        allowed = await revalidateChatStream(session);
      }
      finally {
        authorizationChecks++;
        authorizationMs += performance.now() - checkStarted;
      }

      if (!allowed) throw new ChatError("session");

      signal.throwIfAborted();
    };
    const started = performance.now();
    let closed = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const work = (async () => {
          let sequence = 0;
          let length = 0;
          let buffered = "";
          let lastPublish = performance.now();
          let usage: SampleAiUsage | null = null;
          let model: string | null = null;
          let outcome: ChatErrorCode | "success" = "unavailable";
          let publication: Promise<void> | null = null;
          let publicationError: unknown;
          let completion: Extract<ChatGenerationEvent, { type: "completed" }> | null = null;
          let sourceFinished = false;
          let completed = false;
          let firstProviderTextMs: number | null = null;
          let firstPublishedMs: number | null = null;
          let publicationBatches = 0;
          let maxPublicationGapMs = 0;
          let maxBatchCharacters = 0;
          const send = (value: Omit<ChatEvent, "generationId" | "sequence">) => {
            if (closed || request.signal.aborted || cancellation.signal.aborted) return;

            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ ...value, generationId: input.requestId, sequence: sequence++ })}\n\n`));
          };
          const publishText = (text: string) => {
            if (!text) return;

            if (publicationBatches++) maxPublicationGapMs = Math.max(maxPublicationGapMs, Math.round(performance.now() - lastPublish));

            maxBatchCharacters = Math.max(maxBatchCharacters, text.length);
            firstPublishedMs ??= Math.round(performance.now() - requestStarted);
            send({ type: "text_delta", text } as ChatEvent);
            lastPublish = performance.now();
          };
          const flush = async () => {
            if (!buffered && !(sourceFinished && completion)) return;

            const pending = buffered;
            const terminal = sourceFinished ? completion : null;

            buffered = "";
            await assertSession();
            publishText(pending);

            if (terminal && !completed) {
              send({ type: "completed", model: terminal.model, usage: terminal.usage } as ChatEvent);
              completed = true;
              outcome = "success";
            }
          };
          const startPublication = () => {
            if (publication) return;
            // Read the provider independently; one fresh authorization gates the accumulated batch.

            publication = (async () => {
              while (buffered && !completed) {
                const wait = 100 - (performance.now() - lastPublish);

                if (wait > 0 && !sourceFinished) await new Promise(resolve => setTimeout(resolve, wait));

                await flush();

                if (sourceFinished) break;
              }
            })().catch(error => {
              publicationError = error;
              providerCancellation.abort(error);
            }).finally(() => {
              publication = null;
            });
          };

          try {
            send({ type: "accepted" });
            await Promise.all([assertSession(), usageReady]);
            signal.throwIfAborted();

            for await (const event of generateChat(input.messages, provider, providerSignal, assertSession, input.personalContext)) {
              signal.throwIfAborted();

              if (publicationError) throw publicationError;

              if (completion) throw new ChatError("unavailable");

              if (event.type === "text") {
                if (firstProviderTextMs === null) lastPublish = performance.now();

                firstProviderTextMs ??= Math.round(performance.now() - requestStarted);
                length += event.text.length;

                if (length > CHAT_LIMITS.answerCharacters) throw new ChatError("unavailable");

                buffered += event.text;
                // Publish batches rather than performing an authentication/DB lookup for every token.
                startPublication();
              } else {
                usage = event.usage;
                model = event.model;

                if (!length) throw new ChatError("unavailable");

                completion = event;
              }
            }

            if (!completion) throw new ChatError("interrupted");

            sourceFinished = true;
            await publication;

            if (publicationError) throw publicationError;

            if (!completed) await flush();

            if (!completed) throw new ChatError("interrupted");
          } catch (error) {
            await publication;
            sourceFinished = false;
            completion = null;
            outcome = errorCode(publicationError ?? error);

            if (buffered && !publicationError && !signal.aborted && outcome !== "session") {
              try {
                await flush();
              } catch (publishError) {
                outcome = errorCode(publishError);
              }
            }

            send({ type: "error", code: outcome } as ChatEvent);
          } finally {
            if (!closed) {
              closed = true;
              controller.close();
            }

            cancellation.abort();

            try {
              await usageReady;
              await finishUsage(session, input.requestId, model, usage);
            }
            catch {
              console.error("AI usage settlement unavailable.");
            }

            console.info(
              "Chat generation.",
              {
                provider,
                outcome,
                elapsedMs: Math.round(performance.now() - started),
                preflightMs: Math.round(started - requestStarted),
                sessionMs,
                quotaMs,
                firstProviderTextMs,
                firstPublishedMs,
                publicationBatches,
                maxPublicationGapMs,
                maxBatchCharacters,
                authorizationChecks,
                authorizationMs: Math.round(authorizationMs),
                ...(usage ?? {})
              }
            );
          }
        })();

        waitUntil?.(work);

        return work;
      },
      cancel() {
        closed = true;
        cancellation.abort();
      },
    });

    return new Response(body, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store, no-transform",
        "x-accel-buffering": "no",
        "x-content-type-options": "nosniff"
      },
    });
  } catch (error) {
    return failure(errorCode(error));
  }
}
