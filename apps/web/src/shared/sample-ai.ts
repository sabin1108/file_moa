import type { ClassificationResponse } from "./ai-classification";
import type { AiFailureReason } from "./ai-provider";

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
    retryAfter?: number;
    reason?: AiFailureReason
  }>;

export const SAMPLE_AI_MESSAGES: Record<SampleAiErrorCode, string> = {
  session: "체험 링크나 세션을 확인하지 못했어요. 받은 체험 링크로 다시 접속해 주세요.",
  origin: "이 화면에서 요청을 확인하지 못했어요. 새로고침한 뒤 다시 시도해 주세요.",
  input: "요청한 샘플 자료를 처리할 수 없어요. 선택한 자료를 줄이거나 다시 확인해 주세요.",
  limit: "지금 요청 제한에 걸렸어요. 오늘 사용량·중복 요청·전체 체험 한도 또는 공급자의 속도 제한을 확인해 주세요. 자동으로 다시 요청하지 않습니다.",
  timeout: "AI 응답 대기 시간이 지났어요. 자동으로 다시 요청하지 않습니다.",
  unavailable: "지금 AI에 연결하지 못했어요. 준비된 답변으로 대체하지 않으며 자동으로 다시 요청하지 않습니다.",
};
