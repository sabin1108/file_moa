import type { OrganizationPreparationState } from "./organization-preparation-controller";

export type OrganizationConditionStep = "scope" | "coverage" | "basis" | "destination" | "confirm";
export type OrganizationReplyContext = { currentPath?: readonly string[] };

export function isOrganizationFollowup(text: string) {
  return !/^(?:(?:새|새로|새로운)\s*(?:정리|작업|질문)|다른\s*(?:자료|작업|질문)|처음부터\s*다시)/u.test(text.trim());
}

export function organizationConversationPrompt(state: OrganizationPreparationState, provider = "외부 AI") {
  if (state.phase === "reading") return { title: "자료를 확인하고 있어요", text: "선택한 범위만 이 기기에서 확인합니다.", example: "" };
  if (state.phase === "checking" || state.phase === "sending") return { title: "정리 제안을 준비하고 있어요", text: "원본을 확인한 뒤 동의한 자료로 제안을 받습니다.", example: "" };
  switch (state.conversationStep) {
    case "scope": return { title: "어느 자료부터 정리할까요?", text: "연결한 폴더 전체, 현재 보고 있는 폴더, 또는 폴더 이름을 채팅으로 알려 주세요.", example: "현재 폴더만" };
    case "coverage": return { title: "하위 폴더도 함께 정리할까요?", text: "선택한 폴더 바로 안의 파일만 볼지, 그 아래 폴더까지 함께 볼지 알려 주세요.", example: "하위 폴더까지 포함해줘 또는 이 폴더 파일만" };
    case "basis": return { title: "어떤 기준으로 나눌까요?", text: "원하는 방식을 편하게 적어 주세요. 날짜·언어·주제처럼 구체적으로 말할수록 계획을 확인하기 쉬워요.", example: "파일 제목보다 본문 내용을 보고 주제별로 나눠줘" };
    case "destination": return { title: "정리한 자료를 어디에 모을까요?", text: "연결한 폴더 안의 목적지를 알려 주세요. 아직 정하지 않았다면 나중에 계획에서 골라도 됩니다.", example: "정리 폴더로 또는 나중에 정할게" };
    case "confirm": return { title: "이 조건으로 자료를 살펴볼까요?", text: "바꿀 부분이 있으면 ‘범위는…’, ‘기준은…’, ‘목적지는…’으로 말해 주세요. 준비만 하며 AI에 보내거나 파일을 바꾸지 않아요.", example: "이대로 자료 확인해줘" };
  }
  if (state.questions.length && !state.reviewConfirmed) return { title: "이 자료는 어떻게 정할까요?", text: `확인할 자료 ${new Set(state.questions.map(question => question.documentId)).size}개예요. 모두 같은 기준으로 답하거나 파일 이름을 붙여 따로 지정할 수 있어요.`, example: "모두 영어 폴더로 또는 memo.md는 이번 정리에서 제외" };
  if (state.result && !state.result.organization.held.length) return { title: "변경 계획을 함께 볼까요?", text: "작은 구조 미리보기에서 도착 위치를 확인하세요. 조건을 바꾸려면 채팅으로 알려 주세요. 원본 변경은 마지막 검사와 실행 승인 후에 진행합니다.", example: "기준은 본문 언어별로 바꿔줘" };
  if (state.snapshot && !state.snapshot.complete && !state.partialAccepted) return { title: "일부 자료를 읽지 못했어요", text: "읽지 못한 자료를 확인한 뒤, 준비된 일부 자료만 사용할지 정해 주세요.", example: "확인한 일부 자료만 사용할게" };
  if (state.snapshot) return { title: `자료 ${state.selectedIds.length}개를 준비했어요`, text: `${provider}에 선택한 파일 이름·상대 경로·발췌와 정리 조건을 보냅니다. 짧은 문서는 전체 내용이 발췌에 포함될 수 있어요. ‘다음’만으로는 전송하지 않습니다.`, example: "전송에 동의해" };
  return { title: "정리할 내용을 알려 주세요", text: "어떤 자료를 어떻게 정리할지 대화로 하나씩 정해 볼게요.", example: "현재 폴더를 주제별로 정리하고 싶어" };
}
