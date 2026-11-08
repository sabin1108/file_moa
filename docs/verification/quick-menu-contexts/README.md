# 일반 영역과 모달의 퀵메뉴

기존 p/span/pre 등의 글 영역 차단과 모든 modal 차단을 제거하고, 실제 조작 대상을 공통 이벤트 위임에서 제외한다. 활성 작업 화면이 있어야 하며 로그인 같은 공개 화면은 켜지지 않는다. 모달에서는 실제 DOM을 활성 dialog 안에 portal한 뒤 manual Popover로 표시한다. 모달 종료/경로 변경은 정리하고 파일 실행/중단 정산·미저장 편집 중에는 표시와 선택을 모두 거부한다.

변경 전 첫 일반 글 검사 실패를 확인했다. [새 19개 검사](checks.json)와 [기존 33개 검사](regression/scope-drawer-checks.json)를 통과했다. 실제 production 샘플과 합성 native dialog의 브라우저 검사이며 운영체제의 파일 선택창에는 앱 메뉴를 표시하지 않는다. 실제 파일 미리보기/선택과 한글 입력은 사용자가 Windows에서 수행했다고 보고했으며 전체 세부 경합 검증과 구분한다.

자세한 코드·실행 범위·제약은 [오늘 점검](../completion-five/README.md), 계약은 [명세](../../specs/quick-menu-contexts.md)를 따른다.
