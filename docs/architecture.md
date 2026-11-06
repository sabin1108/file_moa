# 기술 경계

## 이메일 인증 UI 개정 — 2026-11-06

인증 UI는 `features/auth`, 서버/브라우저 공통 타입 계약은 `shared/auth-contract.ts`, 진입 action은 `app/actions/auth.ts`, 입력검증과 인증 프로토콜 조합은 `server/auth-forms.ts`다. app 페이지가 feature에 action을 전달하므로 feature→app/server→feature 역방향 의존이 없다. Server Action은 자기 API에 HTTP fetch하거나 보호를 건너뛰는 direct auth.api 호출 대신 같은 프로세스의 auth handler를 거쳐 요청 제한/Origin을 유지한다. 응답 쿠키는 Better Auth 공개 parser/options로 Next cookies에 옮긴다. 로그인 후 `/account`는 실제 세션으로 확인하며 기존 로컬 개발 owner는 후속 전환까지 유지한다. [실행 증거/한계](verification/auth-ui/README.md).

## 이메일 인증 API 개정 — 2026-11-06

`/api/auth/[...all]`을 이메일 인증 프로토콜용 최소 Route Handler로 연결했다. 서버 `auth-handler.ts`가 허용 경로/메서드·no-store·최소 JSON을 담당하고 `auth.ts`의 Better Auth는 검증 전 로그인 금지·서명 세션·재설정 토큰 단발소비/세션폐기를 맡는다. `auth-mail.ts`는 기존 fetch와 Resend를 사용하며 Next after 수명관리로 전송한다. 검증 코드와 실제 발송 한계는 [최신 검증](verification/auth-database/README.md)을 따른다. 메모리 요청제한은 다중 인스턴스 공개 전 공유 저장소/프록시 검증이 필요하다. 화면·소셜·브라우저 owner 연결은 후속이다.

## 서버 DB 연결 개정 — 2026-11-06

`src/server/database`에 제한 runtime 역할·공개 CA를 사용하는 PrismaPg client를 추가했다. `src/server/auth.ts`는 기존 Better Auth의 Prisma adapter와 유효 세션 조회를 연결하고, `src/server/workspace.ts`는 세션 User.id로 같은 트랜잭션의 RLS 문맥과 기본 Workspace를 초기화한다. 입력으로 userId/workspaceId를 받지 않고 최소 owner DTO만 반환한다. 인증 endpoint·로그인 화면·메일/OAuth·브라우저 owner 교체는 아직 없다. 아래의 앱 DB client/인증 인스턴스 미구현 기록보다 이 절을 우선한다. [실행 증거와 한계](verification/auth-database/README.md).

## 인증 준비 개정 — 2026-11-05

인증은 Better Auth 1.7.17, ORM은 Prisma 7.10.1, 서버 DB는 Supabase PostgreSQL로 선택했다. `apps/web`에 Better Auth·Prisma Client와 개발용 Prisma CLI를 정확한 버전으로 설치했다. 아래 Drizzle 후보 기록보다 이 결정이 우선한다.

Prisma schema/client와 초기 migration·grant/RLS SQL을 작성해 격리된 PostgreSQL24검사를 통과했고, 사용자 지시로 실제 Supabase에 제한된 역할과 5개 테이블을 적용했다. runtime 접속·TLS·RLS 검증과 검증 행 롤백까지 확인했다. 인증 인스턴스·API·앱 runtime DB client·메일 발송은 아직 구현하지 않았고 기존 개발용 소유자도 교체하지 않았다. [검증과 남은 TLS/앱 연결 범위](verification/auth-database/README.md).

인증 4테이블·개인 Workspace·소유권/DB 역할·로컬 자료 보존 계약은 [인증 DB 설계](specs/auth-database-design.md)에 정리했다. 테이블 적용을 실제 로그인 기능 완료와 구분한다.

