import type { OrganizationResponse } from "./organization";
import type { SampleAiErrorCode, SampleAiUsage } from "./sample-ai";
import type { OrganizationScope, SnapshotDocument, ReferenceSnapshot } from "./source-snapshot";
import type { ReviewAnswer, ReviewQuestion } from "./live-organization-review";
import type { AiFailureReason } from "./ai-provider";

export type LiveOrganizationInput = Readonly<{
  requestId: string;
  owner: Readonly<{
    userId: string;
    workspaceId: string
  }>;
  consent: true;
  request: string;
  basis: string;
  scope: OrganizationScope;
  reference: readonly string[] | null;
  destination: readonly string[] | null;
  documents: readonly SnapshotDocument[];
  answers?: readonly ReviewAnswer[];
  referenceTree?: ReferenceSnapshot;
}>;

export type LiveOrganizationResult =
  | Readonly<{
    ok: true;
    organization: OrganizationResponse;
    model: string;
    usage: SampleAiUsage;
    questions?: readonly ReviewQuestion[];
  }>
  | Readonly<{
    ok: false;
    code: SampleAiErrorCode;
    retryAfter?: number;
    reason?: AiFailureReason;
  }>;

export type LiveOrganizationAction = (
  input: LiveOrganizationInput
) => Promise<LiveOrganizationResult>;

export const LIVE_AI_MESSAGES: Record<SampleAiErrorCode, string> = {
  session: "로그인 또는 작업 공간이 바뀌었어요. 다시 로그인하고 자료를 준비해 주세요.",
  origin: "이 화면의 요청을 확인하지 못했어요. 새로고침 후 자료를 다시 준비해 주세요.",
  input: "전송 자료를 처리할 수 없어요. 선택한 자료와 발췌를 다시 확인해 주세요.",
  limit:
    "지금 요청 제한에 걸렸어요. 오늘 사용량·중복 요청·전체 사용 한도 또는 공급자의 속도 제한을 확인해 주세요. 자동 재시도하지 않습니다.",
  timeout:
    "AI 응답 대기 시간이 지났어요. 자동 재시도하지 않습니다. 이미 보낸 요청은 사용량에 포함될 수 있어요.",
  unavailable:
    "AI 제안을 받지 못했어요. 자동 재시도하지 않습니다. 이미 보낸 요청은 사용량에 포함될 수 있어요."
};

export const LIVE_AI_REASON_MESSAGES: Record<AiFailureReason, string> = {
  configuration: "AI 모델 또는 연결 설정을 확인해야 해요. 자료 선택은 유지했습니다. 설정을 확인한 뒤 다시 분석해 주세요.",
  authorization: "AI 공급자의 인증이나 이용 권한을 확인해야 해요. 자료 선택은 유지했습니다.",
  capacity: "이 묶음의 실제 토큰 수가 한도를 넘었어요. 자료를 줄여 다시 분석해 주세요. 선택은 유지했습니다.",
  "output-limit": "AI 답변이 출력 한도에서 중단됐어요. 미완료 계획은 적용하지 않았습니다. 자료를 나눠 다시 분석해 주세요.",
  "invalid-response": "AI 답변의 형식이나 원문 근거를 확인하지 못했어요. 계획은 적용하지 않았습니다. 선택한 자료로 다시 분석할 수 있어요.",
  "invalid-json": "AI가 계획을 읽을 수 없는 형식으로 답했어요. 파일은 바꾸지 않았습니다. 선택한 자료로 다시 분석할 수 있어요.",
  "invalid-evidence": "AI가 제시한 인용이 해당 자료의 발췌와 일치하지 않아요. 이 제안은 사용하지 않았습니다. 자료 선택은 유지했어요.",
  "invalid-date": "AI가 요청과 맞지 않거나 원문에서 확인되지 않은 날짜를 제안했어요. 계획은 적용하지 않았습니다.",
  "invalid-plan": "AI의 분류 경로나 자료 목록이 요청 조건과 맞지 않아요. 계획은 적용하지 않았고 선택한 자료는 유지했어요.",
  "invalid-review": "AI가 확인한 답변과 다른 제안을 반환했어요. 기존 답변을 유지했습니다. 다시 분석할 수 있어요.",
  upstream: "AI 공급자가 요청을 처리하지 못했어요. 선택한 자료는 유지했습니다. 잠시 후 다시 분석해 주세요.",
  network: "AI 연결이 끊겼어요. 선택한 자료는 유지했습니다. 연결 상태를 확인한 뒤 다시 분석해 주세요.",
};
