# 실제 기능·공통 표시·시안 분류와 연결 후 이동

2026-10-28. 사용자가 features의 파일 분류와 유지보수/리뷰 위치를 요청했고, 연결 성공 후 내 파일 이동을 추가로 요청했다. 이후 파일 다중 선택·팝업 요청이 이어졌으며 **전체 최신 결과는 [후속 검증](../file-selection-dialog/README.md)**을 우선한다. 이 폴더는 그 직전 분류/이동 단계의 근거다.

## 변경 이유와 읽을 순서

1. [계획](../../planning/feature-classification.md): 실제 기능이 prototype 공통 표시를 import하던 방향을 수정한다. 줄 수를 맞추는 분할이나 새 프레임워크를 추가하지 않는다.
2. [src 구조 안내](../../../apps/web/src/README.md), [코드 지도](../../code-map.md): app 진입점 / features 실제 기능 / shared 공통 표시 / prototypes 합성 시안. local-folders 내부는 ui/state/browser/contracts로 나눈다.
3. [이동 기록](moves.json): 기존 경로·현재 경로·변경 전 SHA-256 102건. 호환 re-export를 늘리지 않고 사용처를 직접 수정했다. 기존 Icon wrapper는 기존 shared 구현으로 통합했다.
4. [ESLint 경계](../../../apps/web/tooling/feature-boundary.mjs), [19개 fixture](../../../scripts/check-feature-boundary.mjs): 실제 기능→시안, shared→기능/app/시안, 기능→app 등의 상대 import를 금지한다. 기존 서버 경계 규칙은 유지한다. 경로 alias는 현재 없으며 새 alias 도입 시 검사 확장이 필요하다. 권한 인증을 대신하지 않는다.
5. [이동 명세](../../specs/connection-navigation.md): controller의 이번 작업 성공 결과를 UI가 받아 /files로 이동한다. 실패/취소/기존 연결 복원/떠난 화면의 늦은 완료에는 이동하지 않는다.

실제 공통 사용처가 있는 SettingRow/ActionLink/StatusLabel/actionClasses, StatusNotice/MoaLoader와 CSS만 shared로 옮겼다. PreviewButton과 나머지 시안 전용 feedback은 prototypes에 남긴다. previewNotice도 실제 workspace CSS에서 분리했다. 새로운 패키지 의존성·barrel 계층·구경로 wrapper는 추가하지 않았다.

## 실패를 먼저 고정한 근거

- [boundary-red](boundary-red.txt): 구조 규칙 부재로 금지 import fixture가 실패.
- [import-red](import-red.txt): 새 규칙 적용 후 이전 제품→시안 import 13건이 실제 소스에서 실패.
- [navigation-red](navigation-red.txt): 성공/실패 boolean 계약 전 controller 검사 7개 실패.
- [s0-red](s0-red.txt): 기존 S0 probe에서 preview reader import 404. 명시적 allowlist와 JS import specifier 변환으로 수정했다. 임의 파일 서빙이나 본문 전역 치환은 하지 않는다.

분류 전 기존 단위111개·서버 경계21개·브라우저 경로69개 통과를 확인했다. 기존 동작을 잠근 후 목적별 이동/공통 CSS 분리를 진행했다.

## 이 단계의 검증

[check-final.txt](check-final.txt): 타입·lint·단위111개·서버 경계21개·구조 경계19개·production build43페이지 통과. 독립 구조 검토에서 102건 목적지 누락0/구경로 잔존0을 확인했다. 문서 경로 지적은 현재 ui/state/browser 경로로 수정했다.

브라우저: [연결 이동13](navigation/checks.json), [연결51](connection/browser-checks.json), [목록46](listing/browser-checks.json), [미리보기53](preview/checks.json), [화면69](after/screen-checks.json). 232는 확인·측정 기록 합계이며 독립 시나리오 232개가 아니다. 초기 목록 검사에서 ‘연결 후 설정 화면 유지’를 가정한 항목은 새 자동 이동 명세에 맞춰 실제 목록 1회 읽기로 수정했다.

`pnpm test:s0-graph`는 실제 S0 HTTP graph 9개 모듈과 브라우저 export 평가를 확인한다. 원본 파일·개인 폴더를 읽지 않는 격리 검사다. [실행 스크립트](../../../scripts/check-s0-module-graph.mjs).

[단계 종료 성능](performance-after.json)은 desktop 6경로×3회, 전체 정적 자산780,092 bytes다. 이전 미리보기 단계783,304 bytes와 차이는 있으나 파일 이동만의 성능 개선이라고 주장하지 않는다. 다음 기능을 포함한 최신 desktop/mobile·상호작용 측정은 [후속 성능](../file-selection-dialog/performance.md)을 따른다.

실제 OS picker·실제 로그인·스크린리더·전체 웹표준 인증은 미검증이다. 개발용 localhost 소유자와 읽기 전용/전송 금지 경계를 유지했다.