로컬 origin은 `http://127.0.0.1:3034`로 유지한다. 서버 비밀값은 Git에서 제외되는 `apps/web/.env.local`에 저장하고, 운영 값은 Vercel Production 환경 변수로 관리한다. 실제 인증 구현 시 인증·소유권·DB 권한의 책임을 구분하며, 기존 서버 전용 접근과 로컬 원본 보호 계약을 따른다.

2026-10-28 최신 구조: src/app은 라우트 진입점, components/layout·ui는 공통 프레임/표시, features/local-folders는 기능별 components와 providers/hooks/store/services/lib/types로 구성한다. 테스트는 src 밖 apps/web/tests·packages/domain/tests·루트 tests에 분리했다. 원본 읽기·다중 선택·연결 관리 팝업까지 구현했으며 실제 로그인·서버 DB·원본 쓰기는 미구현이다. [현재 소스 지도](code-map.md), [현재 검증](verification/readable-structure/README.md). 아래 날짜별 기술 결정은 그 시점의 범위를 나타낸다.

## 서버 데이터 경계 개정 — 2026-10-27

브라우저에서 시작하는 업무 요청은 Server Actions → 서버 전용 서비스/데이터 접근 → 외부 API/DB로 제한한다. 최초 화면 조회는 Server Components에서 같은 서버 전용 서비스를 직접 사용한다. 서버 데이터 정규화·업무 계산·소유권 필터링·표시 DTO 생성은 서버 책임이며 클라이언트는 표시/입력 상태를 맡는다. 서버 전용 코드 위치는 `apps/web/src/server/`, Action 진입점은 `apps/web/src/app/actions/`다. 아직 연결된 서버 업무 기능이 없으므로 빈 서비스나 가짜 인증 Action은 만들지 않았다.

현재 페이지는 Server Components와 Client Components를 조합하며, 최근 production build의 작업 화면은 정적 사전 렌더링이다. 요청마다 SSR하는 인증 화면을 이미 구현했다고 표현하지 않는다. 폴더 연결/탐색은 hydration 이후 브라우저 File System Access·IndexedDB를 사용하는 로컬 기능이다. 이를 서버 호출로 전환하거나 동의 없이 업로드하지 않는다.

