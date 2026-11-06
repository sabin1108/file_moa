# 가입 입력·소셜 로그인·접근 제어 검증 — 2026-11-06

회원가입은 이름 → 이메일 → 비밀번호·확인을 한 장의 폼에 순차로 표시한다. 공통 `WorkflowStepper`는 표시만 재사용하며, 인증 단계/URL/입력 초안은 인증 기능이 소유한다. 종이 접힘 애니메이션은 포함하지 않는다.

메일 대기 화면에는 로그인으로 돌아가는 링크가 있고, 메일 인증을 완료하면 로그인 버튼을 표시한다. 로그인 성공은 `/` 작업 공간으로 이동한다. 비로그인 사용자의 작업 경로와 로그인 사용자의 가입/로그인 경로는 서버에서 차단한다.

## 읽는 순서

1. [명세](../../specs/auth-access-and-signup.md) → `features/auth/lib/signup-flow.ts` → `hooks/useSignupFlow.ts` → `components/SignupScreen.tsx`.
2. `server/session-guards.ts` → workspace layout → `SessionBoundary.tsx` → 기존 폴더 연결 세션. 서버가 검증한 user/workspace만 owner로 전달하며 기존 개발 IndexedDB는 자동 이관하지 않는다.
3. `server/social-providers.ts` → `auth-social.ts` → `auth-handler.ts` → app actions. 공급자와 목적지를 고정하고 새 소셜 가입은 명시적으로 선택한다. 같은 이메일 자동 계정 병합은 비활성화한다.
4. `server/auth-rate-limit.ts`와 추가 migration. 요청 키는 HMAC으로 저장하며 원자적 SQL로 인스턴스 간 요청 제한을 공유한다. 원문 IP는 저장하지 않는다.

## 실행한 검사

- `pnpm check`: 72파일/679테스트, Prisma 검증·생성, 타입·린트·서버 경계21·구조 검사·production build 통과.
- `pnpm test:database -- --ui`: 폐기형 PostgreSQL 상위25개 검사, 내부 통합30개, 격리 Chromium UI65개 통과. 이 수치는 서로 다른 검사 단위이다.
- UI: 390/768/1440/1920px, 공식 소셜 이미지 로딩, 이름 Enter·이메일 blur·합성 IME, 순차 표시, F5/앞뒤 이동/새 탭 복원, 비밀번호 비보존, 메일 대기/인증 완료 로그인 버튼, 실제 쿠키 로그인/로그아웃/재설정, guest/private redirect, console 오류0. [실행 결과](browser/checks.json).
- OAuth: 실제 Better Auth/Prisma/PostgreSQL과 합성 외부 HTTP를 사용했다. 세 공급자 시작·고정 callback·Google PKCE, 변경된 state, Kakao 명시 가입·재전송·같은 이메일 충돌·이메일 누락/미확인·토큰 암호화를 확인했다. 실제 공급자 콘솔/사용자 계정 검증을 뜻하지 않는다.
- SDK의 `encryptOAuthTokens`가 ID 토큰까지 암호화하지 않는 것을 추가 실패 회귀로 확인했다. 콜백 검증 뒤 필요 없는 ID 토큰은 account 생성/갱신 시 저장하지 않으며 access/refresh 토큰 암호화는 유지한다. 가입 후 재로그인 갱신에서도 ID 토큰이 남지 않는지 검사한다.
- 실제 Supabase에는 추가 limiter 테이블 migration을 적용하고 TLS 검증·runtime 권한·공개 API 역할 접근 거부를 확인했다. 기존 회원/폴더 데이터는 변경하지 않았다.
- 변경 파일의 실제 로컬 환경 비밀값과 DB 비밀번호 대조0건. `.env.local`, 생성 Prisma Client, 임시 진단 스크립트는 Git 제외를 확인했다.

## 운영 설정과 남은 검증

배포별 Vercel 주소의 Origin과 정식 `BETTER_AUTH_URL` 차이가 403을 만드는 것을 실제 비회원 로그인 요청으로 확인했다. production GET/HEAD는 정식 주소로 이동하고 다른 호스트의 POST는 본문을 전달하지 않고 거부한다. 허용 origin을 넓히지 않았다. 오류 진단은 허용된 오류 코드와 메일 공급자 상태만 기록한다.

사용자는 Vercel Production의 `RESEND_API_KEY`·`EMAIL_FROM`을 로컬 성공 값과 맞췄다고 확인했다. 이후 Dashboard 값에도 `.env` 문법의 큰따옴표를 붙였다고 확인했고, 앞뒤 따옴표를 제거해 저장했다. Dashboard에는 원문 키를 넣으며 실제 `.env.local` 파일의 따옴표는 정상 구분자다. 새 환경값은 신규 배포부터 반영한다. 보내기 전용 Resend 키로 메일 목록 조회가 거부되는 것은 키 무효의 증거가 아니다. 기본 sender의 수신자 제한과 공개 발신 도메인 인증은 별도다.

실제 로컬 코드에서 기존 본인 계정의 인증메일을 요청해 앱200·Resend200·요청 수신자 일치를 확인했다. 사용자가 Gmail 스팸함에서 인증메일 수신을 확인했다. 이 검사는 계정을 생성하거나 비밀번호를 변경하지 않았다. 운영 사이트의 수정된 환경으로 보내는 메일 수신은 별도 확인한다.

## 후속 사용성 수정

사용자는 공통 Stepper 재사용 여부, Tab이 새 입력을 건너뛰는 문제, 입력 등장 시 깜빡임, 비밀번호 보기와 인증 대기의 불필요한 가입 복귀 링크를 지적했다. Stepper는 기존 컴포넌트를 계속 직접 사용한다. Tab은 유효한 필드에서 다음 입력으로 초점을 직접 연결하며 일반 클릭 blur와 구분한다. 폼 상단을 고정하고 새 필드 높이/불투명도만 240ms로 전환한다. reduced motion은 전환을 끈다. 비밀번호 보기는 input type만 바꾸며 값·저장·전송을 변경하지 않는다. 대기 화면의 가입 입력 복귀 링크를 제거했다.

후속 `pnpm check` 679개와 production build, 폐기형 DB 상위25/통합30, 갱신 브라우저71개 통과. 새 검사는 이름 Tab→이메일·이메일 Tab→비밀번호의 실제 초점, 제목 위치 고정, reduced motion, 비밀번호 보기/숨기기와 값 보존, 대기 화면 가입 링크 부재를 포함한다. 이전65개 결과와 구분한다. 새 UI의 느낌은 실제 사용자의 후속 확인이 필요하다.

소셜 콘솔에는 정식 origin의 `/api/auth/callback/google`, `/api/auth/callback/naver`, `/api/auth/callback/kakao`를 등록해야 한다. 실제 콘솔 설정과 외부 Google/Naver/Kakao 로그인 완료는 미검증이다. Naver는 SDK가 이메일 소유 확인을 보장하지 않아 앱 메일 인증 후에만 세션을 허용한다. 명시 계정 연결 UI는 구현 범위에 없다.

물리 IME/Windows 폴더 권한창, 실제 사용자 INP·운영 부하, 새 인증 조건의 전체 성능 비교와 다른 탭의 실제 폴더 작업 중 계정 전환은 아직 별도 검증이 필요하다. 기존 서비스의 owner/stale 작업 단위 테스트 결과를 물리 파일 쓰기의 롤백 보장으로 확대하지 않는다.
