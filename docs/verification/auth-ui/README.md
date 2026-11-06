# 이메일 인증 화면 연결 검증 — 2026-11-06

사용자 요청은 기존 템플릿·프로토타입 참고, 특히 Stepper 재사용 우선이다. 공통 Stepper를 복제하거나 파일 workflow 상태를 인증 기능으로 가져오지 않았다.

## 배포 회귀 보정 — 계정 화면 요청 경계

Vercel에서 `/account`의 사전 렌더링 중 DB 설정 초기화가 실행되는 오류를 확인했다. 기존 표현식은 `await headers()`보다 메서드 수신자인 `getAuth()`를 먼저 평가했다. 요청 헤더를 먼저 기다린 뒤 인증을 초기화하도록 순서만 수정했다.

요청 헤더가 사전 렌더링을 중단할 때 인증을 초기화하지 않는 회귀 테스트가 수정 전 실패했고, 수정 후 요청 시 설정 오류 보존·무세션 redirect까지3개가 통과했다. 전체 검사는64파일/623테스트·타입/린트/경계·47페이지 build 통과다. 유효하지 않은 합성 관리자 `DATABASE_URL`을 주입한 상태에서도 build는 통과하고 `/account`는 동적 경로로 분류됐다. runtime의 제한 역할·TLS 검증은 변경하지 않았다. 운영 DB URL은 별도 설정이며 사용자가 검증된 로컬 앱 전용 값으로 교체 완료했다고 확인했다.

## 읽는 순서

1. [공통 WorkflowStepper](../../../apps/web/src/components/ui/WorkflowStepper.tsx)·CSS: 기존 파일 작업과 같은 표시 컴포넌트. 이번 단위에서 변경하지 않았다.
2. [인증 단계/폼 데이터](../../../apps/web/src/features/auth/lib/form-config.ts) → [실제 인증 화면](../../../apps/web/src/features/auth/components/AuthScreen.tsx): 데이터만 바꿔 가입·재설정에 같은 Stepper를 직접 렌더링한다. URL은 표시 선택이고 서버 결과가 완료를 결정한다.
3. [공통 AuthShell](../../../apps/web/src/components/layout/AuthShell.tsx)·CSS: 기존 인증 시안의 표시를 실제 화면·시안이 공유한다. 실제 경로는 prototype을 import하지 않고 시안 안내는 preview 전용이다.
4. [Server Actions](../../../apps/web/src/app/actions/auth.ts) → [서버 폼 처리](../../../apps/web/src/server/auth-forms.ts) → 기존 인증 handler: 입력/확인 비밀번호 검증, 고정 callback, 원래 Origin/IP 전달, 비밀 없는 오류 상태, 응답 쿠키 반영과 catch 밖 redirect.
5. [입력 초안](../../../apps/web/src/features/auth/hooks/useAuthDraft.ts)·[순수 파서](../../../apps/web/src/features/auth/lib/draft.ts): 이름·이메일만 보존하며 저장소 차단 시 메모리 입력으로 계속한다. signout에서 초안을 비운다. 비밀번호·token·서버 응답은 저장하지 않는다.
6. [화면 명세](../../specs/auth-ui.md), [Server Action 검사](../../../apps/web/tests/server/auth-actions.test.ts)·[폼 검사](../../../apps/web/tests/server/auth-forms.test.ts)·[단계/초안 검사](../../../apps/web/tests/auth/flow.test.ts), [독립 브라우저](../../../tests/browser/check-auth-ui.mjs).

## 실제 경로와 범위

- `/login` → 이메일·비밀번호 → 실제 세션 쿠키 → `/account`. 계정 화면은 서버 세션/이메일 확인을 다시 검사하고 로그아웃을 제공한다. 기존 개발용 로컬 폴더는 자동 연결하지 않는다.
- `/welcome` → 가입 정보 → `/welcome?step=verification`. 정보 입력/안내는 새로고침·뒤로/앞으로로 복원하지만 제출을 자동 반복하지 않는다. `?step=complete`는 완료를 만들지 못한다.
- 인증 메일은 동일 Better Auth token을 `/verify-email` 확인 폼으로 전달한다. 명시적으로 확인한 서버 성공 뒤만 완료 Stepper를 표시한다. 가입·확인으로 자동 로그인하지 않는다.
- `/forgot-password` → 기존 API callback → `/reset-password` → 새 비밀번호 확인/변경 → 로그인. token은 화면 메모리/hidden 제출에만 사용하고 진입 후 URL에서 지운다. 이 후 새로고침은 새 링크 안내로 닫힌다.
- Server Action은 자기 HTTP API에 fetch하지 않고 동일 프로세스의 handler를 호출해 Origin/CSRF·요청 제한을 유지한다. 설치된 `nextCookies`는 router 경로를 생략하므로 공개 `parseSetCookieHeader`/`toCookieOptions`를 사용해 Next cookie store에 명시적으로 반영한다.
- app은 action을 prop으로 전달하고 server와 feature는 `shared/auth-contract.ts`만 공유한다. 기존 구조 검사의 app 진입점 정의에 프로젝트가 원래 허용한 `app/actions/*.ts`를 추가했으며 일반 feature→app/server→feature 금지는 유지했다.

