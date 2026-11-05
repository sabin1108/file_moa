# 파일 작업 UX 인수인계 — 2026-11-02

사용자 요청에 따른 직접 복사/이동, 수동 분류 제거, 팝업 휠 잠금, 목적지 버튼/통합 탐색·직접 경로 입력, 검사 시각화, 폴더 구조 예상 결과, 단계별 입력 숨김, 완료 확인→목적지 이동, 열린 폴더 재클릭→상위 목록을 구현했다. 최신 계약은 [명세](../specs/file-actions-ux.md)와 DESIGN.md다.

현재 실제 복사는 가능하다. **이동은 계획만 제공**한다. 같은 이름 계속/중단·덮어쓰기와 전용 복구 보관함은 [계획](../specs/recovery-vault.md) 상태이며 기존 충돌 차단을 해제하지 않았다. 보존 기간/자동 정리 정책을 임의 확정하지 않았다.

`pnpm check`335개/31파일·타입·lint·경계·43페이지 빌드 통과. 브라우저 새 UX69, 복사25, 폴더57, 목적지29, 검사27, 계획30개. [전체 증거·재현·미검증 범위](../verification/file-actions-ux/README.md), [성능](../verification/file-actions-ux/performance.md). 독립 읽기 검토의 짧은 화면 휠과 실행 진입 실패 복귀 경로를 보완했다.

요구사항 원장은 `E:/memory/chatbotfolder/Requirements/요구사항.md`에17개다. 앞으로 요청을 번호별1~3줄로 추가하고 취소 항목은 삭제 대신 `{취소됨}`으로 표시한다. 요구사항 문서에 긴 구현 설명이나 완료 주장까지 넣지 않는다.

읽을 순서: 위 명세 → source-plan-controller → SourcePlanDialog → PlanDestinationInput/DestinationPathForm/DestinationFolderPicker → 검사/계획/실행 표시 → SourceFolderBrowser/FolderWorkspaceFrame → 테스트. 상태는 기존 controller에서 유도하며 실제 파일 쓰기는 기존 서비스 경계를 유지한다. 승인된 채팅 시안이나 의존성은 바꾸지 않았다.
