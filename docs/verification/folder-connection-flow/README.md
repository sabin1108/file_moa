# 자료 연결 → 보관함·오류 안내 검증 — 2026-11-04

자료 연결/재연결은 같은 설정 화면을 유지하고 보관함 제목으로 초점을 옮긴다. 사용자가 ‘연결 마치기’ 또는 ‘보관함은 나중에 연결’을 눌러 마친다. 위치 오류는 짧은 경고/수정 안내와 ‘다른 위치 선택’으로 제시하고 오류 영역을 초점·스크롤로 드러낸다. 기존 권한·원본 보호·생성 계약은 유지한다. [명세](../../specs/folder-connection-flow.md).

- 전체 `pnpm check`:431테스트/44파일, 타입·lint·서버/구조 경계·43페이지 build 통과. 위치 오류 문구/수정 행동 테스트는 기존 구현에서 RED→수정 뒤 GREEN을 확인했다.
- 완료된 브라우저: [생성·연결23](connection/checks.json), [복구 백업23](backup/checks.json), [설정/파일 이동14](navigation/checks.json), [기존 복사26](copy/checks.json), [반복 피드백37](plan/checks.json), 합계123검사. production localhost3020, OPFS/합성 picker·권한/실제 CDP 입력. 완료된 묶음에 실패/콘솔 예외 없음.
- 자료 연결 후 같은 팝업 유지·제목 초점, 설정 페이지 유지·명시 완료, 새로고침 뒤 재연결,390/768/1440/1920px, 오류 수정 버튼의 새 사용자 제스처·거부 후 재시도·생성0·원본 불변·Escape 초점 복귀를 확인했다. [390px 오류 화면](connection/location-error-390.png).
- 기존 파일 전용 회귀 스크립트는 공통 fixture로 명시적 ‘나중에 연결’을 누르게 갱신했다. 고정 대기 뒤 즉시 클릭하던5묶음은 표시/활성 상태를 기다리도록 보정했다. 일부 기존 CDP 실행은 Page.enable에서 멈춰 격리 Chromium의 no-sandbox/disable-gpu 실행 설정으로 재실행했다.
- 오래된 `check-source-folder-browser`와 `check-file-selection-dialog`는 각각 이미 바뀐 루트 breadcrumb/‘선택 해제’ 문구 가정에서 중단됐다. 현재 브라우저 전체 통과로 계산하지 않는다. 이번 연결/오류 동작은 위 완료된5묶음으로 검증했다.
- 사이트6경로×2폭×3회=36표본과 자산 비용은 [성능 기록](performance.md)에 남겼다. OS picker/권한창·개인 디스크·외부 프로그램 경쟁·물리IME/실물 모바일·field INP는 미검증이다.

코드 읽기 순서: `SourceFolderSettings.tsx`(같은 화면 유지/명시 완료) → `RecoveryVaultSettings.tsx`(오류 표시/행동/초점) → `recovery-connection-controller.ts`(짧은 메시지/수정 종류) → 공통 `StatusNotice.tsx`(alert 선택). 공통 경고 토큰/버튼/기존 상태를 재사용했고 의존성을 추가하지 않았다.

오류 파일은 [외부 오류_정리.md](/E:/memory/chatbotfolder/Requirements/오류_정리.md)로 이동해 요구사항 옆에 둔다. 원래 repo 파일은 남기지 않았다. 스킬 YAML/이름/BOM/기록 경로 존재·AGENTS 연결을 확인했다. 긴 분석과 미확정 사항은 memory/HANDOFF 최신 절을 따른다.