## 실행 증거

- 최초 서버 폼 검사 모듈 부재 실패 확인 후 구현. 최종 `pnpm check`:63파일/620테스트, Prisma validate/generate, 타입, lint, 서버 경계21, 구조 검사, 47개 페이지 생성과 인증 동적 경로 build 통과.
- `pnpm test:database -- --ui`:기존 SQL24 + 통합 suite1, 상위25개 검사 통과. 내부 실제 driver/이메일 통합20개와 별도 브라우저44개를 단위가 다른 숫자로 구분한다.
- 실제 production Next 빌드 복사본·자체 CA PostgreSQL·합성 메일 수신기·독립 Chromium을 사용했다. production DB client의 `rejectUnauthorized:true`/호스트 검증은 유지했고 Supabase 인증서·실제 환경 파일을 교체하지 않았다.
- 브라우저44검사:390/768/1440/1920px의 6화면 포함/단일 제목, 단계 위조 거부, 이름/이메일 복원·비밀번호 비보존, 서버 불일치 오류, 단계/F5/뒤로/앞으로, token URL 정리, 서버 검증 완료, 실제 HttpOnly 로그인·계정 새로고침·로그아웃 재진입 차단, 재설정/이전 비밀번호 거부/새 비밀번호 로그인, Tab 이동·합성 IME Enter·저장소 차단 입력·console 오류0.
- [최종 체크/BUILD_ID](browser/checks.json)와 `browser/*.png`에 실제 자료를 기록했다. 물리 키보드/IME나 실제 회원 메일을 사용한 전체 UI 검증으로 표현하지 않는다.
- 독립 코드/계약 검토:공통 Stepper 직접 재사용, 파일 URL 훅 격리, app composition/shared contract, 수동 쿠키 옵션·catch 밖 redirect·인증 handler 보호 유지에 추가 차단 이슈 없음.
- [성능 비교](performance.md):기존6경로·2폭·3회 전후와 새 인증 화면의 별도 기준선을 기록한다. 인증 화면이 새 기능으로 바뀐 차이를 최적화 효과로 표현하지 않는다.

## 실패·보정 기록

- 처음 feature가 app action/server가 feature 타입을 직접 참조해 구조 lint가 실패했다. app에서 action을 주입하고 중립 타입을 shared로 옮겨 경계를 복구했다.
- Windows 빌드 복사의 일반 symlink가 EPERM으로 실패해 독립 test app의 runtime 패키지에만 junction을 사용했다. 대상은 저장소 아래인지 확인하며 정리 전에 링크만 unlink한다. TLS는 끄지 않았다.
- 테스트의 `Object.defineProperty(window,...)` 반환값을 CDP가 직렬화하다 참조 길이 오류가 나서 반환하지 않게 보정했다. 실제 저장소 차단 입력은 이어진 검사에서 통과했다.
- 불필요한 계정 메뉴 제거 중 타입이 이미 좁혀진 조건을 다시 비교한 TS 오류를 제거했다. 최종 타입·린트·build를 다시 통과했다.

## 재현·남은 범위

```powershell
pnpm check
pnpm test:database -- --ui
pnpm start
```

사용자 확인 주소는 `http://127.0.0.1:3034/login`, `/welcome`, `/forgot-password`다. 해당 origin을 유지하며 실제 계정/비밀번호·원격 DB 스키마/env·개인 폴더/보관함·휴지통·미저장 편집본을 변경하지 않았다. TLS/Next fixture와 브라우저는 검사 후 정리한다. 사용자 확인용3034 서버는 유지한다.

소셜 로그인·명시 계정연결, 실제 계정의 로컬 폴더 owner 전환/다른 탭 격리, 물리 IME/실사용 INP, 운영 공유 limiter·공개 메일 도메인·Supabase SSL enforcement·Vercel 환경/배포는 후속이다. 이전 Gmail 본인 수신 확인을 이번 신규 UI 실회원 계정 시험으로 확대하지 않는다. commit/push/배포 없음.
