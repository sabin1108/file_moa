import "server-only";
import { organizationBatches, LIVE_ORGANIZATION_LIMITS } from "../../shared/live-organization-limits";
import { parseLiveOrganizationResponse, type ReviewAnswer } from "../../shared/live-organization-review";
import type { OrganizationRequest } from "../../shared/organization";
import type { AiProvider } from "../../shared/ai-provider";
import { generateOrganization } from "./organization-generation";
import { SampleAiError } from "../ai/ai-provider";
import type { SampleAiUsage } from "../../shared/sample-ai";

/** 동의한 목록을 계획 분할한다. 실패한 묶음의 자동 재시도나 부분 계획 공개는 하지 않는다. */
export async function generateLiveOrganizationBatches(request: OrganizationRequest, answers: readonly ReviewAnswer[], signal: AbortSignal, provider: AiProvider, assertSession: () => Promise<void>, onUsage: (model: string, usage: SampleAiUsage) => void) {
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
      const result = await generateOrganization(batch, signal, provider, LIVE_ORGANIZATION_LIMITS);
      if (result.usage) onUsage(result.model, result.usage);
      try { return { ...result, ...parseLiveOrganizationResponse(result.value, batch, decisions) }; }
      catch { throw new SampleAiError("unavailable", "invalid-response"); }
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
