# 시안과 합성 예시

2026-11-08 추가: `/preview/screens/chat-first`는 실제 사용 피드백에 따른 대화 중심 정리 개편안이다. `organization`의 합성 두 파일로 질문→현재/도착 구조→검토의 배치를 확인한다. 모델/실제 폴더/계정 상태를 읽지 않으며 실행은 비활성이다. 기존 `/preview/screens/chat`과 실제 채팅은 교체하지 않았다. [명세](../../../../docs/specs/chat-first-organization.md).

`/preview` 아래에서 보여주는 합성 데이터와 미구현 동작의 시안이다. auth/files/settings/demo와 prototype-data/library-data를 이 영역에 둔다.

`feedback`의 TaskProgress/StartupState/LoadingRegion/FileIssueList/AnswerStatus는 현재 시안에서만 사용한다. 향후 실제 소비자가 생기면 입력 계약과 책임을 검토해 공통으로 이동한다. 지금 제품 기능이 완료됐다는 뜻은 아니다.

공통 표시와 스타일은 shared를 직접 import한다. 실제 컴포넌트를 시연할 때는 features를 사용할 수 있으나 실제 기능이 이 폴더를 역으로 가져오지는 않는다. PreviewButton은 비활성 시안 버튼이고 실제 작업 버튼으로 사용하지 않는다.

2026-11-07 참조 조사에서 사용되지 않는 SourcePanel/DocumentInspector/FileList/FolderOverview와 전용 CSS 3개, 고립된 자료 export 6개를 정리했다. `/preview`의 5개 화면/28개 장면은 디자인 비교와 캡처 경로에서 사용하므로 유지한다. 실제 공개 체험 `/demo`는 `features/sample-workspace`의 별도 기능이며 삭제 대상이 아니다. [정리 근거와 렌더 확인](../../../../docs/verification/everyday-evaluation-cleanup/README.md).
