# 인증 DB 준비와 실행 경계

2026-11-06 최신 UI: 이메일 가입·로그인·확인·재설정·계정 화면과 Server Actions까지 연결했다. [쿠키와 독립 브라우저의 실DB 검증](../../../docs/verification/auth-ui/README.md)을 아래 DB/API 준비 기록과 구분한다. 본인 Gmail 수신은 사용자 확인 완료이고 공개 발신 도메인·소셜·브라우저 owner 전환은 후속이다.

2026-11-05 사용자 진행 지시로 실제 Supabase에 제한된 runtime 역할과 5개 테이블을 적용했다. 관리자 migration 접속과 runtime 접속을 로컬 환경 파일에서 분리했고 실제 역할 로그인·TLS·RLS를 검증했다. 2026-11-06 이메일 인증 API와 Resend 전송 코드를 연결했다. 최초 수신자 제한(403) 후 사용자가 확인한 Resend 가입 본인 주소로 테스트 메일 두 통의 접수를 확인했다. 메일함 수신 확인·공개 발신 도메인과 로그인 화면·소셜·브라우저 owner 교체는 후속이다.

## 읽는 순서

1. [설계 계약](../../../docs/specs/auth-database-design.md): 서버/로컬 경계, 테이블의 목적과 미구현 범위.
2. [schema.prisma](schema.prisma): Better Auth 1.7.17 core 네 모델과 개인 Workspace. core 필드는 고정 버전 공식 생성 스냅샷을 기준으로 작성했고 프로젝트의 provider/account 복합 unique와 Workspace를 추가했다.
3. [setup-runtime-role.sql](setup-runtime-role.sql): 클러스터 역할의 별도 사전 구성. 위험한 기존 권한·다른 역할과의 membership·소유 관계를 허용하지 않는다.
4. [초기 migration](migrations/20261105000000_auth_workspace/migration.sql): 다섯 테이블·제약·grant·Workspace RLS를 한 트랜잭션으로 적용하는 SQL.
5. [검증 기록](../../../docs/verification/auth-database/README.md).

Prisma client는 `apps/web/generated/prisma`에 생성되며 Git과 lint 대상에서 제외한다. dev/typecheck/build가 먼저 client를 생성한다. `src/server/database/client.ts`에서 PrismaPg와 제한 runtime/공개 CA를 연결했고 `src/server/auth.ts`에서 기존 Better Auth Prisma adapter를 사용한다. 이메일 인증 endpoint·전송 코드를 연결했으며 소셜 로그인은 후속이다.

Vercel Root Directory는 `apps/web`이다. 같은 디렉터리의 `vercel.json`이 Build Command를 `pnpm run build`로 고정해 Dashboard의 직접 `next build` 설정보다 우선한다. 따라서 캐시된 설치나 설치 훅에 의존하지 않고 매 빌드 전에 Client를 생성한다. 생성물이 없는 상태에서 이 명령의 생성·Next 빌드 성공을 확인했으며 생성물을 Git에 추가하지 않는다.

## DB 연결 없는 검사

저장소 루트에서 실행한다.

```powershell
pnpm db:validate
pnpm db:generate
pnpm check
```

Prisma config는 `.env.local`을 자동으로 읽지 않는다. DB URL 없이 위 작업을 실행할 수 있고, 일반 `DATABASE_URL`을 DDL URL로 자동 재사용하지 않는다.

## 격리된 실제 PostgreSQL 검사

Docker 엔진과 테스트 이미지가 필요하다.

```powershell
docker pull postgres:17-alpine@sha256:266d3c257594e195b309ae9d1805e54c788f1d7b375f56bf6c367aac6c917e7b
pnpm test:database
```

테스트는 로컬 loopback에만 노출되는 임시 컨테이너를 만들고, 가상 DB·회원·비밀번호만 사용한다. 실제 환경 파일을 읽지 않으며, host 폴더를 mount하지 않는다. 비슈퍼유저 migration 역할로 Prisma `migrate deploy`·재적용·drift를 확인하고 SQL 권한/제약을 검사한 뒤, 이번 실행의 label과 ID가 일치하는 컨테이너만 정리한다.

## 실제 적용 상태와 다음 연결 단계

