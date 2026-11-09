import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { requireWorkspace } from "./session-guards";
import { createAuthRateLimiter } from "./auth-rate-limit";
import { getDatabase } from "./database/client";
import { generateOrganization } from "./organization-generation";
import { SampleAiError, AI_LIMITS, requireAiProvider } from "./ai-provider";
import type { AiProvider } from "../shared/ai-provider";
import {
  reviewAnswerSchema,
  validateReviewAnswers,
  parseLiveOrganizationResponse
} from "../shared/live-organization-review";
import type { LiveOrganizationResult } from "../shared/live-organization";
import { reportLiveAi, type LiveAiDiagnostic } from "./live-ai-diagnostics";
import { startUsage, finishUsage } from "./ai-usage";
import type { SampleAiUsage } from "../shared/sample-ai";

const segment = z
  .string()
  .min(1)
  .max(255)
  .refine(
    value =>
      value === value.trim() &&
      !/[\\/\u0000-\u001f<>:"|?*]/u.test(value) &&
      ![".", "..", ".moa-history"].includes(value.toLowerCase()) &&
      !/[. ]$/u.test(value) &&
      !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(value)
  );
const path = z.array(segment).max(65);
const scopeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("all") }),
  z.strictObject({ kind: z.literal("folder"), path }),
  z.strictObject({
    kind: z.literal("selected"),
    entries: z
      .array(
        z.strictObject({
          path: path.min(1),
          kind: z.enum(["file", "directory"])
        })
      )
      .min(1)
      .max(500)
  })
]);
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const inputSchema = z.strictObject({
  // Timestamp is part of the key: replay cannot become a new request after its DB window expires.
  requestId: z
    .string()
    .regex(/^\d{13}:[a-f0-9-]{36}$/u)
    .refine(value => {
      const [time, uuid] = value.split(":");
      return (
        z.uuid().safeParse(uuid).success &&
        Number(time) <= Date.now() + 30_000 &&
        Number(time) >= Date.now() - 300_000
      );
    }),
  owner: z.strictObject({
    userId: z.string().min(1).max(128),
    workspaceId: z.string().min(1).max(128)
  }),
  consent: z.literal(true),
  request: z.string().trim().min(2).max(800),
  basis: z.string().max(800),
  scope: scopeSchema,
  reference: path.nullable(),
  destination: path.nullable(),
  answers: z.array(reviewAnswerSchema).max(40).optional(),
  referenceTree: z
    .strictObject({ root: path, directories: z.array(path).min(1).max(200), complete: z.boolean() })
    .optional(),
  documents: z
    .array(
      z.strictObject({
        id: z.string().regex(/^document-[1-9]\d{0,2}$/u),
        name: segment.refine(name => /\.(txt|md|pdf)$/iu.test(name)),
        path: path.min(1),
        excerpt: z.string().max(1200),
        excerptHash: hash,
        sha256: hash,
        size: z
          .number()
          .int()
          .min(0)
          .max(2 * 1024 * 1024),
        lastModified: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
        pdf: z.strictObject({ pages: z.number().int().positive().max(1000000), complete: z.boolean() }).optional(),
      })
    )
    .min(1)
    .max(40)
});
let quota: ReturnType<typeof createAuthRateLimiter> | undefined;

