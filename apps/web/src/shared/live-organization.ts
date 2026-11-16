import type { OrganizationResponse } from "./organization";
import type { SampleAiErrorCode, SampleAiUsage } from "./sample-ai";
import type { OrganizationScope, SnapshotDocument, ReferenceSnapshot } from "./source-snapshot";
import type { ReviewAnswer, ReviewQuestion } from "./live-organization-review";

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
    retryAfter?: number
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