`/api/health` 이외의 서버 업무 API·인증·DB는 아직 미구현이다. 아래 Route Handler 중심 초안과 Query 후보는 과거 설계이며 이 개정이 우선한다. OAuth callback/webhook/실시간 스트림의 Route Handler 예외는 향후 별도 계약 전까지 구현하지 않는다. Server Actions도 공개 POST 호출 경계이며 응답은 DevTools에서 보인다. 상세 허용/금지·검증은 [가이드라인](guidelines.md#서버-통신과-데이터-책임--사용자-요구-2026-10-27)을 따른다.

2026-10-26 실제/시안 경계: 제품 경로는 `features/workspace`의 데이터 없는 메뉴·미구현 표시와 실제 `features/local-folders` 연결을 조합한다. 기존 전체 시안은 `/preview/screens/*`에 보관한다. 공통 표시/CSS 재사용은 유지하되 `prototype-data`, `library-data`, `PrototypeDialog`의 합성 업무 동작은 실제 경로에 넣지 않는다. [현재 수용 기준](specs/live-workspace.md).
## 최신 보관 결정 — 2026-10-25
[개인 AI 로컬 보관 계약](specs/local-ai-storage.md)이 본문·기억·결과물의 저장 위치를 정한다. 사용자 지정 AI 폴더가 장기 보관 기준이며 브라우저 저장소는 캐시·임시 저장·장치별 연결을 담당한다. 원본 자료의 쓰기 권한과 AI 기록 저장 권한은 구분한다.

서버 DB는 인증·세션·동의·사용량 등 최소 운영 정보 중심이다. 대화·기억·결과물 본문을 기본 영구 저장하지 않는다. 선택한 내용의 외부 AI 처리는 별도 전송 동의를 따른다. 서버 본문 체크포인트를 전제한 재연결과 검색·색인 구조는 재설계 대상이다.

아래 PostgreSQL/Drizzle/Better Auth는 기존 후보 방향이며 확정·설치 상태가 아니다. 서버 pgvector·지속 색인 worker는 초기 필수 구조에서 제외하고 필요성이 입증될 때 다시 검토한다. 이 결정이 과거 서버 중심 설계보다 우선한다.

## 기존 기술 후보와 공통 경계

2026-10-28 실제 실행 구조와 변경 위치는 [코드 읽기 안내](code-map.md) 및 [구조도](diagrams/local-files.html)를 따른다. 연결/목록/MD·TXT 원문 미리보기는 공통 Provider 아래의 controller·session·reader로 분리되어 있다. 아래 worker/DB/모델 구성은 미래 후보이며 현재 구현을 설명하는 그림으로 사용하지 않는다.

설계 §18–24 기준. pnpm 단일 저장소의 모듈형 모놀리스 + 별도 Node worker.

2026-10-26 기록: 당시 apps/web 시안, packages/domain 규칙, 독립 저장·복구 도구(현재 tests/s0)가 실행 가능했다. `apps/web/src/features/local-folders`에는 계정별 핸들 저장소와 연결 수명주기 기반이 있다. 2026-10-26 설정 화면에 localhost 개발용 실제 자료 폴더 연결을 추가했다. 별도 DB·임시 개발 소유자를 쓰며 실제 인증·파일 화면 공유는 미완료다. [첫 기능 명세](specs/source-folder-connection.md), [계정 연결 계약](specs/account-folder-connections.md), [설정 검증](verification/settings-folder-connection/README.md)을 구분해 따른다.
apps/worker와 packages/db는 실제 유스케이스 착수 시 추가한다. 빈 공급자 패키지를 양산하지 않는다.

브라우저 → Next Route Handler(세션/입력/소유권/할당량) → 애플리케이션 서비스 → DB/모델 adapter.
domain은 프레임워크 독립. 브라우저 파일 핸들은 IndexedDB, 해시/텍스트 처리는 Web Worker.
서버 worker는 PostgreSQL jobs의 lease/fencing/idempotency를 사용하며 브라우저 Worker와 다르다.
DB는 PostgreSQL+pgvector, ORM은 Drizzle, 인증은 Better Auth 방향이다. 아직 설치·연결·migration은 하지 않았다.
Query는 서버 상태, reducer는 초안·stream·패널 상태. 외부 API 호출 중 DB 트랜잭션을 유지하지 않는다.
§7의 2MB/50MB는 현재 코드에서 2MiB/50MiB로 해석한 임시 한도이며 운영 전 조정한다.


## 코드 구성 원칙
기능은 apps/web/src/features/<기능>/ 아래에서 응집한다. 실제 필요에 따라 components, hooks, 순수 로직, 스타일과 가까운 테스트를 둔다.
페이지는 기능 조합, 컴포넌트는 표시/입력, hook/reducer는 React 상태/수명주기, domain은 순수 업무 규칙, adapter는 I/O를 담당한다.
분리 기준은 책임과 변경 이유다. 한 컴포넌트 또는 hook에 전체 기능을 옮기는 방식이나 전달만 하는 빈 계층은 피한다.
공유는 실제 소비자가 생겼을 때 수행하며 기능 간 계약과 의존 방향을 명시한다. 자세한 리뷰 기준은 guidelines.md의 유지보수·코드리뷰 절에 둔다.

## 공통 UI와 작업 계약
같은 모양/행동의 버튼·링크·상태는 공통 controls와 variant를 사용하며 파일 관리/채팅이 각각 재구현하지 않는다.
읽기 영역은 reading-surface 토큰을 공유하고 네이비 탐색 영역과 분리한다.
명세 docs/specs/workflows.md와 테스트 운영 docs/testing-strategy.md를 코드리뷰의 근거로 삼는다.
