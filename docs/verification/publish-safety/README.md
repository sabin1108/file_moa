# Git 공개 전 검사 · 배포 준비 — 2026-11-06

Git 후보 파일과 이전 커밋에서 검사한 실제 비밀값이 발견되지 않았다. 알려지지 않은 비밀까지 없음을 보증하는 결과는 아니다. 아래 검사는 시점별 증거이며 커밋·push 현황과 실제 배포 성공은 별도로 확인한다.

## 사용자 요청에 따른 커밋 전 재검사

- 새 인증 코드가 아직 미커밋임을 확인하고 사용자의 안전한 Git 반영 요청에 따라 재검사했다. 원격을 fetch한 시점에 로컬/원격 main은 같은 첫 커밋이었다.
- [prepush-scan.json](prepush-scan.json):후보3,294개, 실제 환경변수 비밀값/인코딩/DB 비밀번호 등16변형, 기본 credential 패턴, 개인 테스트 수신자, UTF-16 로그4개, 기존 커밋1개, 클라이언트 번들에서 일치0. 실제 값은 보고서에 기록하지 않았다.
- `.env.local`, 생성 Prisma Client, `.omx`의 ignore·미추적 상태를 확인했다. schema/migrations/공개 CA/의존성 버전만 소스에 포함한다. 기존 이미지 전체의 OCR 검사는 하지 않았으며 아래 한계는 유지한다.
- 새 `pnpm check` 실행에서620테스트·Prisma validate/generate·타입·린트·서버/구조 경계·production 빌드를 통과했다. UI44/DB통합20의 기존 격리 검증은 [별도 기록](../auth-ui/README.md)이며 이번에는 동일 기능의 전체 브라우저/DB 검사를 반복하지 않았다.
- 새 production 배포에서의 계정별 폴더 격리·공유 limiter·일반 수신자 발신 도메인 조건은 여전히 별도 후속이다. 소스 공개 검사를 일반 사용자 공개 준비 완료로 해석하지 않는다.

## 추가 운영 확인 — 2026-11-06

