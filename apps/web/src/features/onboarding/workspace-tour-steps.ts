export const workspaceTourSteps = [
  { route: null, selector: 'nav[aria-label="주 메뉴"], nav[aria-label="모바일 주 메뉴"], nav[aria-label="모바일 작업 공간"]', title: "폴더, 채팅, 설정을 둘러볼까요?", text: "폴더에서 자료를 보고, 채팅에서 질문하고 정리합니다. 설정에서는 계정과 사용 방식을 바꿀 수 있어요. 실제 화면을 함께 둘러볼게요." },
  { route: "/files", selector: '[data-tour="folder-connection"]', title: "먼저 자료 폴더를 연결해요", text: "‘폴더 연결 관리’에서 내 컴퓨터의 폴더를 선택합니다. 안내를 보는 동안에는 폴더를 열거나 권한을 요청하지 않아요. 연결한 자료는 이 기기에서 읽습니다." },
  { route: "/files", selector: '[data-tour="folder-list"]', title: "자료를 보고, 필요한 파일을 골라요", text: "폴더를 열어 이동하고 파일을 선택해 내용을 확인합니다. 여러 항목을 선택하면 복사·이동·정리 계획을 검토할 수 있어요. 원본 변경은 내용을 확인하고 직접 실행합니다." },
  { route: "/", selector: '[data-tour="start"], [data-tour="composer"]', title: "채팅에서는 할 일을 먼저 골라요", text: "일반 대화, 자료 찾기, 자료 정리, 자료로 질문 중 하나를 고르면 입력창이 열립니다. 작성 중인 내용은 두고 작업을 바꿀 수도 있어요." },
  { route: "/", selector: '[data-tour="context"]', title: "읽을 자료와 저장 위치는 달라요", text: "‘자료 연결’은 참고할 파일의 위치예요. 대화와 결과물을 보관하려면 저장 위치를 따로 연결하고 저장을 켭니다. 저장하지 않은 대화는 새로고침하면 사라져요." },
  { route: "/", selector: '[data-tour="records"]', title: "다시 볼 답변은 기록함에서", text: "저장한 대화·결과물·위키를 다시 열 수 있어요. 위키는 자료의 출처와 함께 정리한 글입니다. 저장 위치를 연결한 뒤 사용할 수 있어요." },
  { route: "/", selector: '[data-tour="settings"]', title: "현재 대화의 설정은 여기 있어요", text: "대화 저장과 ‘내 정보 참고’를 바꿉니다. 기억은 내가 승인한 참고 정보이며, 사용을 켰을 때만 프로필과 승인한 기억을 AI에 함께 보내요." },
  { route: "/settings?tab=account", selector: '[data-tour="settings-tabs"]', title: "전체 설정은 기능별로 나뉘어요", text: "계정과 로그인, 폴더 연결, 문서 편집, 화면과 조작을 각각 관리합니다. 폴더 연결을 해제해도 원본 파일이 삭제되지는 않아요." },
  { route: "/settings?tab=controls", selector: '[data-tour="quick-settings"]', title: "퀵메뉴로 화면을 빠르게 바꿔요", text: "빈 작업 영역을 길게 누르거나 설정한 단축키로 폴더·채팅·설정을 오갈 수 있어요. 호출 방식과 키는 여기서 바꿉니다. ‘사용 방법 다시 보기’로 이 안내를 언제든 다시 열 수 있어요." },
] as const;

export function tourRouteMatches(route: string | null, pathname: string, tab: string | null) {
  if (!route) return true;

  const [path, query] = route.split("?");

  return pathname === path && (!query || new URLSearchParams(query).get("tab") === tab);
}
