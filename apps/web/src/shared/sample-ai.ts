import type { ClassificationResponse } from "./ai-classification";

export type SampleAiErrorCode = "session" | "origin" | "input" | "limit" | "timeout" | "unavailable";

export type SampleAiUsage = Readonly<{
  inputTokens: number;
  outputTokens: number;
  totalTokens: number
}>;

export type SampleAiAction = (input: {
  requestId: string;
  documentIds: string[];
  consent: true
}) => Promise<SampleAiResult>;

export type SampleAiResult =
  | Readonly<{
    ok: true;
    proposals: ClassificationResponse["proposals"];
    usage: SampleAiUsage;
    model: string
  }>
  | Readonly<{
    ok: false;
    code: SampleAiErrorCode;
    retryAfter?: number
  }>;

export const SAMPLE_AI_MESSAGES: Record<SampleAiErrorCode, string> = {
  session: "샘플 세션이 만료되었어요. 새 세션으로 시작해 주세요.",
  origin: "이 화면에서 요청을 확인하지 못했어요. 새로고침한 뒤 다시 시도해 주세요.",
  input: "요청한 샘플 자료를 처리할 수 없어요. 선택한 자료를 줄이거나 다시 확인해 주세요.",
  limit: "샘플 AI 요청 한도에 도달했어요. 잠시 후 직접 다시 시도하거나 준비된 제안을 볼 수 있어요.",
  timeout: "AI 응답 대기 시간이 지났어요. 자동으로 다시 요청하지 않습니다.",
  unavailable: "지금 AI 제안을 받지 못했어요. 잠시 후 직접 다시 시도하거나 준비된 제안을 볼 수 있어요.",
};