- 적용 전 앱 스키마/역할 부재를 확인했고, 적용 후 migration 이력 1개·검토 SQL 체크섬·모델 drift 없음·API 역할 접근 차단을 확인했다. 다음 변경은 새 migration으로 추가하며 이미 적용된 초기 SQL을 수정하지 않는다.
- DDL은 별도 migration 자격증명으로 수행한다. `MIGRATION_DATABASE_URL`은 CLI 프로세스에 명시적으로 제공하며 접속값을 Git·명령 로그에 남기지 않는다. URL의 `schema=moa_app`은 필수이며, migration 이력이 public/인증 영역에 생성되지 않도록 config에서 검사한다. runtime에는 이력 테이블 권한을 주지 않는다.
- 실제 runtime은 `moa_runtime`이며 비소유자·`NOBYPASSRLS`·DB/schema 생성 불가·migration 이력 조회 불가를 확인했다. `.env.local`의 `DATABASE_URL`은 이 역할이고 `MIGRATION_DATABASE_URL`은 기존 postgres 관리자 접속이다. 다른 소셜·메일·인증 설정은 보존했다.
- `setup-runtime-role.sql` 자체는 비밀번호를 생성/변경하지 않는다. 실제 적용 과정에서는 별도 안전한 난수로 비밀번호를 준비하고 SCRAM으로 설정한 뒤 로그인으로 확인했다. 비밀값은 환경 파일에만 저장했고 임시 복구 사본은 검증 후 제거했다.
- PostgreSQL 16+의 비슈퍼유저 CREATEROLE은 생성자에게 관리 membership을 남긴다. 현재 SQL의 신뢰된 migration 실행자만 이 역방향 membership을 가질 수 있고, 다른 수신자나 runtime이 다른 역할에 속한 경우는 중단한다. 이는 기존 역할의 권한을 자동으로 수정하는 절차가 아니다.
- `Workspace` 쿼리의 `moa.user_id`는 서버 세션 확인 뒤 같은 트랜잭션에서 설정한다. `src/server/workspace.ts`와 실제 PrismaPg 한 연결/두 풀의 격리 DB 검사로 commit/rollback·계정 교대·동시 초기화를 검증했다. 인증 네 테이블은 인증 전 조회가 필요하므로 사용자 문맥 RLS를 적용하지 않고 서버 역할 grant로 제한한다. 실제 회원 브라우저·운영 풀 부하는 아직 검증하지 않았다.
- OAuth 토큰 암호화·이메일 소유 확인·계정 연결·만료 토큰 거부는 Better Auth 설정/서비스 단계의 책임이며, SQL 테스트 통과로 구현됐다고 간주하지 않는다.
- 공식 [공개 CA](certs/README.md)로 클라이언트→pooler의 인증서·호스트 검증을 수행했다. pooler→DB 구간은 `pg_stat_ssl.ssl=false`로 관찰됐다. Dashboard SSL enforcement 상태는 조회/변경하지 않았으며, 내부 구간 설정 확인·적용은 다음 운영 항목이다.
- Vercel의 환경 변수는 이번에 변경하지 않았다. 앱 연결/배포 전에 `DATABASE_URL`에 새 제한 역할 값을 등록 또는 교체하고 CA 포함·driver 검증을 확인한다. 관리용 `MIGRATION_DATABASE_URL`은 앱 서비스 환경에 넣지 않는다.

실제 Supabase의 읽기 전용 확인은 별도 opt-in 명령이다. `apps/web/.env.local`을 명시적으로 읽으며 제한 역할/카탈로그/RLS 기본 차단만 확인하고 사용자 행이나 기존 폴더를 읽지 않는다. 일반 테스트/격리 DB 명령과 분리했다.

```powershell
pnpm --filter @personal-ai/web exec vitest run --config ../../tests/database/vitest.live.config.mts
```

클러스터 역할 준비는 shadow DB마다 재생하는 migration에 포함하지 않는다. 전체 SQL이 필요하면 보안 정책까지 포함된 검토 파일을 사용한다. Prisma의 빈 DB diff를 다시 생성하면 수동 grant/RLS 부분이 사라지므로 기존 초기 migration을 무심코 교체하지 않는다.
