# 기술 경계

## 선택 로컬 의미 검색 — 2026-11-15

`SemanticModelPanel`을 자료 찾기·폴더 설정에서 공유하고 Provider 소유 `SemanticModelController`만 전용 Worker를 시작한다. 설치 상태 확인은 Cache API만 읽으며 SDK·모델 추론·폴더 읽기를 시작하지 않는다. Transformers.js3.8.1과 ORT Web 버전을 고정하고 실행 파일만 앱에서 제공한다. 모델 가중치는 서버에 올리지 않고 설치 행동 뒤 공개된 고정 revision에서 받는다. Worker의 네트워크 guard는 고정 공개 파일만 허용하고 SDK가 파싱하기 전에 전체 크기·SHA-256을 검증한다. 추론 중 공개 파일 누락은 네트워크로 재설치하지 않고 기본 검색으로 돌아간다. 이는 전체 사이트의 오프라인 제공을 뜻하지 않는다.

모델 Cache는 브라우저 origin 안에서 공유한다. IndexedDB schema5의 semanticVectors·semanticStats·semanticEpoch는 owner/workspace/connection과 path/hash/parser/model 버전으로 격리한다. 본문은 벡터 행에 중복 저장하지 않는다. 현재 원본 읽기·hash 검사는 기존 Worker에서 유지하고, 일치하는 현재 본문의 구간만 의미 후보가 된다. 점수 계산은 의미 검색 Worker에서 한다. 삭제/clear 세대는 같은 저장 transaction에서 바뀌며 늦은 준비·결과를 거부한다. 의미 검색은 설명 문장과 사용자가 확인한 필수 조건을 분리하고 +검색어·구절·제외·형식·경로·명시 기간을 완화하지 않는다. 원격 질문 해석과 별도 기능이며 선택 자료의 AI 전송은 기존 발췌 확인·동의 경로를 유지한다.

한도·검증·라이선스 출처는 [명세](specs/optional-semantic-search.md), [검증](verification/optional-semantic-20261115/README.md)을 따른다.

원본 snapshot만 기존 source WebLock으로 보호하며 긴 모델 계산은 이 잠금을 점유하지 않는다. 벡터 저장은 documents/semanticVectors/semanticStats/semanticEpoch를 한 readwrite transaction으로 묶어 현재 본문 hash/parser/textLength까지 검사한다. 이 경계로 다른 탭의 기본 검색을 모델 계산에서 분리하고 오래된 준비의 덮어쓰기를 막는다.

## 현재 구조와 상태 소유 — 2026-11-13

현재 제품은 Next.js 앱 하나 안에서 기능별 모듈을 나누는 구조다. `src/app`은 페이지·layout·Action·Route Handler 진입점이고, `features`는 기능별 UI·상태·규칙·브라우저 저장소, `server`는 인증·DB·AI 외부 접근을 맡는다. 아래 날짜별 개정은 결정 당시의 기록이며 이 절을 현재 기준으로 읽는다.

| 대상 | 현재 책임과 경계 |
| --- | --- |
| 인증 | Better Auth + Prisma의 서버 세션과 HttpOnly 쿠키. 브라우저 Local Storage에 인증 토큰을 보관하지 않는다. |
| 대화·편집 | owner 범위 ConversationStateProvider가 대화와 초안을, 기록 편집기가 미저장 편집값을 소유한다. 공통 이탈 보호에는 이동 확인 callback만 전달한다. |
| 원본 파일 | 브라우저의 폴더 핸들·session·기능별 controller가 권한과 연결 세대를 검사한다. 서버가 사용자 폴더를 직접 읽거나 쓰지 않는다. |
| AI 기록 | 별도 사용자 지정 폴더에 검증된 버전을 저장한다. 전역 ID 충돌은 파일을 보존해 경고하고, 새 삭제 표식에는 기록 종류를 넣는다. 삭제 확정 뒤 현재 대화는 내용을 유지한 임시 대화로 분리한다. |
| 서버 요청 | Action과 채팅/auth Route Handler → 서버 서비스 → 세션·Origin·소유권·입력·비용 제한 → DB/공급자. 자료 본문의 전송 동의와 로컬 쓰기 승인은 별개다. |

FolderConnectionSession의 공통 owner·핸들·무효화 책임은 유지한다. 기능별 준비 상태의 집중과 전체 버전 재검증의 읽기 비용은 후속 개선 대상이다. [실행 흐름 안내](모아_전체_코드_흐름_설명서.md), [이번 수정과 검증](verification/audit-data-preservation-20261113/README.md)을 함께 읽는다.