- 실제 Supabase에 기존 `vitest.live.config.mts`의 READ ONLY 검사1개를 다시 실행해 통과했다. 공개 CA로 검증된 연결, `moa_runtime` 제한 역할(관리/BYPASSRLS/역할·DB 생성 권한 없음), Workspace RLS 강제, 소유자 문맥 없는 Workspace 접근 차단, 무쿠키 세션 없음이 확인됐다. 기본 제한 환경의 첫 실행은 네트워크 EACCES였으며 승인된 네트워크 실행에서는 통과했다. 사용자 레코드 본문/비밀값을 출력하거나 원격 데이터를 수정하지 않았다.
- GitHub의 `main` 첫 커밋 `cff12bc105a27ed7b7acbca37cf3c4c912561593`에 Vercel commit status `success`가 확인됐다. [해당 배포 기록](https://vercel.com/sabins-projects-011c6dea/web/Cqn3tx4kechxbg2H3oKEvJjxYUdT). GitHub deployments 목록0개와 check-runs0개는 별도 채널이며 Vercel 연결이 없다는 증거가 아니다. 이번 인증 UI는 로컬 미커밋 변경이므로 그 첫 커밋의 배포에 포함되지 않는다.
- 실제 Vercel 프로젝트 환경변수/Root Directory/최신 production 배포와 Supabase Dashboard SSL enforcement는 여전히 미확인이다. 확인한 로컬 환경·표준 CLI 위치에 관리 연결이 없었으며, 전용 Supabase/Vercel 플러그인은 제안 시점에 미설치·미연결이었다. 관리 연결 완료 전까지 실제 운영 설정 정상으로 판정하지 않는다.
- 브라우저 access host는 사용 불가였고, 기존 Chrome 창을 바인딩하려는 대안은 관련 없는 개인 페이지를 읽을 위험 때문에 자동 승인 검토에서 거절됐다. 그 경로를 중단했으며 우회하지 않았다. 관리 콘솔 URL의 일반 웹 조회도 접근되지 않았다.

## Git에 포함할 것과 제외할 것

| 대상 | 현재 처리 | 이유 |
|---|---|---|
| `apps/web/prisma/schema.prisma`, migrations, setup SQL, README | 포함 | 재현 가능한 테이블·권한·변경 이력이며 실제 비밀번호가 없다. |
| `apps/web/prisma/certs/supabase-prod-ca-2021.crt` | 포함 | 서버 TLS 검증용 공개 X.509 CA다. 개인키가 아니다. |
| `apps/web/prisma.config.ts`, package.json, pnpm-lock.yaml | 포함 | 설정 코드는 환경변수를 읽고 의존성 버전을 고정한다. |
| `apps/web/generated/prisma/` | 제외 | 생성된 Prisma Client. dev/typecheck/build에서 `prisma generate`로 다시 만든다. |
| `.env.local` 등 `.env*` | 제외 | 실제 DB 비밀번호·인증/메일 비밀값. 빈 값 예시인 `.env.example`만 포함한다. |
| node_modules, .next, .omx | 제외 | 설치/빌드/로컬 실행 자료다. |

`.env.local`과 생성 Client는 ignore 적용 및 현재 추적되지 않음을 확인했다. `@prisma/client` 의존성 선언은 포함하지만 설치·생성 결과는 제외한다. 강제 add로 ignore를 우회하면 별도 검토가 필요하다.

## 검사 증거

- [scan.json](scan.json): 당시 후보3,285개(추적3,206개), 텍스트1,113개와 바이너리2,172개. 실제 서버 비밀값의 원문/URL 변환 등13개 변형, 주요 credential/private-key 패턴, 개인 테스트 수신 주소, 의심 credential 파일명을 확인했다. 실제 값은 보고서에 기록하지 않았다.
- 이전 커밋1개와 remote URL 내 credential, 실제 클라이언트 `.next/static` 번들의 비밀값 유출도 검사해 일치가 없었다. 공개 인증서는 정상 CA로 파싱되고 개인키를 포함하지 않는다.
- 바이너리 exact-byte 검사에 더해 UTF-16 로그4개를 디코딩했다. 로그 총5개의 실제 비밀값/주요 credential 패턴 일치가 없었다.
- 이미지2,168개는 픽셀/OCR 전수 검사를 하지 않았다. 알려진 비밀값과 패턴 검사만으로 모든 형태의 개인정보나 알 수 없는 키까지 부재한다고 단정하지 않는다.

## Supabase와 Vercel에 남은 일

이번 인증 UI에는 추가 DB migration이 없다. 이미 적용된 제한 runtime 역할/인증4테이블/Workspace를 사용한다. Supabase Auth를 별도로 구성하는 구현이 아니라 Better Auth가 PostgreSQL 테이블을 사용한다.

1. Supabase SSL Configuration에서 SSL enforcement의 실제 상태를 확인한다. 현재 접속 코드는 CA·호스트 검증을 강제하지만 서버 enforcement 설정 확인과는 별개다. 설정을 바꿀 때 DB 재시작/중단 영향을 확인한다. 이번에는 원격 설정을 바꾸지 않았다. [공식 SSL enforcement 문서](https://supabase.com/docs/guides/platform/ssl-enforcement).
2. Vercel 운영 환경에 아래 서버 변수만 우선 설정하고 실제 운영 HTTPS origin을 사용한다. 관리자 `MIGRATION_DATABASE_URL`을 서비스 runtime에 넣지 않는다. 공개 CA는 env가 아닌 추적 대상 인증서 파일이므로 실제 배포 함수에 포함되는지 확인한다.

| 변수 | 값의 역할 |
|---|---|
| `DATABASE_URL` | 제한된 `moa_runtime` 역할의 Session pooler URL |
| `BETTER_AUTH_URL` | 실제 운영 사이트 origin |
| `BETTER_AUTH_SECRET` | 서버 인증 비밀값 |
| `RESEND_API_KEY` | 메일 발송 키 |
| `EMAIL_FROM` | 인증된 발신 도메인의 주소 |

환경변수 변경은 기존 배포에 소급되지 않으므로 새 배포가 필요하다. 현 build 명령은 Prisma Client 생성 후 Next를 빌드한다. Root Directory가 `apps/web`이면 **Include source files outside of the Root Directory in the Build Step**를 켜 `packages/domain` workspace 소스에 접근할 수 있게 한다. 실제 Vercel 프로젝트 설정/배포 결과는 아직 확인하지 않았다. [공식 Vercel 환경변수 문서](https://vercel.com/docs/environment-variables), [공식 monorepo FAQ](https://vercel.com/docs/monorepos/monorepo-faq#can-i-share-source-files-between-projects-are-shared-packages-supported).

## 일반 사용자 공개 전 조건

- `SourceFolderProvider.tsx`는 아직 고정 개발 owner를 사용한다. 실제 로그인 세션의 user/workspace 연결과 로그아웃·계정전환·다른 탭·진행 중 작업 격리가 필요하다. `/account`는 기존 개발용 폴더로 자동 진입시키지 않는다.
- 인증 limiter는 instance별 메모리다. 공개 전 공유 저장소와 실제 Vercel 프록시/IP 경계를 검증해야 한다.
- Resend 기본 `onboarding@resend.dev`는 가입 본인 테스트용이다. Gmail 본인 수신 확인을 일반 회원/네이버 발송 가능으로 확대하지 않는다. 공개 발송은 소유 도메인 인증이 필요하다.

인증 UI의 합성 DB/메일/브라우저 검증은 [별도 결과](../auth-ui/README.md)에 있다. 소스 공개 검사, 실제 배포 검증, 계정별 파일 격리 완료를 서로 다른 주장으로 유지한다.
