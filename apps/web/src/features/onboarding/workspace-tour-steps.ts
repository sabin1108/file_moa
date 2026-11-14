import type { TourRecordKind } from "./workspace-tour-view";

export type TourStep = { route: string | null; selector: string; title: string; text: string; recordKind?: TourRecordKind };

export const workspaceTourSteps: readonly TourStep[] = [
  { route: null, selector: 'nav[aria-label="주 메뉴"], nav[aria-label="모바일 주 메뉴"], nav[aria-label="모바일 작업 공간"]', title: "폴더, 채팅, 설정을 둘러볼까요?", text: "폴더에서 자료를 보고, 채팅에서 질문하고 정리합니다. 설정에서는 계정과 사용 방식을 바꿀 수 있어요. 실제 화면을 함께 둘러볼게요." },
  { route: "/files", selector: '[data-tour="folder-connection"]', title: "먼저 자료 폴더를 연결해요", text: "‘폴더 연결 관리’에서 내 컴퓨터의 폴더를 선택합니다. 안내를 보는 동안에는 폴더를 열거나 권한을 요청하지 않아요. 연결한 자료는 이 기기에서 읽습니다." },
  { route: "/files", selector: '[data-tour="folder-list"] > div:first-child', title: "자료를 보고, 필요한 파일을 골라요", text: "폴더를 열어 이동하고 파일을 선택해 내용을 확인합니다. 여러 항목을 선택하면 복사·이동·정리 계획을 검토할 수 있어요. 원본 변경은 내용을 확인하고 직접 실행합니다." },
  { route: "/", selector: '[data-tour="task-chat"], select[aria-label="대화 작업"]', title: "일반 대화 · 자료 없이 바로 질문해요", text: "설명, 아이디어, 글 초안이 필요할 때 사용해요. ‘일반 대화’를 고르고 질문을 입력한 뒤 보내세요. 연결한 폴더 내용이 자동으로 전송되지는 않아요. Shift+Enter로 줄을 바꿀 수 있어요." },
  { route: "/", selector: '[data-tour="task-find"], select[aria-label="대화 작업"]', title: "자료 찾기 · 단어와 날짜로 찾아요", text: "‘자료 찾기’를 고르고 찾을 단어나 시기를 입력해요. 폴더가 연결돼 있어야 합니다. 날짜 기준과 범위를 고른 뒤 아래의 ‘검색 시작’을 누르세요. 후보의 일치 근거를 펼쳐 보고 원문을 확인할 수 있어요." },
  { route: "/", selector: '[data-tour="task-grounded"], select[aria-label="대화 작업"]', title: "자료로 질문 · 선택한 내용에 물어봐요", text: "파일 화면에서 자료를 고르고 ‘자료로 질문’을 선택해요. AI에 보낼 발췌를 확인하고 전송에 동의한 뒤 질문합니다. 답변의 출처를 눌러 원문과 비교하세요. 폴더 연결만으로 파일을 전송하지는 않아요." },
  { route: "/", selector: '[data-tour="task-organize"], select[aria-label="대화 작업"]', title: "자료 정리 · 계획을 보고 결정해요", text: "‘자료 정리’를 고르고 어떤 자료를 어떻게 나눌지 입력해요. 정리할 범위와 파일을 확인하고 변경 계획을 검토합니다. 이동·복사할 위치와 내용을 확인한 뒤 직접 실행해요. 안내를 보는 동안 원본은 바뀌지 않아요." },
  { route: "/", selector: '[data-tour="context"]', title: "읽을 자료와 저장 위치는 달라요", text: "‘자료 연결’은 참고할 파일의 위치예요. 대화와 결과물을 보관하려면 저장 위치를 따로 연결하고 저장을 켭니다. 저장하지 않은 대화는 새로고침하면 사라져요." },
  { route: "/", selector: '[data-tour="records"]', title: "기록함 · 다시 꺼내 쓸 내용을 모아요", text: "대화, 결과물, 위키, 기억, 프로필은 쓰임이 달라요. 다음 단계에서 각 탭을 보여 드릴게요. 저장하려면 이 기기의 저장 위치를 먼저 연결해야 합니다. 안내에서는 폴더를 연결하거나 파일을 만들지 않아요." },
  { route: "/", selector: '[data-tour="record-conversation"]', recordKind: "conversation", title: "대화 · 질문과 답변을 이어 봐요", text: "저장을 켠 대화를 다시 열어 이어갈 수 있어요. ‘새 대화’로 별도 대화를 시작합니다. 저장하지 않은 대화는 새로고침하면 사라지니, 남길 대화는 저장 위치를 연결하고 대화 저장을 켜 주세요." },
  { route: "/", selector: '[data-tour="record-artifact"]', recordKind: "artifact", title: "결과물 · 답변을 내 문서로 다듬어요", text: "답변의 ‘결과물로 편집’에서 초안을 만들거나 ‘새 결과물’로 직접 작성해요. 제목과 본문을 편집하고 저장하면 이 탭에서 다시 열 수 있어요. 대화 전체와 별도로 보관하는 문서입니다." },
  { route: "/", selector: '[data-tour="record-wiki"]', recordKind: "wiki", title: "위키 · 정리한 글과 출처를 함께 남겨요", text: "자료로 질문한 답변의 ‘위키로 저장’이나 ‘위키로 편집’에서 만들어요. 정리한 본문과 참고한 자료의 출처를 함께 보관합니다. ‘자료 답변에서 만들기’로 시작할 수 있어요. 원본 내용도 함께 확인해 주세요." },
  { route: "/", selector: '[data-tour="record-memory"]', recordKind: "memory", title: "기억 · 내가 승인한 정보만 참고해요", text: "앞으로도 참고할 정보를 직접 쓰거나 답변의 ‘기억으로 검토’에서 제안받아요. 내용을 확인해 승인하고 사용할 범위를 정합니다. 대화 설정의 ‘내 정보 참고’를 켰을 때만 승인한 기억을 AI에 함께 보내요." },
  { route: "/", selector: '[data-tour="record-profile"]', recordKind: "profile", title: "프로필 · 나에게 맞는 답변 방식을 적어요", text: "‘프로필 만들기’에서 내 소개와 선호하는 답변 방식을 적고 저장해요. 예를 들어 ‘핵심부터 짧게, 예시와 함께’처럼 쓸 수 있어요. 로그인 계정 정보와는 별개이며, ‘내 정보 참고’를 켜야 AI가 참고합니다." },
  { route: "/", selector: '[data-tour="settings"]', title: "현재 대화의 설정은 여기 있어요", text: "대화 저장과 ‘내 정보 참고’를 바꿉니다. 기억은 내가 승인한 참고 정보이며, 사용을 켰을 때만 프로필과 승인한 기억을 AI에 함께 보내요." },
  { route: "/settings?tab=account", selector: '[data-tour="settings-tabs"]', title: "전체 설정은 기능별로 나뉘어요", text: "계정과 로그인, 폴더 연결, 문서 편집, 화면과 조작을 각각 관리합니다. 폴더 연결을 해제해도 원본 파일이 삭제되지는 않아요." },
  { route: "/settings?tab=controls", selector: '[data-tour="quick-settings"]', title: "퀵메뉴로 화면을 빠르게 바꿔요", text: "빈 작업 영역을 길게 누르거나 설정한 단축키로 폴더·채팅·설정을 오갈 수 있어요. 호출 방식과 키는 여기서 바꿉니다. ‘사용 방법 다시 보기’로 이 안내를 언제든 다시 열 수 있어요." },
] as const;

export function tourRouteMatches(route: string | null, pathname: string, tab: string | null) {
  if (!route) return true;

  const [path, query] = route.split("?");

  return pathname === path && (!query || new URLSearchParams(query).get("tab") === tab);
}