## 저장 대화의 자료 근거 — 2026-11-09

완료된 자료 turn의 최소 근거 메타데이터를 로컬 AI 기록 형식으로 보존한다. `grounded-evidence`의 엄격한 스키마를 저장과 읽기 경계에서 공유하고 일반 모델 문맥에서 제외한다. `useGroundedConversation.openSavedCitation` → 공통 `SourcePreviewController` → `FolderConnectionSession.readSourceFile`에서 owner·연결·경로를 확인 → 기존 해시 Worker로 파일/인용문 및 재취득 바이트 확인 → 공통 미리보기 성공 뒤 `/files` 이동 순서다. 이동 취소 신호가 읽기 수명에도 연결되므로 취소된 본문이 파일 화면에 남지 않는다. 원본 전체 본문이나 핸들은 대화에 복제하지 않는다. [명세](specs/general-chat.md), [검증](verification/first-five/README.md).

## 자료 없는 일반 채팅 스트림 — 2026-11-09

`LiveConversation` 하나가 공통 대화와 입력을 소유한다. `useWorkspaceConversation`이 요청을 판별해 일반 스트림 또는 기존 검색/정리 controller로 연결하고 애매한 요청만 확인한다. 자료 UI는 `MaterialWorkPanel`과 기존 검색/준비/미리보기 컴포넌트를 재사용하며 전체 화면을 교체하지 않는다. owner 범위 `ConversationStateProvider`가 대화·초안·저장 선택을 유지한다. 일반 모델에는 완료된 일반 turn만 같은 origin `POST /api/chat`으로 보내며 로컬 작업 turn은 묵시적 문맥에서 제외한다. Route Handler → `server/chat/chat`의 세션·Origin·입력·원자 공유 한도 → 공급자 count → 생성 직전 세션 재검사 → 공급자 스트림 정규화 → 검증된 SSE 이벤트 → store/reducer 순서다. 서버는 토큰별 DB 쓰기나 대화 본문 저장을 하지 않는다. 승인한 로컬 기록과 자료 전송 동의는 별도 경계다. [단일 대화 검증](verification/unified-conversation/README.md).

이 채팅 경로와 위 고정 공개 모델 파일 Worker가 브라우저 fetch 예외다. 초기 전체 인증은 새 Headers 식별자로 요청 메모이즈 재사용을 피한다. 이후 생성 전·각 본문 공개 전에는 정확한 서버 세션 snapshot·로그인 자격·이름·workspace/owner/연결 관계를 새로 SELECT한다. RLS caller 설정과 SELECT는 같은 짧은 transaction이며 작업 공간 준비는 반복하지 않는다. 공개 검사 시작 기준은100ms다. 검사 전에 본문/완료 묶음을 고정하고 검사 중 공급자는 계속 읽으며 새 본문은 다음 검사를 받는다. 마지막 본문과 완료는 함께 고정했을 때 한 검사로 승인한다. 브라우저는 실제 받은 본문만120~650ms 동안 frame별로 표시하고 표시가 끝나야 완료 이벤트를 확정한다. 중지·세션 오류의 미표시 본문은 버리고 단절은 승인된 부분 답변을 미완료로 보존한다. 자동 재전송과 모델 응답을 기다리는 전체 시간 동안 유지하는 DB transaction은 없다. 세부 계약은 [일반 채팅 명세](specs/general-chat.md), [최신 검증](verification/progressive-chat/README.md)을 따른다.

## AI 공급자 선택과 전송 확인 — 2026-11-08

AI 공급자 연결 최신 개정: 샘플·정식은 서버의 공급자 설정과 같은 정리 지침·JSON Schema를 공유한다. page가 공급자 이름을 표시하고 Server Action에 고정하며 서비스는 예약 전에 현재 설정과 대조한다. 각 REST 어댑터는 공통 생성 입력을 변환한다. 인증·원본 재검사·멱등성·할당량·본문 근거 검증은 기존 경계에 남는다. [명세](specs/openai-provider.md), [검증](verification/openai-provider/README.md).

## 로컬 본문 자료 찾기 — 2026-11-08

현재 찾기와 정리는 상태/결과를 분리한다. 순수 검색 조건·근거 규칙, Provider 소유 찾기 controller, 기존 session의 owner/권한/세대/한도 읽기, 같은 Worker의 전체 본문 검색, 기존 preview의 원문 읽기를 연결했다. 서버/AI Action/DB/writer를 추가하지 않았고 검색 근거를 AI 전송 문서 DTO에 섞지 않는다. [읽기 순서와 근거](verification/document-find/README.md).

