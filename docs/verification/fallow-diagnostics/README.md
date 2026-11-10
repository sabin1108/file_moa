# Fallow Problems 진단 확인 — 2026-11-10

## 결론

현재 코드의 타입 검사·린트·빌드는 통과했다. Fallow의 정적 분석 후보를 컴파일 오류나 실제 기능 오류와 구분해야 한다. 760개를 없애기 위한 일괄 삭제·자동 수정·진단 숨김은 수행하지 않았다.

## 확인 조건과 결과

- 기준 커밋: `feb2fa4fd116bedaf869f333d8327ddf6d2ee2f1`. 시작 시 작업 트리는 깨끗했고 로컬 `origin/main`도 같은 SHA였다. 이번 확인에서 원격 상태를 새로 조회하지 않았다.
- 설치된 VS Code 확장과 관리 CLI: Fallow `3.41.0`.
- 실행: 관리된 `fallow.exe --format json --threads 2 --no-cache --no-type-aware`. 새 패키지나 도구를 설치하지 않았다.
- 원자료: `.omx/diagnostics/fallow-20261110/combined.json` (로컬 전용).
- 타입 검사 `pnpm typecheck`, 린트 `pnpm lint`, 프로덕션 빌드 `pnpm build` 모두 통과했다. 개발 서버는 검사 시작 시 3034/3035에서 수신 중이지 않았다.
- 빌드가 자동 변경한 `next-env.d.ts`의 개발용 타입 경로는 검사 전 상태로 되돌렸다.

| 분석 항목 | 개수 | 해석 |
| --- | ---: | --- |
| 미사용 파일 | 140 | 루트 테스트/스크립트 113개, 웹 테스트 fixture 25개, 제품 소스 2개 |
| 미사용 export | 64 | 외부 사용 여부에 대한 후보이며 함수 자체가 실행되지 않는다는 뜻은 아님 |
| 미사용 타입 | 10 | 참조와 공개 계약 확인 필요 |
| 미사용 클래스 멤버 | 26 | 동적 접근·테스트 사용 확인 필요 |
| 해결하지 못한 import | 16 | 문서 디자인 참조 4개, 테스트 코드 12개. 제품 소스 경로의 항목은 없었음 |
| 미등록 의존성 | 3 | 테스트/자료 생성 스크립트의 `@oai/artifact-tool`, `react`, `vite` |
| 중복 코드 | 194개 그룹, 504개 위치 | 테스트402개 위치, 제품 소스102개 위치. 중복만으로 공통화 승인이나 버그를 뜻하지 않음 |
| 복잡도 기준 초과 | 425개 함수 | 기본 기준을 넘은 정적 후보. 실행 실패나 보안 결함 수가 아님 |

미사용·참조 관련 합계는259개다. 중복504개 위치와 합하면763개지만, 편집기에서 보인760개와 동일한 집계라고 확정하지 않는다. 편집기 접근 승인이 시간 초과되어 실제 Problems 항목과 LSP 설정·표시 필터를 읽지 못했다. CLI 복잡도425개도 편집기760개에 더해 집계하지 않는다.

## 실제 코드로 확인한 분석 한계

1. `tests/browser/check-animation-replacement.mjs:40`은 HTML 문자열 안의 script URL로 `apps/web/tests/browser-fixtures/animation-replacement.tsx`를 불러온다. Fallow의 미사용 파일 목록에 해당 fixture가 있어도 이 실행 경로를 지우면 검증이 깨진다.
2. `tests/browser/check-source-folder-listing.mjs:17`의 `/folder-session.js`는 `tests/s0/probe-server.mjs`가 제공하는 테스트 서버 URL이다. 일반 디스크 import 기준의 unresolved 진단만으로 제품 import를 고치면 안 된다.
3. 미사용 파일로 나온 `apps/web/src/features/ai-records/services/record-recovery.ts`도 probe 서버가 제공한다. `tests/architecture/check-s0-module-graph.mjs`는 해당 endpoint를 검증한다. 제품 UI 연결 여부와 테스트용 실행 여부를 따로 판단해야 한다.
4. `record-codec.ts`의 `recordMarkdown`과 `form-config.ts`의 `resetSteps`는 같은 파일 내부에서 쓰인다. 여기서 unused export는 외부 공개 필요성에 대한 지적이다. 구현 삭제의 근거가 아니다.

## 수정 우선순위와 범위

먼저 테스트 진입점·HTML 문자열·테스트 서버 URL을 분석기가 어떻게 인식하는지 확인한 뒤 필요한 설정만 조정한다. 제품 소스의 실제 미사용 export와 컴포넌트는 호출자·테스트·명세를 확인해 별도 정리한다. 중복과 복잡도는 같은 변경 이유와 책임을 공유하는 부분만 검토한다.

이번 작업은 진단 확인이며 제품 코드와 Fallow 설정은 바꾸지 않았다. 현재 테스트 전체를 다시 실행하지 않았고, 타입·린트·빌드 통과가 소셜 로그인·실제 Windows 권한·물리 IME·AI 호출 검증을 대신하지 않는다. Fallow의 경계/정책 위반0은 해당 규칙이 설정되지 않아 측정하지 않은 결과다.

인수인계의 개발 서버 복구도 시도했으나 실행 전 자동 승인 검토에서 거절됐다. DB·외부 서비스 접근이 Fallow 진단 확인 범위를 넘는다는 사유다. 우회 실행하지 않았고 로컬 로그인·익명 세션 API 재확인은 수행하지 않았다.

후속: 사용자가 서버 복구와 어제 작업 재개를 승인한 뒤 개발 서버를 복구하고 폼6/6·세션 API200/null을 확인했다. [재개 검증](../resume-20261110/README.md)을 참고한다. 위 거절은 승인 전 실행 이력이다.
