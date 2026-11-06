# 인증 DB 스키마·권한 SQL 검증

2026-11-06 후속: 로그인·가입·확인·재설정·계정 화면과 Server Actions를 연결했다. 동일 공통 Stepper와 인증 시안 표시를 재사용하며 [인증 UI 검증](../auth-ui/README.md)에 쿠키/실브라우저/TLS/성능 증거를 분리했다. 아래 “로그인 화면 후속”은 당시 범위다. 개발용 폴더 owner 전환·소셜은 여전히 후속이다.

### 실메일 보충 — 2026-11-06 Resend 가입 주소 확인 후 접수 성공

사용자 후속 확인(2026-11-06): Gmail로 실제 메일이 도착했음을 확인했다. 아래의 “메일함 도착 미확인”은 사용자 확인 전 상태이며, 가입 본인 Gmail의 발송/수신 테스트는 완료다. 네이버 등 다른 수신자까지 검증한 것은 아니다.

아래 403은 최초 지정 수신자가 Resend 가입 주소와 달랐던 당시 결과다. 사용자가 현재 Resend 가입 본인 Gmail 주소를 확인한 뒤, 같은 전송 코드로 인증/재설정 테스트 안내 두 통의 Resend 접수를 확인했다. 별도 live 검사1개 통과. 실제 계정/비밀번호 변경은 없고, API 접수와 메일함 도착은 구분한다. 기본 `onboarding@resend.dev` sender는 여전히 가입 본인 주소만 허용하므로 네이버 등 다른 수신자와 공개 회원을 위해서는 소유 발신 도메인 인증이 필요하다. 실제 수신 주소/키는 코드·이 문서에 저장하지 않는다.

## 2026-11-06 이메일 가입·로그인·확인·재설정 API

이 절은 바로 아래 서버 기반 연결 이후의 추가 결과다. 로그인 화면·소셜 인증·브라우저 owner 연결·운영 배포는 후속이다.

### 읽을 코드와 실제 책임

1. [인증 설정](../../../apps/web/src/server/auth.ts): Better Auth의 이메일/비밀번호·인증 전 로그인 금지·가입 후 자동 로그인 금지·1시간 이메일확인·30분 재설정·세션 폐기를 구성한다. 기존 Prisma adapter를 사용하며 의존성을 추가하지 않았다.
2. [메일 전송](../../../apps/web/src/server/auth-mail.ts): 서버 발신자/수신자 검증, Resend HTTP, 전송별 HMAC 멱등 키, 제한 시간, 비밀을 포함하지 않는 오류/운영 로그. 별도 메일 SDK·커스텀 비밀번호 해시·토큰 테이블을 추가하지 않았다.
3. [프로토콜 경계](../../../apps/web/src/server/auth-handler.ts)와 [Next route](../../../apps/web/src/app/api/auth/%5B...all%5D/route.ts): 이메일 프로토콜에 필요한 GET/POST만 허용하고 세션 token/IP/userAgent를 JSON에서 제거한다. HttpOnly 쿠키와 redirect를 보존하고 no-store/no-referrer를 설정한다. 원인 오류는 일반적인 503 응답으로 제한한다.
4. [Workspace](../../../apps/web/src/server/workspace.ts): 실제 세션과 이메일 확인을 모두 요구한다. 기존 development-local 연결은 교체하거나 이관하지 않았다.
5. [전송 단위 검사](../../../apps/web/tests/server/auth-mail.test.ts), [HTTP 경계 검사](../../../apps/web/tests/server/auth-handler.test.ts), [이메일 실DB 검사](../../../apps/web/tests/server/auth-email.checks.ts), [기존 DB 통합 검사](../../../apps/web/tests/server/database-runtime.checks.ts).

### 보호 규칙과 라이브러리 계약