export async function organizeLive(
  value: unknown,
  origin: string | null,
  expectedProvider?: AiProvider | null,
): Promise<LiveOrganizationResult> {
  const started = performance.now();
  let diagnostic: LiveAiDiagnostic | undefined;
  let tracked: { session: Awaited<ReturnType<typeof requireWorkspace>>; requestId: string; model: string | null; usage: SampleAiUsage | null } | null = null;
  try {
    let session: Awaited<ReturnType<typeof requireWorkspace>>;
    try {
      session = await requireWorkspace();
    } catch {
      return { ok: false, code: "session" };
    }
    if (origin !== new URL(process.env.BETTER_AUTH_URL ?? "").origin)
      return { ok: false, code: "origin" };
    const parsed = inputSchema.safeParse(value);
    if (!parsed.success) return { ok: false, code: "input" };
    const input = parsed.data;
    if (Buffer.byteLength(JSON.stringify(input), "utf8") > 65_536)
      return { ok: false, code: "input" };
    if (
      session.userId !== input.owner.userId ||
      session.workspaceId !== input.owner.workspaceId ||
      Date.parse(session.sessionExpiresAt) <= Date.now() ||
      !Number.isFinite(Date.parse(session.sessionExpiresAt))
    )
      return { ok: false, code: "session" };
    const within = (parent: readonly string[], child: readonly string[]) =>
      parent.length <= child.length && parent.every((part, index) => part === child[index]);
    const ids = new Set<string>();
    const paths = new Set<string>();
    for (const document of input.documents) {
      const key = JSON.stringify(document.path);
      const scope = input.scope;
      const inScope =
        scope.kind === "all" ||
        (scope.kind === "folder" && within(scope.path, document.path)) ||
        (scope.kind === "selected" &&
          scope.entries.some(
            entry =>
              within(entry.path, document.path) &&
              (entry.kind === "directory" || entry.path.length === document.path.length)
          ));
      if (
        !inScope ||
        document.name !== document.path.at(-1) ||
        ids.has(document.id) ||
        paths.has(key) ||
        (!/\.pdf$/iu.test(document.name) && Buffer.byteLength(document.excerpt, "utf8") > document.size) ||
        createHash("sha256").update(document.excerpt).digest("hex") !== document.excerptHash
      )
        return { ok: false, code: "input" };
      ids.add(document.id);
      paths.add(key);
    }
    if (
      input.referenceTree &&
      (!input.reference ||
        JSON.stringify(input.referenceTree.root) !== JSON.stringify(input.reference) ||
        input.referenceTree.directories.some(
          directory => !within(input.referenceTree!.root, directory)
        ) ||
        new Set(input.referenceTree.directories.map(directory => JSON.stringify(directory)))
          .size !== input.referenceTree.directories.length)
    )
      return { ok: false, code: "input" };
    let answers;
    try {
      answers = validateReviewAnswers(
        input.answers ?? [],
        input.documents.map(document => ({ ...document, sourcePath: document.path.slice(0, -1) }))
      );
    } catch {
      return { ok: false, code: "input" };
    }
    if (input.documents.reduce((sum, document) => sum + document.excerpt.length, 0) > 6000)
      return { ok: false, code: "input" };
    const provider = requireAiProvider(expectedProvider);
    diagnostic = { stage: "quota", provider, outcome: "unavailable" };
    quota ??= createAuthRateLimiter(getDatabase, process.env.BETTER_AUTH_SECRET!);
    // Failed/cancelled calls may already have reached the provider; reservations are never refunded.
    const reservation = await quota.consumeAll([
      { key: `live-ai-v1:request:${session.workspaceId}:${input.requestId}`, max: 1, window: 3600 },
      { key: `live-ai-v1:workspace:${session.workspaceId}`, max: 10, window: 3600 },
      { key: `live-ai-v1:user:${session.sessionUserId}`, max: 10, window: 3600 },
      { key: "sample-ai-v1:global-minute", max: 1, window: 60 },
      { key: "sample-ai-v1:global-hour", max: 12, window: 3600 }
    ]);
    if (!reservation.allowed) {
      diagnostic.outcome = "limit";
      return { ok: false, code: "limit", retryAfter: reservation.retryAfter ?? 60 };
    }
    await startUsage(session, input.requestId, provider, "organize");
    tracked = { session, requestId: input.requestId, model: null, usage: null };
    const assertSession = async () => {
      let current: typeof session;
      try {
        current = await requireWorkspace();
      } catch {
        throw new SampleAiError("session");
      }
      if (
        current.userId !== session.userId ||
        current.workspaceId !== session.workspaceId ||
        current.sessionUserId !== session.sessionUserId ||
        !Number.isFinite(Date.parse(current.sessionExpiresAt)) ||
        Date.parse(current.sessionExpiresAt) <= Date.now()
      )
        throw new SampleAiError("session");
    };
    diagnostic.stage = "session";
    await assertSession();
    const timeout = Math.min(
      AI_LIMITS.timeoutMs,
      Date.parse(session.sessionExpiresAt) - Date.now()
    );
    if (timeout <= 0) throw new SampleAiError("session");
    const request = {
      instruction: input.request + (input.basis.trim() ? `\n정리 기준: ${input.basis}` : ""),
      context: {
        reference: input.reference,
        destination: input.destination,
        liveReview: true,
        referenceDirectories: input.referenceTree?.directories,
        answers,
        dateSelections: Object.fromEntries(
          answers
            .filter(answer => answer.date !== undefined)
            .map(answer => [answer.documentId, answer.date!])
        )
      },
      documents: input.documents.map(document => ({
        id: document.id,
        name: document.name,
        excerpt: document.excerpt,
        sourcePath: document.path.slice(0, -1)
      }))
    };
    diagnostic.stage = "generation";
    const result = await generateOrganization(request, AbortSignal.timeout(timeout), provider);
    tracked.model = result.model;
    tracked.usage = result.usage;
    diagnostic.usage = result.usage;
    diagnostic.stage = "session";
    await assertSession();
    diagnostic.stage = "response";
    const reviewed = parseLiveOrganizationResponse(result.value, request, answers);
    diagnostic.stage = "complete";
    diagnostic.outcome = "success";
    return {
      ok: true,
      ...reviewed,
      model: result.model,
      usage: result.usage
    };
  } catch (error) {
    const code = error instanceof SampleAiError ? error.code
      : error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? "timeout" : "unavailable";
    if (diagnostic) diagnostic.outcome = code;
    return { ok: false, code };
  } finally {
    if (tracked) {
      try { await finishUsage(tracked.session, tracked.requestId, tracked.model, tracked.usage); }
      catch { console.error("AI usage settlement unavailable."); }
    }
    if (diagnostic) reportLiveAi({ ...diagnostic, elapsedMs: Math.round(performance.now() - started) });
  }
}