## 로컬 채팅 답변 연결 — 2026-11-08

질문 문장 해석은 선택 문서와 현재 근거 후보를 받는 브라우저의 순수 함수다. preparation controller가 최초 요청과 답변 초안을 따로 보관하고 기존 ReviewAnswer 검증을 통과한 전체 묶음만 반영한다. 타이핑은 동의를 바꾸지 않고 확정은 이전 제안/동의를 폐기한다. 새 서버 endpoint/모델 호출/파일 writer를 추가하지 않았다. [경계와 검증](verification/organization-reply/README.md).

## 대화 안 정리와 공통 비교 — 2026-11-08

대화 shell은 상호작용 위치만 제공하고 Provider/controller가 기존 상태를 소유한다. 조건 입력/자료 표시/전송 확인/결과와 경로 비교를 표시 책임으로 나눴다. `buildComparisonTrees`는 파일 접근 없는 투영이며 실행 승인·충돌 검사·writer가 아니다. 일반 계획·managed 검토·AI·시안이 같은 비교를 쓴다. [읽기 순서와 검증](verification/chat-first-live/README.md).

## 정식 정리 후속 경계 — 2026-11-08

질문/답변 DTO 검증은 shared, 인증/입력/예약/공급자는 server, 폴더 handle/참고 메타데이터/재검사는 browser session이 소유한다. execution controller는 AI 문서 ID를 기존 ManagedRequest로 투영하고 별도 writer 없이 기존 보존·실행·복구를 호출한다. 원본 버전 변경은 옛 제안의 모든 묶음을 차단한다. [호출 순서](reports/live-organization-completion-reading.md), [검증·한계](verification/live-organization-completion/README.md).

## 공통 탐색과 데이터 어댑터 — 2026-11-07

WorkspaceSidebar·WorkspaceFolderTree·ConversationWorkspace는 표시와 이벤트를 받는다. 실제 SourceFolderTree/SourceConnectionControl은 기존 Provider·controller를 사용하고 샘플은 SampleFolderTree/store를 주입한다. 공통 표시 컴포넌트는 사용자 핸들/계정/샘플 상태를 혼합하지 않는다. 목록 activate는 각 경로의 SourceFolderTree가 소유한다. 설정/대화/파일의 실제 연결 수명은 기존 상위 Provider에 남아 있다.

빠른 전환은 공유 경로 생성기와 사용자 기기 설정만 사용하며 앱 루트에서 이동 간 유지한다. 서버 API·원본 쓰기·모델 호출을 실행하지 않는다. 샘플 후보 검색은 이미 공개된 본문에서 입력 크기를 제한하는 사전 단계이며 최종 분류나 서버 검증의 대체가 아니다. 서버는 등록 ID·본문·동의·세션·Origin·quota·countTokens·출력 근거/경로를 다시 검사한다. [명세](specs/workspace-navigation.md), [검증과 읽기 순서](verification/workspace-navigation/README.md).

## 샘플 작업 공간 연결 — 2026-11-07

`/demo`는 정식 `(workspace)`와 별도인 샘플 세션 경계다. `server/demo/sample-session`의 서명·만료 검증과 별도 쿠키, `server/demo/sample-catalog`의 공개 10개 자료, `features/sample-workspace`의 탭 저장소·가상 위치 상태를 사용한다. 정식 인증/DB/SourceFolderProvider와 연결하지 않는다. 공통 WorkspaceShell·Stepper·목적지 picker/controller/path form·계획 생성/표시를 재사용하며, PDF 페이지/엑셀 셀 미리보기와 원본 다운로드는 등록 샘플에 한정한다. 분류 검증은 서버→feature 의존을 만들지 않도록 `shared/ai-classification.ts`로 옮겼다. [구조/수명](specs/sample-workspace.md), [실행 증거/한계](verification/sample-workspace/README.md).

## 정식 사용·테스트 사용 구조 명세 — 2026-11-07

정식 사용과 테스트 사용을 모두 제공하는 요구를 [두 사용 구조 명세](specs/workspace-modes.md)에 작성했다. 공통 파일 작업 화면·계획/실행/복구 규칙을 재사용하고 세션·허용 작업·저장소를 분리하는 기준안이다. 기존 정식 인증 보호를 유지하며 테스트 자료가 실제 사용자 자료로 넘어가지 않도록 한다. 현재 [분류 입력/결과 검증과 샘플 테스트셋](specs/ai-classification.md)을 구현했다. 정식은 TXT·MD, 등록된 샘플은 PDF·XLSX까지 허용하며 사진은 제외한다. 테스트 세션·저장소·화면·AI 연동은 아직 후속이다.

