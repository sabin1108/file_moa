# 검증 코드 안내

이 폴더는 제품 소스가 아니다. 기능 코드만 읽을 때는 apps/web/src/README.md부터 읽고 이 폴더는 접어두어도 된다.

| 위치 | 책임 |
| --- | --- |
| architecture | 실제 ESLint 설정을 통한 server/feature 경계 및 app/테스트 배치 검사, S0 모듈 graph |
| browser | 실제 경로·연결·목록·본문·다중 선택·팝업의 CDP 회귀 |
| fixtures | 개인정보 없는 합성 폴더/권한/실패 주입. 제품에서 import 금지 |
| database | 임시 PostgreSQL의 SQL/Prisma/인증 adapter 통합 검사와 별도 opt-in 실환경 읽기 전용 검사 |
| performance | 경로별 측정과 Lighthouse 실행 |
| s0 | 독립 저장/복구/연결 probe. 앱에 연결되지 않은 검증 도구이며 원본 제품 기능과 구분 |

단위 테스트는 각 패키지의 tests에 둔다. apps/web/tests는 local-folders·conversation-workspace·ai-records·auth·sample-workspace·server 등 기능과 하위 책임으로 나누며, 순수 도메인 규칙은 packages/domain/tests에 둔다. S0의 *.test.mjs도 pnpm test에서 함께 실행한다. 실행 결과·화면·측정값은 docs/verification에 보관하며 테스트 코드 폴더와 구분한다.

서버 단위 테스트는 `apps/web/tests/server`의 auth/chat/ai/demo/organization/settings/database 하위 폴더에 둔다. 실제 DB의 `*.checks.ts`는 일반 실행에서 제외하고 `pnpm test:database`가 격리 DB를 만든 뒤 전용 config로 실행한다. 실환경 검사 명령은 [DB 검증 기록](../docs/verification/auth-database/README.md)에 분리했다.

메일 실발송 검사는 `tests/mail/vitest.live.config.mts`로 별도 실행한다. 실제 `.env.local`을 읽고 `MOA_MAIL_TEST_RECIPIENT`에 명시적으로 허용된 수신자가 있을 때 테스트 안내 메일 두 통을 전송한다. 일반 테스트/DB 검사에서는 실행하지 않는다. 공급자의 접수와 실제 메일함 수신은 별도로 확인한다.

`pnpm test:database -- --ui`는 추가로 임시 DB에 자체 TLS 인증서를 적용하고, 독립 빌드 복사본·합성 메일 수신기·독립 Chromium에서 실제 인증 폼/Server Action/쿠키를 검사한다. 기존 Supabase CA/환경 파일은 교체하지 않는다. OpenSSL이 필요하며 Windows에서는 기존 Git OpenSSL 또는 OPENSSL_PATH를 사용한다. 일반 DB 검사는 이 추가 조건이 없다.

2026-11-12: 제거한 `/preview` 전용 캡처·검사·fixture는 함께 정리했다. 실제 인증·폴더 수명·원본 보호·복구·데모 검사는 유지한다. 이전 시안의 하이드레이션 검사는 실제 root layout과 온보딩을 렌더하는 `check-root-hydration.mjs`로 옮겼으며 새 출력 폴더를 사용한다. `check-live-screens.mjs`는 비로그인 방문자의 실제 인증 이동·반응형·키보드를 검사하고, 로그인 뒤 동작은 격리 DB의 인증 UI 검사에서 확인한다.

```powershell
pnpm exec node tests/browser/check-root-hydration.mjs .omx/verification/root-hydration
pnpm exec node tests/browser/check-sample-workspace.mjs http://127.0.0.1:3034 .omx/verification/sample-workspace
pnpm exec node tests/browser/check-live-screens.mjs http://127.0.0.1:3034 .omx/verification/live-workspace
```

아래는 이전 구현 단계의 직접 경로 검사 명령이다. 현재 인증이 필요한 작업 경로는 별도 로그인 fixture가 필요하며 그대로 실행한 결과를 현재 회귀 통과로 세지 않는다. 특히 `check-settings-folder-connection.mjs`는 인증 fixture 전환 전까지 보류한다. 늦은 picker·연결 종료·소유자 변경 규칙은 `source-connection-controller.test.ts`와 `connection-session.test.ts`에서 계속 검사한다.

```powershell
pnpm check
pnpm exec node tests/browser/check-destination-picker.mjs http://127.0.0.1:3010 docs/verification/plan-destination-picker/new-run
pnpm exec node tests/browser/check-file-browser-navigation.mjs http://127.0.0.1:3010 docs/verification/file-browser-navigation/new-run
pnpm exec node tests/browser/check-file-name-search.mjs http://127.0.0.1:3010 docs/verification/file-name-search/new-run
pnpm exec node tests/browser/check-file-change-plan.mjs http://127.0.0.1:3010 docs/verification/file-change-plan/new-run
pnpm test:s0-graph
pnpm exec tsc --noEmit -p tests/s0/tsconfig.json
pnpm exec node tests/browser/check-file-selection-dialog.mjs http://127.0.0.1:3010 docs/verification/readable-structure/browser
pnpm exec node tests/browser/check-source-file-preview.mjs http://127.0.0.1:3010 docs/verification/readable-structure/preview
pnpm exec node tests/browser/check-source-folder-browser.mjs http://127.0.0.1:3010 docs/verification/readable-structure/listing
pnpm exec node tests/browser/check-connection-navigation.mjs http://127.0.0.1:3010 docs/verification/readable-structure/navigation
```

직접 경로 브라우저 검사는 로컬 production 서버를 사용하며, Vite fixture 검사는 자체 격리 서버를 연다. 격리 프로필/합성 OPFS만 사용하며 개인 자료를 선택하지 않는다. 실제 OS 권한창·로그인을 검증한 것으로 보고하지 않는다. 재실행은 다른 출력 경로를 주어 과거 원자료를 보존한다.

`tests/architecture/check-file-plan-mutations.mjs`는 계획 충돌/취소 규칙 두 곳을 한 번씩 의도적으로 깨뜨려 테스트가 실패하는지 확인하고 원본 바이트를 finally에서 복구하는 별도 검증이다. 소스 편집·빌드와 동시에 실행하지 않는다. 일반 `pnpm check`에는 포함하지 않는다.