- `requireEmailVerification`, 자동 로그인 비활성화, 12~128자 비밀번호, `revokeSessionsOnPasswordReset`을 명시했다. [Better Auth 이메일 인증](https://better-auth.com/docs/authentication/email-password).
- 이메일확인 JWT는 만료·서명·사용자 바인딩으로 보호한다. 확인된 링크 재클릭은 로그인 없는 멱등 성공이다. DB에 저장하는 재설정 identifier는 해시하며, 재설정은 토큰 소비·비밀번호 변경·세션 폐기가 같은 transaction에서 처리된다. 이메일 확인 링크까지 1회 소비된다고 표현하지 않는다.
- IP 추적을 완전히 끄면 HTTP limiter도 꺼지는 실제 라이브러리 동작을 확인했다. 제한을 켜고 Vercel 전용 `x-vercel-forwarded-for` 헤더를 사용하되 세션 생성 hook에서 IP/userAgent 저장은 제거한다. [Better Auth 옵션](https://better-auth.com/docs/reference/options), [Vercel 헤더](https://vercel.com/docs/headers/request-headers).
- `disableOriginCheck:false`/`disableCSRFCheck:false`를 명시한다. 설치 라이브러리는 테스트 환경에서 Origin 검사를 기본 생략하므로 이 명시가 실제 교차 출처 검증에도 필요하다.
- 메일 전송은 Better Auth backgroundTasks와 Next `after(Promise)`로 수명을 관리한다. 요청 성공은 메일 수신 증거가 아니다. 라이브러리가 task 오류를 먼저 처리할 수 있으므로 전송 계층에서 비민감 실패 로그를 남긴다. [Next after](https://nextjs.org/docs/app/api-reference/functions/after).
- 요청 제한 카운터는 메모리 기반이다. 다중 인스턴스·재시작 사이 공유되지 않으므로 공개 배포 전 공유 저장소와 실제 프록시 경계를 검증해야 한다. 이 한계를 `shortcut:` 주석으로 표시했다.

### 실행한 검증

- 전송 테스트는 최초 모듈 부재 실패 후 구현했다. 최종 `pnpm check`:60파일/605테스트·Prisma validate/generate·타입·린트·서버 경계21·구조 검사·43정적 페이지 및 새 동적 `/api/auth/[...all]` 빌드 통과.
- `pnpm test:database`:상위25검사 통과(기존 SQL24와 서버 통합 suite1). suite의 두 파일은 DB/세션9개 + 이메일 흐름11개, 총20개 시나리오다. 이 개수와 단위 테스트 수를 합산하지 않는다.
- AUTHMAIL-001~006:약한 비밀번호/인증 전 로그인/중복가입·기존 해시 보존, 만료·변조·멱등 이메일확인, 실제 해시/HttpOnly/SameSite 쿠키/Workspace/로그아웃, 존재 은닉 재설정/해시 identifier/만료·재사용·동시 단발 소비/이전 세션 폐기, Origin·외부 redirect·미구현 경로 차단/JSON token 제거/429, 메일 실패 후 미인증 유지·비밀 없는 로그를 검사했다.
- 새 회귀 사례:JSON Content-Type을 가진 빈 302 redirect를 파싱하다 503이 되던 경계를 수정했다. 테스트 환경 Origin 기본 생략을 명시적으로 해제했다. 라이브러리 task 처리 전에 전송 계층에서 실패가 기록되도록 수정했다.
- 실제 Next production 서버의 별도 loopback3042에서 세션 없는 GET200/null·no-store, 교차 출처 가입403(쓰기 전 차단), 소셜 경로404를 HTTP로 확인했다. 실제 회원 생성/변경·메일 전송 없는 smoke다.
- 인증 route server trace에 Supabase 공개 CA가 포함됨을 확인했다. Vercel 실제 배포 검증은 아니다.

### 실제 메일 발송 결과와 남은 경계

- 사용자가 지정한 본인 수신자로 실제 전송 코드를 실행했다. 계정/비밀번호를 변경하지 않는 테스트 안내 두 통을 보내는 검사지만 첫 전송에서 Resend403 validation_error가 발생해 완료하지 못했다.
- 기본 `onboarding@resend.dev` sender의 가입 본인 수신자 제한으로 거절됐다. 현재 수신 주소를 허용하려면 소유 발신 도메인 인증이 필요하거나, 이 Resend 계정의 가입 이메일을 테스트 수신자로 사용해야 한다. 현재 API key가 유효하지 않다는 오류는 아니었다. 실제 주소·키·공급자 원문 오류는 이 문서에 기록하지 않는다.
- Resend 가입 이메일을 사용자에게 물었고, 답변/발신 설정이 확보될 때 발송 검증을 이어간다. 외부 콘솔 설정이나 API key는 변경하지 않았다. 접수·전달·메일함 수신을 구분한다.
- 로그인/가입/재설정 화면, 소셜·계정연결, 브라우저 owner와 계정 전환/다른 탭, 물리 IME·디스크, 운영 공유 limiter·발신도메인·Vercel callback/환경·Supabase SSL enforcement는 후속이다. 기존 실제 계정/자료/환경 파일·migration 변경 없음. commit/push/배포 없음.

### 재현

```powershell
pnpm check
pnpm test:database
# 별도 실제 메일 검사: 명시적으로 허용된 수신자만 환경 변수에 주입한다.
# MOA_MAIL_TEST_RECIPIENT를 설정한 뒤 apps/web에서 실행된다.
pnpm --filter @personal-ai/web exec vitest run --config ../../tests/mail/vitest.live.config.mts
```

일반 테스트와 Docker runner는 실환경 파일/키/개인 수신자에 접근하지 않는다. live 메일 config만 `.env.local`을 읽고 테스트 안내 메일을 실제 전송하므로 일반 check나 DB 검사의 대상에 포함하지 않는다.

---

## 2026-11-06 서버 DB·세션·Workspace 연결

이 절은 아래 2026-11-05 기록 이후의 추가 결과다. 실제 로그인 화면/endpoint·메일/OAuth·브라우저 계정 격리는 아직 후속이다.

### 읽는 순서와 변경 이유

1. [연결 설정](../../../apps/web/src/server/database/config.ts): runtime 역할만 허용하고 URL TLS 옵션을 검사/제거한 뒤 공개 CA·호스트 검증을 고정한다. [pg 공식 문서](https://node-postgres.com/features/ssl)의 connectionString/ssl 덮어쓰기 규칙을 반영했다.
2. [DB client](../../../apps/web/src/server/database/client.ts): PrismaPg singleton으로 개발 중 연결 풀 중복 생성을 줄인다. `@prisma/adapter-pg` 7.10.1·pg 8.23.1·server-only 0.0.1·타입 8.23.1을 정확히 고정했다. 기존 `better-auth/adapters/prisma` export를 사용해 별도 인증 adapter 패키지를 추가하지 않았다.
3. [서버 인증](../../../apps/web/src/server/auth.ts): trusted origin/secret을 검증하고 Better Auth Prisma adapter·DB 세션 조회를 연결한다. 가입과 계정 연결은 아직 비활성화하며 쿠키 캐시·불필요한 IP 수집을 사용하지 않는다.
4. [Workspace 진입점](../../../apps/web/src/server/workspace.ts): 요청 헤더의 서명된 세션을 검증 → 내부 User.id 확정 → 같은 transaction의 parameterized `set_config(..., true)` → 중복 무시 삽입/소유자 조회 → `{userId, workspaceId}`. 외부 userId/workspaceId를 입력받지 않는다. 최초 빈 upsert 구현은 두 pool의 동시 검사에서 P2002 고유 제약 오류가 재현돼 `createMany(skipDuplicates)`와 조회로 수정했다.
5. [설정 테스트](../../../apps/web/tests/server/database-config.test.ts), [인증 설정 테스트](../../../apps/web/tests/server/auth-config.test.ts), [실제 driver 통합 검사](../../../apps/web/tests/server/database-runtime.checks.ts).

### 새 실행 증거

- 최초 설정 테스트는 구현 모듈 부재로 실패한 뒤 구현 후 14개 통과. 신뢰 origin/secret 경계 7개를 추가했다.
- `pnpm check`: 58파일/589테스트, Prisma validate·client 생성·타입·린트·서버 경계21·구조 검사·43페이지 production build 통과.
- `pnpm test:database`: 기존 SQL 계약24개와 서버 통합 suite를 합친 상위25개 검사 통과. suite 내부 실제 PrismaPg/Better Auth 시나리오는8개다. 서로 다른 단위의 개수를 하나의 테스트 수로 합치지 않는다.
- AUTHDB-004/005/006/007: 인증 전 세션 조회, 요청 owner 위조 무시, A/B 조회·변경·삭제 차단, 한 연결의 commit/rollback 문맥 초기화, 두 pool 동시 초기화, 위조/미서명/만료/폐기 세션 거부, 가입 요청 차단·회원 미생성. 모두 격리 PostgreSQL의 가상 자료다.
- 실제 Supabase opt-in 읽기 전용 검사1개: production client와 공개 CA를 통해 제한 runtime·비상승 권한·Workspace RLS/FORCE·문맥 없는 기본 차단 확인. 사용자 행을 조회하거나 생성/변경하지 않았다. 세션 없는 인증 조회도 null 확인했다.
- Next build의 `/api/health` server trace에 공개 CA 파일 포함을 확인했다. 이 확인은 Vercel에서 배포·실행했다는 뜻이 아니다.

### 재현과 보호 경계

```powershell
pnpm check
pnpm test:database
# 별도 명시적 실환경 READ ONLY 검사: 로컬 .env.local을 읽는다.
pnpm --filter @personal-ai/web exec vitest run --config ../../tests/database/vitest.live.config.mts
```

일반 테스트와 격리 DB runner는 실제 환경 파일을 읽지 않는다. live 설정은 위 opt-in 명령으로만 실행하며 실제 URL/secret을 출력하지 않는다. generated client는 Git에 추가하지 않고 dev/typecheck/build 때 생성한다. 기존 migration·원격 역할·비밀번호·환경 파일·브라우저 저장소·개인 파일은 변경하지 않았다.

### 남은 한계

- Supabase Dashboard SSL enforcement 확인은 Windows 브라우저 URL을 검증할 수 없어 Computer Use가 중단됐다. 관리 API용 토큰도 현재 제공되지 않아 설정 상태는 미확인이다. SQL의 pg_stat_ssl 관찰만으로 관리 설정을 확정하지 않는다. 설정 변경과 DB 재시작은 수행하지 않았다. [공식 enforcement 안내](https://supabase.com/docs/guides/platform/ssl-enforcement).
- 인증 endpoint·로그인/회원가입 UI·메일 발송·OAuth claim/연결 UX·브라우저 owner 교체·물리 디스크·IME·운영 부하·Vercel 실행은 검증하지 않았다. 현재 서버 함수는 후속 인증 진입점에서 사용할 기반이며 기존 화면에는 연결하지 않았다.
- Git commit/push·배포 없음. 기존 개발 owner와 로컬 자료는 보존한다.

---

2026-11-05. 이 기록은 SQL/Prisma 기반 검증이며 로그인 기능 완료 보고가 아니다.

## 구현된 범위

- Better Auth 1.7.17 생성 스냅샷을 기준으로 core 네 모델을 작성하고 `moa_auth` 스키마에 매핑했다.
- `moa_app.workspace`에 회원당 기본 공간 하나의 관계를 추가했다.
- 이메일·세션 토큰·provider/account 조합·Workspace 소유자 unique, User FK와 cascade를 구성했다.
- 비소유자 runtime 역할·인증 전 조회용 grant·Workspace RLS USING/WITH CHECK와 FORCE를 구성했다.
- 일반 DATABASE_URL을 DDL에 사용하지 않는 Prisma config와 오프라인 validate/generate 명령을 추가했다.

근거 파일: [Prisma 실행 안내](../../../apps/web/prisma/README.md), [스키마](../../../apps/web/prisma/schema.prisma), [SQL 검사 코드](../../../tests/database/auth-schema-check.mjs).

## 실제 실행 결과

| 검사 | 결과 |
| --- | --- |
| 권한 보강 전의 초기 SQL | RLS 활성/강제 검사가 0을 반환해 실패함을 확인한 뒤 정책을 추가 |
| Prisma validate·client generate | 통과. DB 접속 없이 수행 |
| 격리 PostgreSQL DB 계약 검사 | **24개 통과** |
| Prisma migration deploy·재적용 | 비슈퍼유저 CREATEROLE 역할에서 통과, 완료 이력 1개 |
| 적용 DB와 Prisma 모델 비교 | drift 없음 |
| pnpm check | 스키마 검증·타입·린트·56파일/568테스트·서버 경계·구조·43페이지 빌드 통과 |
| 테스트 컨테이너 정리 | 실행 label로 조회한 잔여 컨테이너 없음 |

PostgreSQL 이미지는 `postgres:17-alpine@sha256:266d3c257594e195b309ae9d1805e54c788f1d7b375f56bf6c367aac6c917e7b`로 고정했다. 개인 폴더를 mount하거나 브라우저 저장소를 읽지 않았다.

24개 검사는 migration URL의 안전한 거부/비밀값 미출력, 실제 migration과 재적용/drift, role flag·소유자·양방향 membership guard, 인증 전 조회, migration 이력 접근 금지, 문맥 미설정 기본 차단, A/B CRUD, commit/rollback 후 문맥 초기화, 기본 PUBLIC/API grant 회수, unique/FK/cascade, 동시 기본 공간 생성 충돌을 포함한다. SQL 테스트의 사용자 문맥은 가상 fixture이며 실제 인증된 사용자 ID를 주입하는 서버 서비스는 아직 없다.

코드 리뷰에서 다른 로그인 역할이 runtime의 권한을 받는 역방향 membership 누락을 찾아 보완했다. 비슈퍼유저 migration 생성자의 관리 membership은 유지하되, 임의 수신자는 setup과 migration 모두에서 거부하는 회귀 검사를 추가했다.

## 실제 Supabase 사전 조회와 적용 완료

사용자가 저장한 접속값을 출력하지 않고 `BEGIN READ ONLY`에서 카탈로그만 조회했다.

- PostgreSQL **17.11**, 현재 연결 역할 `postgres`.
- 현재 역할은 비슈퍼유저이며 CREATEROLE·BYPASSRLS 권한과 스키마 생성 권한을 갖는다.
- 적용 전에는 `moa_auth`·`moa_app` 스키마/테이블과 `moa_runtime` 역할이 없었다.
- 이후 사용자가 실제 적용과 memory 갱신을 요청하여 아래 변경을 수행했다. 이 지시 전의 읽기 전용 결과와 구분한다.

### 실제 반영한 내용

- `moa_runtime` LOGIN 역할·별도 난수 비밀번호를 만들고 `NOBYPASSRLS`·`NOINHERIT`·비소유자로 구성했다. 기존 관리자 비밀번호를 변경하지 않았다.
- Prisma로 초기 migration을 적용했다. 앱 테이블 5개와 완료 이력 1개, source SQL 체크섬 일치와 모델 drift 없음을 확인했다.
- runtime 비밀번호 로그인과 역할 확인, DB/schema 생성·migration 이력 조회 불가, API 역할의 사용자/작업 공간 읽기 불가를 실환경에서 확인했다.
- 실제 runtime 역할로 가상의 A/B/C 회원을 한 트랜잭션 안에서 만들고 Workspace의 문맥 없음 기본 차단·A/B 조회/수정/삭제 차단·위조 삽입/소유자 변경 거부를 확인했다. 전부 ROLLBACK했고 관리자 조회로 잔여 검증 회원/공간 0개를 확인했다.
- `.env.local`은 runtime `DATABASE_URL`과 관리자 `MIGRATION_DATABASE_URL`로 분리했다. 기존 서비스 키·인증 secret은 보존했고 Git 제외 및 임시 접속값 사본 제거를 확인했다. 실제 URL/비밀번호는 이 문서에 기록하지 않는다.

### TLS 구간별 결과

- OS 기본 CA만으로는 Supabase 인증서 체인을 검증할 수 없었다. 공식 Dashboard 소스에서 배포 경로를 확인해 [공개 CA](../../../apps/web/prisma/certs/README.md)를 받아 사용했다.
- libpq `verify-full`과 CA로 인증서·호스트 검증, `conninfo`의 SSL 연결을 관리자/runtime 모두에서 확인했다. Prisma migration에도 strict 인증서 검증을 적용했다.
- DB가 보고한 pooler→DB 구간은 `pg_stat_ssl.ssl=false`다. 이는 검증된 클라이언트→pooler TLS와 다른 구간이다. Supabase SSL enforcement의 Dashboard 상태/변경·DB 재시작은 이번에 수행하지 않았고 후속 확인 항목으로 남긴다.

브라우저 도구는 현재 URL을 확인할 수 없어 조작이 중단됐다. 인증서 검증을 끄거나 브라우저 경고를 우회하지 않았고 공식 소스의 HTTPS 다운로드와 CLI로 작업을 마쳤다.

## 아직 검증하지 않은 범위

- Vercel의 새 runtime 접속값 등록/교체·배포·실제 앱 driver adapter 연결과 CA 배포 확인.
- Better Auth 인스턴스와 Prisma adapter의 실제 API 동작, 제공자별 OAuth claim·메일 발송·세션/토큰 만료·계정 연결 UX.
- 서버 소유권 검사, 실제 연결 풀/트랜잭션 문맥 주입, 로그아웃/계정 전환의 브라우저 상태 무효화.
- 실제 사용자 디스크·원본/백업·개발 owner 자료 이관·다중 폴더 연결.
- Supabase 내부 pooler→DB 구간 SSL enforcement 설정의 확인·적용.

설계 명세의 AUTHDB 사례는 전체 계획이다. 이번 SQL 검사와 겹치는 항목도 DB 제약/권한 부분의 근거이며, 인증·서버·브라우저 전체 시나리오가 통과했다고 표시하지 않는다.

## 재현

```powershell
pnpm db:validate
pnpm db:generate
pnpm test:database
pnpm check
```

`pnpm test:database`는 Docker 전용 별도 검사다. 환경 파일의 실제 DB URL을 테스트 대상으로 선택하는 옵션은 없다.
