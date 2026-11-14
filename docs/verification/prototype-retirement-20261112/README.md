# 이전 시안 실행 경로 정리 — 2026-11-12

## 결과와 범위

사용자가 운영에 필요 없는 이전 프리뷰·시안을 제거하도록 위임하고 실제 데모와 이후 개선 가능성을 유지하도록 요청했다. 준비한 계획을 이번 작업에 한해 일반 코드 검토·회귀 검증 절차로 실행하는 예외도 명시적으로 허용했다. Ralplan의 미완료 host gate나 Critic 승인을 완료로 바꾸지 않았다.

기준 HEAD는 `1c72e57fc7403591f12a7586f2c779efbb1874d5`다. 앞선 안정화의 테스트·문서 변경은 보존했다. 커밋·푸시·배포와 의존성 추가는 수행하지 않았다.

| 정리 대상 | 결과 |
| --- | --- |
| `apps/web/src/prototypes` | 합성 시안 소스·CSS·안내 65개 파일 제거 |
| `apps/web/src/app/preview` | 이전 실행 경로 4개 파일 제거, 대표 경로 3개 HTTP 404 확인 |
| `UnavailableFeature.tsx` | 호출자가 없던 초기 미구현 안내 1개 제거 |
| 이전 시안 전용 검사·fixture | 8개 파일 제거 |
| root 하이드레이션 검사 | 검사·fixture 2개 파일을 `check-root-hydration.mjs`·`root-hydrate.tsx`로 이관 |
| 실제 공통 표시 | AuthShell의 시안 분기, 메뉴의 시안 링크와 미사용 CSS만 정리 |
| 설정·구조·기존 검사 | preview 헤더와 구조 예외 제거, 혼합 검사의 실제 경로 유지, 현재 문서 안내 갱신 |

불필요 파일 삭제는 78개이며 이관한 이전 파일 2개는 이 숫자에 더하지 않는다. 정확한 경로·작업 전 hash·기존 수정 기준선은 로컬 `.omx/plans/prototype-retirement-20261112/manifest.json`에 보존한다. 삭제 예정 78개가 모두 없고 이전 소스·경로 디렉터리도 제거됐음을 확인했다.

`/demo`와 sample-workspace, `/start`·`/demo/intro`의 스크롤 및 이동 타이밍, 실제 MD/TXT·PDF 원문 미리보기, 인증·연결·쓰기·보존·복구 구현은 유지했다. 과거 디자인 캡처와 결정 기록도 보존하며 현재 실행 안내와 구분했다.

## 검증

삭제 전 보존 계약은 10개 파일 78개 테스트로 고정했다. 삭제 후에는 관련 8개 파일 68개 테스트를 먼저 실행하고 전체 검사로 확인했다. 반복 실행을 고유 테스트 개수에 더하지 않는다.

| 새 실행 | 결과와 해석 |
| --- | --- |
| `pnpm check` | Prisma schema·타입·린트·154개 파일 1,332개 테스트·서버 경계 26개·구조 24+6+3개·production build 통과 |
| 최종 `pnpm typecheck` | 빌드가 바꾼 next-env의 개발 타입 경로를 원복한 상태에서도 통과 |
| `pnpm test:s0-graph` | 동적 테스트 서버의 168개 모듈과 브라우저 export 확인 |
| 새 root 하이드레이션 | 실제 RootLayout·OnboardingPage의 깨끗한 HTML은 경고 없음. 외부 html 속성을 주입하면 예상한 경고 재현 |
| `check-sample-workspace.mjs` | 43개 통과. 소개 경유·파일 선택/원문·검토/새로고침·폭별 표시·익명 보호·이전 경로 404 포함 |
| `check-live-screens.mjs` | 40개 통과. 비로그인 `/`·`/files`·`/settings`의 로그인 이동, 실제 로그인/가입 화면, 1440/1920/768/390px 가로 넘침 없음, Tab 이동, 브라우저 예외 없음 |
| Ego 실제 브라우저 | 소개→데모 진입·데스크톱 화면 확인. 기존 로그인 세션의 실제 홈에서 이전 시안 링크 0개 확인. 공개 소개 390px 가로 넘침 없음 |
| 정적·문법 확인 | 변경한 스크립트 문법, `git diff --check` 통과. 제품에서 제거한 시안 import 없음 |

새 원자료와 화면은 `.omx/verification/prototype-retirement-20261112/`에 있다. 기존 캡처를 덮어쓰지 않았다. 하이드레이션은 `hydration-deduped/hydration-checks.json`, 데모는 `demo/checks.json`, 실제 익명 화면은 `live-retry/screen-checks.json`, Ego는 `ego-checks.json`이 최종 결과다.

하이드레이션 이관 첫 실행에서 실제 hook을 사용하는 온보딩이 검사 도구의 React 중복 로딩을 드러냈다. Vite의 React dedupe와 사전 dependency 준비로 수정했으며 제품 hook을 변경하지 않았다. 익명 화면 검사 첫 실행은 CDP의 `Page.enable`에서 검사 시작 전에 멈췄다. 프로젝트의 다른 검사와 같은 GPU 비활성 옵션으로 재실행해 40개를 통과했으며 첫 실패는 보존한다.

독립 Architect 검토에서 제품 제거 범위의 차단 문제는 발견하지 못했고 오래된 폴더 연결 브라우저 검사 안내를 지적했다. 해당 검사는 인증 fixture 전환 전 보류로 표시하고 활성 실행 예시에서 뺐다. 이는 Critic 승인이나 Ralplan host receipt를 뜻하지 않는다.

## 정적 분석과 남은 범위

Fallow 3.42.0의 새 무캐시 분석은 미사용·참조 후보 272개를 보고했다. 미사용 파일 134개 중 제품 소스는 동적 S0 복구 검사가 사용하는 `record-recovery.ts` 1개이며 나머지는 검증 도구·fixture다. unresolved import 17개는 문서 자료와 테스트 서버 URL이며 제품 소스 항목은 0개다. 사용하지 않는 export 83개·타입 9개·클래스 멤버 26개·미등록 의존성 3개도 남았다. 후보를 없애기 위한 일괄 삭제나 억제 설정을 추가하지 않았다. JSON 모드 exit 0을 진단 0개로 해석하지 않는다.

화면 probe의 대비·넓은 빈 공간 후보 25개는 별도 관찰값이며 전체 접근성 통과나 새 디자인 승인으로 보고하지 않는다. 기존 디자인을 보존했고 실제 화면을 확인했다.

Docker daemon이 실행 중이지 않아 격리 DB·인증 폼 제출·쿠키 전 과정은 이번에 재실행하지 못했다. 기존 폴더 연결 직접 경로 브라우저 검사는 현재 인증 fixture가 없어 보류했다. 늦은 picker·종료·소유자 변경은 전체 테스트에 포함된 controller/session 검사로 확인했다. 실제 OS 폴더 권한창·물리 기기·IME·Safari/Firefox·OAuth·유료 AI 호출은 확인하지 않았다. 개인 폴더 재연결·내용 읽기·실제 계정 폼 제출·쿠키 삭제도 하지 않았다.

앞선 [안정화·실제 60분 관찰](../stabilization-20261112/README.md)의 메모리 원인 미확정은 그대로 남아 있으며, 이번 정리를 그 문제의 해결로 주장하지 않는다.
