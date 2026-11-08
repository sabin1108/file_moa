import "server-only";
import type { AiProvider } from "../shared/ai-provider";
import type { SampleAiErrorCode, SampleAiUsage } from "../shared/sample-ai";

export type LiveAiDiagnostic = {
  stage: "quota" | "session" | "generation" | "response" | "complete";
  provider: AiProvider;
  outcome: SampleAiErrorCode | "success";
  usage?: SampleAiUsage;
};

/** 원문·사용자·경로·오류 객체를 받지 않고 운영에 필요한 숫자만 기록한다. */
export function reportLiveAi(value: LiveAiDiagnostic & { elapsedMs: number }) {
  console.info("Live AI operation.", {
    stage: value.stage, provider: value.provider, outcome: value.outcome, elapsedMs: value.elapsedMs,
    ...(value.usage ? { inputTokens: value.usage.inputTokens, outputTokens: value.usage.outputTokens, totalTokens: value.usage.totalTokens } : {}),
  });
}