## 이메일 인증 UI 개정 — 2026-11-06

인증 UI는 `features/auth`, 서버/브라우저 공통 타입 계약은 `shared/auth-contract.ts`, 진입 action은 `app/actions/auth.ts`, 입력검증과 인증 프로토콜 조합은 `server/auth/auth-forms.ts`다. app 페이지가 feature에 action을 전달하므로 feature→app/server→feature 역방향 의존이 없다. Server Action은 자기 API에 HTTP fetch하거나 보호를 건너뛰는 direct auth.api 호출 대신 같은 프로세스의 auth handler를 거쳐 요청 제한/Origin을 유지한다. 응답 쿠키는 Better Auth 공개 parser/options로 Next cookies에 옮긴다. 로그인 후 `/account`는 실제 세션으로 확인하며 기존 로컬 개발 owner는 후속 전환까지 유지한다. [실행 증거/한계](verification/auth-ui/README.md).

## 이메일 인증 API 개정 — 2026-11-06

`/api/auth/[...all]`을 이메일 인증 프로토콜용 최소 Route Handler로 연결했다. 서버 `auth-handler.ts`가 허용 경로/메서드·no-store·최소 JSON을 담당하고 `auth.ts`의 Better Auth는 검증 전 로그인 금지·서명 세션·재설정 토큰 단발소비/세션폐기를 맡는다. `auth-mail.ts`는 기존 fetch와 Resend를 사용하며 Next after 수명관리로 전송한다. 검증 코드와 실제 발송 한계는 [최신 검증](verification/auth-database/README.md)을 따른다. 메모리 요청제한은 다중 인스턴스 공개 전 공유 저장소/프록시 검증이 필요하다. 화면·소셜·브라우저 owner 연결은 후속이다.

## 서버 DB 연결 개정 — 2026-11-06

`src/server/database`에 제한 runtime 역할·공개 CA를 사용하는 PrismaPg client를 추가했다. `src/server/auth/auth.ts`는 기존 Better Auth의 Prisma adapter와 유효 세션 조회를 연결하고, `src/server/auth/workspace.ts`는 세션 User.id로 같은 트랜잭션의 RLS 문맥과 기본 Workspace를 초기화한다. 입력으로 userId/workspaceId를 받지 않고 최소 owner DTO만 반환한다. 인증 endpoint·로그인 화면·메일/OAuth·브라우저 owner 교체는 아직 없다. 아래의 앱 DB client/인증 인스턴스 미구현 기록보다 이 절을 우선한다. [실행 증거와 한계](verification/auth-database/README.md).

## 인증 준비 개정 — 2026-11-05

인증은 Better Auth 1.7.17, ORM은 Prisma 7.10.1, 서버 DB는 Supabase PostgreSQL로 선택했다. `apps/web`에 Better Auth·Prisma Client와 개발용 Prisma CLI를 정확한 버전으로 설치했다. 아래 Drizzle 후보 기록보다 이 결정이 우선한다.

Prisma schema/client와 초기 migration·grant/RLS SQL을 작성해 격리된 PostgreSQL24검사를 통과했고, 사용자 지시로 실제 Supabase에 제한된 역할과 5개 테이블을 적용했다. runtime 접속·TLS·RLS 검증과 검증 행 롤백까지 확인했다. 인증 인스턴스·API·앱 runtime DB client·메일 발송은 아직 구현하지 않았고 기존 개발용 소유자도 교체하지 않았다. [검증과 남은 TLS/앱 연결 범위](verification/auth-database/README.md).

인증 4테이블·개인 Workspace·소유권/DB 역할·로컬 자료 보존 계약은 [인증 DB 설계](specs/auth-database-design.md)에 정리했다. 테이블 적용을 실제 로그인 기능 완료와 구분한다.

로컬 origin은 `http://127.0.0.1:3034`로 유지한다. 서버 비밀값은 Git에서 제외되는 `apps/web/.env.local`에 저장하고, 운영 값은 Vercel Production 환경 변수로 관리한다. 실제 인증 구현 시 인증·소유권·DB 권한의 책임을 구분하며, 기존 서버 전용 접근과 로컬 원본 보호 계약을 따른다.

