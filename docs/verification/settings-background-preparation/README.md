# 메인 화면 응답 이후 설정 캐시 준비

2026-11-08, 요구172. 초기 설정 준비 때문에 메인 화면까지 기다리는 문제를 줄인다. 로그인·작업 공간 권한 확인은 유지하고, 설정 표시 자료만 응답 이후 준비한다.

## 변경과 선택 이유

`apps/web/src/app/(workspace)/layout.tsx`의 `await prepareSettingsDisplay(await headers())`를 요청 headers 읽기와 `after(() => prepareSettingsDisplay(requestHeaders))`로 바꿨다. `after`는 응답 이후의 서버 작업 수명을 Next가 관리하므로 기다리지 않는 Promise를 임의로 실행하는 방식을 추가하지 않는다.

headers는 렌더 중 읽어 콜백에 전달한다. Server Component의 after 안에서 headers를 새로 호출하지 않는다. 기존 세션 검사·사용자와 로그인별 Next 캐시·DTO·태그 갱신·실패 처리를 그대로 사용한다. 캐시가 아직 없으면 설정 page가 기존 reader로 조회한다. 준비와 설정 진입이 겹칠 때 조회 중복이나 대기가 없다고 보장하지 않는다.

기존 AuthScreen의 PageLoading/MoaLoader와 reduced-motion 처리는 유지한다. 인위적인 최소 대기 시간, 새 타이머, 프로필 표시 기능과 별도 클라이언트 캐시는 추가하지 않았다. 메인 화면의 실제 사용은 캐시 준비 완료와 분리된다.

공식 근거: [after](https://nextjs.org/docs/app/api-reference/functions/after). 후속 작업은 배포 환경의 최대 실행 시간 제한을 받으며 영구 실행을 보장하는 큐가 아니다.

## 검증

- TDD: 새 workspace-preparation 검사에서 변경 전 응답 후 작업 등록과 느린 준비 분리 두 항목 실패, 로그인 거부 한 항목 통과를 확인했다. 변경 후 세 항목 모두 통과했다.
- 집중 검사: workspace 준비·실제 Next Data Cache·표시 캐시 실패·세션 guard 4파일23개 통과. 실제 Data Cache 테스트의 DB와 인증은 합성 자료다.
- 전체 단위: 114파일1,091개 통과. 실제 AI 호출은 하지 않는다.
- 타입 검사·린트·production 빌드·서버 경계21·구조25+6+3 통과.
- production 브라우저: 별도 Chromium 프로필에서 비로그인 메인·파일·설정의 로그인 보호, 샘플 설정 보존·URL 뒤로 이동, 390/768/1440/1920px 넘침과 브라우저 예외 12검사 통과. [결과](browser-checks.json). AI 키를 빈 값으로 덮어쓰고 공개 샘플 AI를 끈 별도 3035 서버를 사용했다. 사용자 쿠키를 가져오지 않았다.
- 재현 단위 명령: `pnpm exec vitest run apps/web/tests/server/workspace-preparation.test.tsx apps/web/tests/server/settings-display.test.ts apps/web/tests/server/settings-display-runtime.test.ts apps/web/tests/server/session-guards.test.ts`.
- 브라우저는 기존 `tests/browser/check-settings-display-cache.mjs`를 재사용한 임시 실행본으로 결과 경로와 비로그인 두 경로만 추가했다. 실행본은 `.omx/settings-background/check-ui.mjs`에 있다.

## 성능과 한계

| 항목 | 변경 전 | 변경 후 |
| --- | ---: | ---: |
| production build ID | rw8jPzJJbDAQWv1Jh2vIK | neIH_vRo2GHv1aFXCr1dx |
| 전체 정적 JS/CSS | 1,701,044 bytes | 1,701,044 bytes |
| JS/CSS 파일 수 | 42 | 42 |

클라이언트 자산 증가는 0 bytes다. 이 숫자는 실제 전송량이나 화면 진입 지연이 아니다. 새 검사는 서버 작업 등록과 응답 반환 분리의 증거이며 실제 계정에서의 화면 준비 시간·후속 작업 완료·Vercel 실행을 측정하지 않았다. 사이트 전체 경로 지연·네트워크·메모리·실사용 INP·물리 IME도 재측정하지 않았다. 기존 애니메이션 CSS와 화면 배치는 수정하지 않았다.

이전 [사용자 실측](../settings-cache-timing/measurement-20261108-v2/report.md)의 초기 준비 중앙값2.264초는 변경 전 blocking 구현의 기록이다. 그 시간을 그대로 이번 개선량으로 빼거나 새 버전도 반복56.2% 개선이라고 주장하지 않는다. 기존 측정 도구는 역사적 blocking 비교를 복원하도록 조정해 원자료와 비교 조건을 보존했다. 새 실제 계정 측정은 별도로 해야 한다.
