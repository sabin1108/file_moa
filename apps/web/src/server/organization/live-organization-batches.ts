import "server-only";
import { organizationBatches, LIVE_ORGANIZATION_LIMITS } from "../../shared/live-organization-limits";
import { parseLiveOrganizationResponse, type ReviewAnswer } from "../../shared/live-organization-review";
import { organizationResponseSchema, type OrganizationRequest } from "../../shared/organization";
import type { AiProvider } from "../../shared/ai-provider";
import { generateOrganization } from "./organization-generation";
import { SampleAiError } from "../ai/ai-provider";
import type { SampleAiUsage } from "../../shared/sample-ai";
import type { AiFailureReason } from "../../shared/ai-provider";
import { z, ZodError } from "zod";
import type { AiGenerationProfile } from "../ai/ai-models";

function parseBatch(value: unknown, request: OrganizationRequest, answers: readonly ReviewAnswer[]) {
  try { return parseLiveOrganizationResponse(value, request, answers); }
  catch (error) {
    if (!(error instanceof Error) || error.message !== "ungrounded-organization-evidence") throw error;
    const response = z.object({ ...organizationResponseSchema.shape,
      matches: z.array(organizationResponseSchema.shape.matches.element.extend({ date: organizationResponseSchema.shape.matches.element.shape.date.default(null) })).max(LIVE_ORGANIZATION_LIMITS.documents),
      questions: z.array(z.object({ documentId: z.string(), kind: z.enum(["date", "destination"]) })).optional(),
    }).parse(value);
    const invalid = response.matches.filter(match => !request.documents.find(document => document.id === match.documentId)?.excerpt.includes(match.evidence));
    const ids = new Set(invalid.map(match => match.documentId));
    return parseLiveOrganizationResponse({
      ...response,
      summary: "일부 AI 인용이 원문과 달라 해당 자료는 확인 대상으로 남겼습니다. 나머지는 검토할 정리 제안입니다.",
      matches: response.matches.filter(match => !ids.has(match.documentId)),
      held: [...response.held, ...invalid.map(match => ({ documentId: match.documentId, reason: "AI 인용이 이 자료의 원문과 일치하지 않아 제안에서 뺐어요. 원문을 확인하고 다시 분류하거나 이번 정리에서 제외해 주세요." }))],
      questions: response.questions?.filter(question => !ids.has(question.documentId)),
    }, request, answers);
  }
}

function validationReason(error: unknown): AiFailureReason {
  if (error instanceof ZodError) return error.issues.some(issue => issue.path.includes("evidence")) ? "invalid-evidence" : "invalid-plan";
  const message = error instanceof Error ? error.message : "";
  if (message === "ungrounded-organization-evidence") return "invalid-evidence";
  if (["unconfirmed-organization-date", "mismatched-organization-date-folder", "ignored-review-date"].includes(message)) return "invalid-date";
  if (/review/u.test(message)) return "invalid-review";
  return "invalid-plan";
}

/** 동의한 목록을 계획 분할한다. 실패한 묶음의 자동 재시도나 부분 계획 공개는 하지 않는다. */
export async function generateLiveOrganizationBatches(request: OrganizationRequest, answers: readonly ReviewAnswer[], signal: AbortSignal, provider: AiProvider, assertSession: () => Promise<void>, onUsage: (model: string, usage: SampleAiUsage) => void, profile: AiGenerationProfile = "default") {
  const batches = organizationBatches(request.documents);
  const results = [];
  for (let start = 0; start < batches.length; start += 2) {
    signal.throwIfAborted();
    if (start > 0) await assertSession();
    signal.throwIfAborted();
    const group = await Promise.allSettled(batches.slice(start, start + 2).map(async documents => {
      const ids = new Set(documents.map(document => document.id));
      const decisions = answers.filter(answer => ids.has(answer.documentId));
      const context = request.context ?? { reference: null, destination: null };
      const batch = {
        ...request,
        documents,
        context: {
          ...context,
          answers: decisions,
          dateSelections: Object.fromEntries(decisions.filter(answer => answer.date !== undefined).map(answer => [answer.documentId, answer.date!])),
        },
      };
      const result = await generateOrganization(batch, signal, provider, LIVE_ORGANIZATION_LIMITS, profile);
      if (result.usage) onUsage(result.model, result.usage);
      try { return { ...result, ...parseBatch(result.value, batch, decisions) }; }
      catch (error) { throw new SampleAiError("unavailable", validationReason(error)); }
    }));
    const failed = group.find(result => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
    for (const result of group) if (result.status === "fulfilled") results.push(result.value);
  }
  return {
    organization: {
      summary: results.length === 1 ? results[0].organization.summary : `${request.documents.length}개 자료를 ${batches.length}개 묶음으로 확인한 정리 제안입니다.`,
      matches: results.flatMap(result => result.organization.matches),
      held: results.flatMap(result => result.organization.held),
    },
    questions: results.flatMap(result => result.questions),
    model: [...new Set(results.map(result => result.model))].join(", "),
    usage: results.reduce((sum, result) => ({
      inputTokens: sum.inputTokens + result.usage.inputTokens,
      outputTokens: sum.outputTokens + result.usage.outputTokens,
      totalTokens: sum.totalTokens + result.usage.totalTokens,
    }), { inputTokens: 0, outputTokens: 0, totalTokens: 0 }),
  };
}