2026-10-28 최신 구조: src/app은 라우트 진입점, components/layout·ui는 공통 프레임/표시, features/local-folders는 기능별 components와 providers/hooks/store/services/lib/types로 구성한다. 테스트는 src 밖 apps/web/tests·packages/domain/tests·루트 tests에 분리했다. 원본 읽기·다중 선택·연결 관리 팝업까지 구현했으며 실제 로그인·서버 DB·원본 쓰기는 미구현이다. [현재 소스 지도](code-map.md), [현재 검증](verification/readable-structure/README.md). 아래 날짜별 기술 결정은 그 시점의 범위를 나타낸다.

## 서버 데이터 경계 개정 — 2026-10-27

브라우저에서 시작하는 업무 요청은 Server Actions → 서버 전용 서비스/데이터 접근 → 외부 API/DB로 제한한다. 최초 화면 조회는 Server Components에서 같은 서버 전용 서비스를 직접 사용한다. 서버 데이터 정규화·업무 계산·소유권 필터링·표시 DTO 생성은 서버 책임이며 클라이언트는 표시/입력 상태를 맡는다. 서버 전용 코드 위치는 `apps/web/src/server/`, Action 진입점은 `apps/web/src/app/actions/`다. 2026-10-27 당시에는 연결된 서버 업무 기능이 없어 빈 서비스나 가짜 인증 Action을 만들지 않았다. 현재 서버 연결은 위 최신 절을 따른다.

2026-10-27 당시 페이지는 Server Components와 Client Components를 조합했고, 당시 production build의 작업 화면은 정적 사전 렌더링이었다. 요청마다 SSR하는 인증 화면을 이미 구현했다고 표현하지 않는다. 폴더 연결/탐색은 hydration 이후 브라우저 File System Access·IndexedDB를 사용하는 로컬 기능이다. 이를 서버 호출로 전환하거나 동의 없이 업로드하지 않는다.

2026-10-27 당시 `/api/health` 이외 서버 업무 API·인증·DB는 미구현이었다. 아래 Route Handler 중심 초안과 Query 후보는 과거 설계이며 이 개정이 우선한다. OAuth callback/webhook/실시간 스트림의 Route Handler 예외는 향후 별도 계약 전까지 구현하지 않는다. Server Actions도 공개 POST 호출 경계이며 응답은 DevTools에서 보인다. 상세 허용/금지·검증은 [가이드라인](guidelines.md#서버-통신과-데이터-책임--사용자-요구-2026-10-27)을 따른다.

2026-11-12 실행 경계: 이전 `/preview`와 `prototypes` 소스를 제거했다. 실제 작업은 기존 기능별 controller·Provider·서버 경계를 유지하고 `/demo`는 독립 합성 session으로 체험한다. 공통 표시/CSS는 재사용하되 제품에서 테스트 fixture나 시안 구현을 import하지 않는다. 아래 2026-10-26 기록과 [당시 수용 기준](specs/live-workspace.md)은 과거 단계의 근거다.
## 최신 보관 결정 — 2026-10-25
[개인 AI 로컬 보관 계약](specs/local-ai-storage.md)이 본문·기억·결과물의 저장 위치를 정한다. 사용자 지정 AI 폴더가 장기 보관 기준이며 브라우저 저장소는 캐시·임시 저장·장치별 연결을 담당한다. 원본 자료의 쓰기 권한과 AI 기록 저장 권한은 구분한다.

서버 DB는 인증·세션·동의·사용량 등 최소 운영 정보 중심이다. 대화·기억·결과물 본문을 기본 영구 저장하지 않는다. 선택한 내용의 외부 AI 처리는 별도 전송 동의를 따른다. 서버 본문 체크포인트를 전제한 재연결과 검색·색인 구조는 재설계 대상이다.

아래 PostgreSQL/Drizzle/Better Auth는 2026-10-25 당시 후보 방향이다. 현재 설치된 Better Auth·Prisma·PostgreSQL 구조는 위 최신 절을 따른다. 서버 pgvector·지속 색인 worker는 초기 필수 구조에서 제외하고 필요성이 입증될 때 다시 검토한다. 이 결정이 과거 서버 중심 설계보다 우선한다.

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
# 2026-11-08 인증된 로컬 발췌 요청

정식 route에 명시적 전송 Action을 연결했다. 선택 파일을 session/Worker로 다시 읽어 확인한 버전과 비교한 뒤, 서버에서 실제 workspace·Origin·scope/발췌해시/입력량·시간 포함 요청ID를 검증한다. 기존 원자 예약의 전역 키를 샘플과 공유하고 작업 공간/계정 한도를 별도로 둔다. 샘플/정식은 `organization-generation`의 의미/인용 정책과 Gemini adapter를 공유하며 익명 세션이나 샘플 catalog 권한을 공유하지 않는다. 본문/결과 영구 저장·자동 요청·원본 적용은 없다. 아래 이전 절의 정식 AI 비활성 설명은 당시 상태다. [실행 근거와 검증 한계](verification/live-ai-transfer/README.md).

# 2026-11-07 Gemini 샘플 호출

`app/demo/page` → 주입된 `app/actions/sample-ai` → `server/demo/sample-ai`(서명 세션/Origin/동의/등록 ID) → `auth-rate-limit.consumeAll`(기존 DB의 원자 예약) → `server/gemini-classification`(countTokens/구조화 생성/검증) → 탭별 제안 보관과 공통 계획 검토다. 모델 대기 동안 DB 트랜잭션을 유지하지 않는다. 기존 인증의 단일 consume은 유지하며 여러 샘플 한도는 정렬된 키와 rollback으로 함께 예약한다. 모델키/원본 바이너리/holdout은 클라이언트 호출 입력이 아니다. 취소는 응답 반영을 중지하며 provider는 서버 timeout으로 제한한다. 실제 정식 개인 파일 AI와 배포는 별도다. 최신 검증: [sample-gemini](verification/sample-gemini/README.md).
# 2026-11-07 대화 기반 정리

정식 route는 LiveConversation+실제 SourceFolderProvider, 샘플 route는 SampleConversation+가상 상태를 통해 공통 ConversationWorkspace를 조합한다. 표현 공유가 권한/핸들 공유를 뜻하지 않는다. 정식 개인 AI 전송은 비활성 상태다. 샘플 자연어 Action은 서버 등록부→공통 원자 예약→기존 Gemini REST/countTokens 전송→새 organization 결과 검증→기존 변경계획으로 연결된다. 정확한 본문 인용·선택 ID·단일 본문 날짜·안전한 상대 경로를 검증하며, 가상 표시 루트 하나만 정규화하고 source 루트는 거부한다. 주제 요청에 날짜 필터가 섞이지 않도록 요청별 지침v2를 공급한다. 신규 가상 폴더는 최종 승인 참조만 커밋하고 폴더 이력까지 복원/되돌린다. 운영 개인 AI/파서/튜토리얼/배포와 분리한 증거는 [conversation-organization](verification/conversation-organization/README.md)에 있다.

후속 지침 v3에서는 날짜 키워드로 기간 필터/날짜별 정리를 함께 켜던 분기를 제거했다. 모델이 요청의 긍정·부정 의미를 읽되 기간 필터와 폴더 그룹을 독립적으로 판단하도록 조건을 제공한다. 본문 날짜·인용·경로를 검사하는 결정적 응답 파서는 그대로 유지한다. 모델의 의미 해석은 이 지침만으로 보장하지 않으며 실제 응답 평가와 분리한다. 근거: CO-010, [실모델 평가](verification/organization-evaluation/live-evaluation.md).

현재 지침 v4는 확인된 기간 밖 문서의 불필요한 보류를 방지하고, 요약을 적용 전 제안으로 표현하도록 추가했다. 실제 한 요청의 실패와 재검증은 [기대값·평가 검토](verification/expectation-review/README.md)에 있다. 정식 TXT/MD는 탐색 범위/참고 기준/목적지와 외부 전송 동의를 분리하는 [LT 명세](specs/live-txt-md-consent.md)를 준비했으며 아직 개인 자료 API를 활성화하지 않았다.
# 2026-11-08 설정 표시 데이터의 요청 간 재사용

설정 DTO는 server/settings/settings-display.ts에서 매 요청 세션 확인 후 사용자와 로그인별 key로 Next Data Cache를 조회한다. workspace layout의 초기 준비와 settings page가 같은 reader를 사용한다. 토큰·원본 SDK session·cookie는 새 cache에 넣지 않고 기존 fresh 권한 경계를 유지한다. 현재 Cache Components 미활성 모델의 unstable_cache를 사용하며 전역 렌더·Provider 수명은 바꾸지 않는다. 변경은 SDK hook과 계정 관계 서비스의 commit 뒤 tag 만료로 반영한다. 세부 계약은 [명세](specs/settings-display-cache.md), 호출 흐름과 검증 한계는 [설명](reports/settings-display-cache-reading.md)을 따른다.
