# 개인 AI 작업 공간 — 제품·기술·개발 운영 설계 v0.3

작성일: 2026-10-15. 개정일: 2026-10-23. 상태: 구현 전 설계 초안. 기존 링크 유지를 위해 파일명은 v0.1을 유지하며 문서 내용 버전은 v0.3다. 디자인 시안과 별개로 실제 서비스 아키텍처를 제안하는 문서이며 아래 애플리케이션 경로는 생성 예정 경로다. 수치들은 측정 결과나 보장치가 아니라 검증할 초기 목표다.

이번 개정: 초기 개발의 두 핵심 축을 웹 챗봇 채팅 화면과 로컬 파일 관리로 확정하고, 13장 개발 순서와 25장 초기 범위·완료 기준에 반영했다. 이전 개정의 18~24장 프레임워크·아키텍처는 유지한다. 라이브러리 설치나 서비스 구현은 수행하지 않았다.

## 1. 제품 정의와 범위

사용자가 여러 로컬 문서 폴더를 연결하고, 개인 지식·프로필·확인된 기억을 쌓으며 자유롭게 AI와 대화하는 웹 작업 공간. 공부와 이력서 작성은 활용 예시이며 특정 목적 선택을 대화의 진입 조건으로 두지 않는다.

- 개인 지식: 원문과 연결된 검색 가능한 문서, 주제별 모음, 추후 지식 위키.
- 프로필: 학습 목표, 보유 경험, 선호 문체, 답변 방식. 사용자 수정이 최우선이다.
- 확인된 기억: AI가 제안하고 사용자가 승인한 사실과 선호. 출처·승인일·수정 이력을 보관한다.
- 공부/이력서 봇은 동일한 기반 위의 목적별 설정이다. 사용자마다 별도 모델 가중치를 생성하지 않는다.
- 기본 분류는 가상 모음이며 원본 이동은 별도 기능이다.
- 메인은 채팅이며 연결된 여러 폴더를 시각적으로 확인하고 대화 범위를 선택할 수 있다. 파일·결과물은 필요할 때 패널로 열고, 닫으면 대화 위치와 입력 초안을 유지한다. 파일 관리·내 정보는 별도 접근점을 제공한다. 모바일은 채팅 우선이며 초기 로컬 폴더 기능의 주 지원 환경은 데스크톱 Chrome/Edge다.
- 성장 시각화는 후순위. 초기부터 문서 연결·기억 승인·사용자 수정 이벤트를 기록하되 문서 수를 지능 수치로 표현하지 않는다.

초기 전제: 1인 또는 소규모 개발, 비공개 테스트 10명 → 베타 100명. 실제 예산과 개발 가능 시간은 미정이다. 대규모 운영 가능성은 부하 시험 없이 주장하지 않는다.

**초기 개발은 ① 웹 챗봇 채팅 화면과 ② 사용자가 허용한 로컬 폴더·파일 관리에 집중한다.** 두 기능을 먼저 각각 사용할 수 있게 만든 뒤, 파일을 대화에 연결하는 흐름을 완성한다. 개인화·기억·위키·성장 시각화·로컬 모델 실행을 먼저 확장하지 않는다. ‘로컬 파일 관리’와 ‘로컬 AI 실행’은 별개이며 초기 AI는 웹 서비스의 관리형 API를 사용한다. 상세 범위와 완료 판정은 25장을 따른다.

## 2. 핵심 결정

| 항목 | 현재 권고 | 이유 / 재검토 시점 |
|---|---|---|
| AI 실행 | 관리형 추론 API, 공개 가중치 모델 후보 포함 | GPU 운영 없이 품질·비용을 측정. 모델 자체 개발/학습은 제외 |
| 자체 GPU 서버 | 보류 | 비용·가동률·동시 요청 실측 후 관리형 API와 총비용 비교 |
| 로컬 AI | 후속 선택 기능 | 브라우저 실행을 먼저 기술 검증하고 큰 모델/상시 실행은 로컬 연결 프로그램 검토 |
| 웹 프레임워크 | Next.js + React + TypeScript | UI와 인증/API를 같은 저장소에서 관리. 핵심 작업 화면은 클라이언트 영역 |
| 인증 | Better Auth + PostgreSQL | Google/Kakao/Naver 제공자 구성, 세션과 사용자 데이터를 일관되게 관리 |
| 데이터 | PostgreSQL + pgvector + JSONB | 관계·설정·검색 벡터를 역할별로 저장 |
| 파일 원본 | 사용자의 로컬 폴더 | 서버는 선택된 문서의 추출 텍스트와 색인을 저장하는 클라우드 모드 |
| 저장소 운영 | 단일 Git 저장소, 짧은 기능 브랜치 + PR | 1인 개발에서도 변경 근거와 검증 기록 보존 |

관리형 공개 모델 API는 특정 모델의 한국어·인용·구조화 응답 성능을 평가한 뒤 결정한다. 특정 업체의 무료 티어나 가격에 의존하지 않는다. 공개 가중치와 오픈소스 라이선스는 동일한 의미가 아니므로 모델 카드와 배포 조건을 확인한다. 관리형 서비스 예시는 Hugging Face Inference Providers이며 종량제 선택지가 있다. [공식 가격 구조](https://huggingface.co/docs/inference-providers/pricing)

자체 호스팅 후보는 vLLM이다. HTTP 호환 인터페이스가 있어 공급자 교체에 유리하지만 인증·네트워크·GPU 운영은 별도로 설계해야 한다. 호환 API라도 도구 호출·구조화 출력 동작은 모델별 계약 테스트를 거친다. [vLLM 공식 문서](https://docs.vllm.ai/en/stable/serving/online_serving/openai_compatible_server/)

## 3. 클라우드와 로컬의 데이터 약속

클라우드 모드는 '원본 파일은 내 컴퓨터에 있고, 선택한 문서의 텍스트·검색 색인·프로필·대화는 서비스에 저장된다'고 명시한다. 벡터만 저장한다고 익명화되는 것은 아니다. 임베딩 공급자는 색인할 텍스트를, 생성 공급자는 선택된 근거와 질문을 처리한다. 공급자의 보관·학습 이용 조건은 선정 게이트다.

| 정보 | 클라우드 MVP | 향후 완전 로컬 모드 |
|---|---|---|
| 원본 파일 | 로컬 폴더 | 로컬 폴더 |
| 추출 텍스트·검색 벡터 | 서버 PostgreSQL | 로컬 저장소 |
| 프로필·승인 기억·대화 | 서버 PostgreSQL | 로컬 저장소, 명시적으로 선택한 항목만 동기화 |
| AI 답변 생성 | 외부 관리형 API | 브라우저 또는 로컬 프로그램 |
| 파일 접근 핸들 | 해당 브라우저 IndexedDB | 해당 장치 |
| 로그인 정보 | 서비스 인증 DB | 온라인 계정 기능 이용 시 서비스 인증 DB |

로컬 전환은 생성 모델 주소 변경만으로 끝나지 않는다. 텍스트 검색·임베딩·기억·대화도 로컬로 옮기고 클라우드 AI로 자동 재시도하지 않아야 한다. 과거 서버 복사본은 별도 삭제 요청으로 정리하며 백업 보존 기간과 즉시 검색 차단을 구분한다.

개인 AI 내보내기는 버전이 있는 JSON manifest + 프로필/기억/분류 + 문서 참조/선택적 텍스트로 만든다. 세션·OAuth 토큰·API 비밀키는 제외한다. 벡터는 선택적 캐시다. 임베딩 모델이 달라지면 원문으로 재생성한다. 원본 폴더 접근 권한은 장치 간 이동되지 않는다.

## 4. 시스템 책임과 기술 구성

브라우저 → Next.js API/BFF → PostgreSQL 및 AI 공급자. 긴 색인 작업은 API 요청과 분리된 Node 작업 프로세스가 실행한다. 두 프로세스는 같은 저장소의 도메인 코드를 공유한다.

| 계층 | 제안 | 책임 |
|---|---|---|
| 화면 | React + TypeScript, 신규 구성은 CSS Modules + CSS 변수 권고 | 채팅, 폴더 탐색, 접근성, 미리보기. 기존 v0 내보내기가 Tailwind이면 유지하고 토큰 통일 |
| 서버 데이터 상태 | TanStack Query | 목록/작업 조회 캐시, 무효화, 재시도. 파일 핸들은 넣지 않음 |
| 화면 내부 상태 | React state/reducer 우선 | 선택 문서·패널·작업 상태. 추가 전역 상태 도구는 필요할 때 |
| 브라우저 처리 | File System Access API, Web Worker, IndexedDB | 폴더 읽기, 해시, 텍스트 추출, 재연결 정보 |
| API | Next.js Route Handlers, 입력 스키마 검증 | 세션 검증, 소유권, 할당량, 작업 제출, 스트리밍 |
| 인증 | Better Auth | OAuth와 DB 세션. 프로토콜을 직접 재구현하지 않음 |
| DB 접근 | Drizzle ORM + 검토 가능한 SQL migration 권고 | 관계 스키마, pgvector 쿼리, 트랜잭션. 정확한 패키지 버전은 구현 시 고정 |
| 비동기 작업 | PostgreSQL jobs + Node worker | 색인, 재시도, 취소, lease 및 실패 복구 |
| 테스트 | Vitest, React Testing Library, Playwright | 로직/컴포넌트/사용 흐름 |
| 배포 | 웹 호스팅 + 관리형 PostgreSQL + worker 호스팅 | 실제 업체는 streaming 제한·리전·백업·예산 비교 후 결정 |

Next.js에서 파일 API는 클라이언트 컴포넌트에서 호출한다. 브라우저 전용 API를 서버 렌더링 중 접근하지 않는다. 장기 작업을 짧은 서버리스 요청 안에 넣지 않는다. [Next.js 경계 설명](https://nextjs.org/docs/app/getting-started/server-and-client-components)

v0.1에서는 별도 벡터 DB, Redis, Kubernetes, 여러 마이크로서비스를 기본 도입하지 않는다. DB 큐 대기/검색 부하가 병목으로 확인될 때 분리한다.

## 5. 사용자·로그인 설계

첫 소셜 로그인으로 계정을 만들고 필요한 기본 정보와 자료 처리 안내를 제공한다. 사용 목적과 상세 프로필 설정은 선택이며 일반 대화 시작을 막지 않는다. 문서 전송 안내는 폴더 연결 시 명시한다. 이메일·비밀번호 로그인은 초기 범위 밖이다. Google로 먼저 검증하되 공개 베타의 완료 조건에는 Kakao와 Naver를 모두 포함한다.

- 내부 user ID는 제공자와 독립적이다. 제공자 계정은 `(provider, providerAccountId)`의 유일 조합으로 연결한다.
- 동일한 이메일이라는 이유로 계정을 자동 병합하지 않는다. 로그인된 계정에서 재인증한 뒤 다른 제공자를 연결한다.
- 제공자가 이메일을 주지 않거나 동의를 거부해도 처리 정책을 가진다. 이메일을 사용자 권한 키로 사용하지 않는다.
- 세션은 HttpOnly/Secure 쿠키와 서버 검증을 사용한다. 비밀키·OAuth 토큰을 클라이언트 번들/localStorage에 두지 않는다.
- 개발/스테이징/운영의 앱 등록, callback URL, 비밀키를 분리한다. OAuth 실제 흐름은 고정 스테이징 도메인에서 검증한다.
- 앱 등록·외부 공개/검수 요건 확인을 초기에 시작한다. 라이브러리 제공자 지원이 서비스 공개 승인을 대신하지 않는다.
- 계정 삭제는 세션 폐기 → 새 작업 차단 → 검색 제외 → 관련 작업/캐시/데이터 정리 순서다.

Better Auth는 세 제공자의 공식 구성 문서를 제공한다. Auth.js 공식 문서도 신규 프로젝트에 Better Auth를 권고한다. [Google](https://better-auth.com/docs/authentication/google), [Kakao](https://better-auth.com/docs/authentication/kakao), [Naver](https://better-auth.com/docs/authentication/naver), [Auth.js 안내](https://authjs.dev/getting-started/migrate-to-better-auth)

## 6. 데이터 모델: 벡터와 JSON은 선택 관계가 아니다

일반 테이블은 관계와 권한, JSONB는 유연한 설정, vector는 의미 검색을 담당한다. AI의 정체성은 이 데이터와 버전이 있는 응답 규칙의 조합이다.

| 테이블/영역 | 주요 값 | 역할 |
|---|---|---|
| users/accounts/sessions | 인증 라이브러리 스키마 | 사용자·소셜 계정·세션 |
| workspaces | id, owner_id | 개인 지식 공간, MVP는 사용자당 하나 |
| assistants | workspace_id, purpose, settings_jsonb, version | 공부/이력서 봇 설정 |
| assistant_sources | assistant_id, source_id | 봇이 접근 가능한 자료 범위 |
| sources | workspace_id, logical_name, kind | 연결한 폴더의 논리적 식별. 절대 로컬 경로 업로드 제외 |
| source_bindings | source_id, device_id, last_seen | 장치별 재연결 상태. 실제 파일 핸들은 브라우저에만 보관 |
| documents | source_id, relative_path, current_version, deleted_at | 문서 ID와 현재 버전 |
| document_versions | document_id, content_hash, parser_version, status | 변경 감지와 색인 버전 |
| chunks | workspace_id, document_version_id, text, locator | 문단 텍스트와 행/섹션 등 출처 |
| embeddings | chunk_id, model_id, dimensions, vector | 검색용 벡터. 모델/차원별 호환 구조 분리 |
| profiles | workspace_id, fields_jsonb, version | 경험·목표·선호. 갱신 충돌 검출 |
| memories | workspace_id, assistant_id?, text, state, provenance, version | proposed/approved/rejected/superseded 상태 |
| collections / collection_documents | 주제명, 문서 연결 | 실제 파일을 이동하지 않는 다중 분류 |
| conversations/messages/citations | assistant_id, content, request_id, 근거 ID | 대화와 인용. 중복 요청 방지 |
| generations | conversation_id, workspace_id, request_id, state, scope_snapshot | 생성 중/완료/취소/실패와 요청 당시 자료 범위 |
| artifacts / artifact_versions | workspace_id, conversation_id, source_message_id, version, content | 대화에서 생성한 결과물과 수정 버전. 원본 파일과 구분 |
| jobs | tenant, kind, status, lease_until, attempts, idempotency_key | 백그라운드 작업 |
| usage_events | model, token counts, job, request_id | 토큰·요청·색인 사용량. 내용 로그와 분리 |
| growth_events | event_type, source_ref, created_at | 후속 성장 시각화를 위한 최소 이벤트 |

복합 외래키 또는 동등한 제약으로 다른 workspace의 chunk나 source를 연결할 수 없게 한다. 자료는 workspace 단위로 색인하고 봇은 접근 범위만 참조하여 같은 문서를 봇마다 중복 색인하지 않는다.

모든 업무 데이터 접근에서 세션으로 확정한 사용자와 workspace를 검사한다. 요청 body의 user_id를 권한으로 신뢰하지 않는다. 브라우저의 직접 DB 접근은 허용하지 않는다.

업무 테이블에는 PostgreSQL RLS도 적용한다. Better Auth 세션이 DB RLS와 자동 연동되는 것은 아니다. 서버가 검증한 사용자 컨텍스트를 DB 트랜잭션에 설정하고, 비소유자·비 BYPASSRLS 런타임 역할을 쓴다. 연결 풀의 세션 변수를 전역으로 남기지 않는다. 인증 테이블용 접근과 업무 데이터 역할을 분리한다. worker도 테넌트별로 권한 범위를 확정한다.

조회뿐 아니라 삽입·수정에도 USING/WITH CHECK 정책을 둔다. 전역 job dispatcher는 작업 배정에 필요한 최소 메타데이터만 읽으며, 실제 문서 처리 전에 해당 job의 서버 확정 workspace로 범위를 제한한다. [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html), [트랜잭션 범위 SET LOCAL](https://www.postgresql.org/docs/current/sql-set.html)

pgvector는 PostgreSQL 내부 벡터 검색을 제공한다. 소규모에서는 테넌트 범위의 정확 검색부터 측정하고, 규모가 커지면 HNSW 등을 검토한다. 근사 검색의 필터가 결과 수/재현율을 낮출 수 있으므로 반복 스캔·인덱스·분할을 평가한다. 검색 후 프론트에서 다른 사용자 결과를 숨기는 방식은 금지한다. [pgvector 공식 문서](https://github.com/pgvector/pgvector)

## 7. 문서 처리와 답변 흐름

문서 연결:
1. 폴더 선택 → 읽기 권한 → 대상 확장자/파일 목록/제외 경로 미리보기.
2. MVP는 UTF-8 MD/TXT만. 임시 상한: 파일당 2MB, workspace당 500문서/추출 텍스트 50MB. 베타 측정 후 조정.
3. 브라우저 Worker가 해시/텍스트를 처리. 사용자가 확인한 문서만 서버로 전송한다.
4. 서버가 크기/형식/소유권/총량을 검증하고 버전 및 job을 만든다.
5. worker가 제목·문단 기준으로 분할하고 임베딩을 생성한다. 모델/청킹 규칙 버전을 남긴다.
6. 새 버전 색인이 모두 준비되면 활성 버전을 원자적으로 바꾼다. 재시도 시 중복 chunk를 만들지 않는다.
7. 처리 중에도 완료된 문서는 사용 가능하며 실패/취소/미처리 개수를 보여준다.

변경 감지는 최초에는 사용자가 누르는 새로고침과 화면 복귀 시 검사로 구현한다. 파일 크기/mtime으로 후보를 좁히고 hash로 확정한다. 폴더 연결 권한이 없다는 이유만으로 문서가 삭제됐다고 판단하지 않는다. 전체 스캔이 성공했을 때만 누락 파일을 삭제 후보로 표시한다. 원본이 변경되면 재색인 전까지 이전 색인 사용 여부와 마지막 갱신 시각을 표시한다.

답변:
1. 세션/봇/대상 자료 범위/할당량 검증.
2. 사용자 확인 프로필과 승인된 기억 중 필요한 항목을 선택.
3. 자료를 참고하는 요청이면 선택 범위의 활성 문서에서 키워드+벡터 검색한다. 자료 없는 일반 대화는 검색을 건너뛴다. 한국어 키워드 검색은 단순 영문 FTS 품질을 가정하지 않고 fixture로 검증.
4. 처음에는 상위 5~8개 chunk 등 제한된 근거를 전달하고 실제 token budget 안에 맞춘다.
5. 모델이 답변과 허용된 근거 ID를 생성. 서버가 인용 ID 존재·권한·버전을 검증한다.
6. 답변 스트리밍/중지, 출처 문서 열기, 기록 저장. 근거 부족 시 부족함을 표시한다.
7. 대화에서 기억 후보를 만들 수 있지만 사용자 승인 전 다음 답변의 확정 사실로 쓰지 않는다.

모델이 내놓은 출처 ID의 유효성과 문장이 실제 근거로 뒷받침되는지는 별개의 검증 항목이다. 이력서에서는 없는 수치·역할·성과를 만들어내지 않는 전용 평가를 한다. 문서 속 지시문은 자료이며 시스템 지침이나 파일 실행 권한이 아니다.

학습 자료 모드에는 '내 자료 기준 설명'과 '자료 내용 검토'를 분리한다. 외부 웹 검색은 MVP 밖이며 사용자의 메모를 외부 사실로 자동 확정하지 않는다.

## 8. 기억·프로필·위키

기억은 제안 → 확인/수정 → 승인 → 사용 → 수정/폐기 흐름이다. 출처 문서가 삭제되면 관련 기억을 검토 대상으로 바꾸고, 해당 원문을 포함한 파생 정보의 삭제 범위를 사용자에게 보여준다. 봇별 기억과 공통 프로필을 구분하며 다른 봇 대화를 묵시적으로 공유하지 않는다.

위키는 원본을 덮어쓰지 않는 생성된 요약 문서로 확장한다. 각 주장에 출처와 생성 버전을 붙이고, 사용자가 수정한 부분과 AI 초안을 구분한다. 원본 변경 시 위키를 '갱신 필요'로 표시하며 사용자의 수정을 자동으로 덮어쓰지 않는다. 자동 위키는 기본 RAG·기억이 검증된 다음 버전이다.

## 9. 분류와 파일 작업

MVP: AI가 문서 ID별 collection을 제안 → 사용자 편집 → 가상 분류 저장. 동일 문서는 여러 collection에 속할 수 있다. AI의 제안 JSON을 스키마/허용 문서 ID로 검증한다.

실제 이동은 후속 버전에서 별도 쓰기 권한으로 제공한다. 브라우저의 외부 파일 이동/디렉터리 이동 제약 때문에 대상 브라우저 기술 검증이 선행되어야 한다. [Chrome 공식 문서](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)

후속 파일 적용 절차: 계획 생성 → 변경 미리보기 → 사용자 적용 → 쓰기 권한 → 원본 hash 재검사 → 대상 생성/검증 → 원본 삭제 → 작업 journal 기록. 복사 후 삭제는 원자적이지 않다. 중단 시 중복 파일이 남을 수 있고 무조건적인 완전 복구를 보장하지 않는다. 경로 탈출·동일 이름·사용자 변경·링크 깨짐을 검사하며 초기 대상은 문서 폴더로 제한한다. 복구 역시 현재 파일 변경 여부를 확인한다.

## 10. 규모와 비용

저장량은 사용자 수만이 아니라 사용자당 문서 수·chunk 수·벡터 차원에 비례한다.

가정 예시: 1,000명 × 100문서 × 10chunk = 1,000,000벡터. 768차원 float32의 원시 값만 약 3.07GB(십진 단위)다. pgvector/행/인덱스/텍스트/WAL/백업은 별도이므로 실제 DB 용량은 더 크다. 이 예시의 차원은 모델 결정이 아니다.

월 비용 모델:
- 생성 비용 = 입력 token × 단가 + 출력 token × 단가.
- 색인 비용 = 신규·변경 문서의 임베딩 token × 단가.
- 인프라 비용 = DB/인덱스/백업 + 웹/worker + 전송량 + 관측 도구.
- 자체 GPU 비용 = GPU 가동시간 + 유휴시간 + 운영/장애대응 비용. 오픈 모델 자체가 무료여도 운영은 무료가 아니다.

보호 장치: 사용자별 일일 token budget, 단일 응답 상한, 동시 생성 1회/색인 작업 1회부터 시작, 전역 공급자 동시성 제한, 중복 요청 key, 작업 재시도 최대 3회 후 실패 큐, 예산 초과 차단. 다중 프로세스에서 통하는 DB 기반 사용량 예약/정산을 쓴다. 브라우저 차단 버튼만으로 비용 통제를 대신하지 않는다.

확장 순서: 제한/관측 → chunk 중복 제거와 변경분 처리 → 인덱스/쿼리 튜닝 → worker 증설/연결 풀 관리 → 필요 시 벡터 서비스 분리. 사용자 간 비공개 문서 텍스트/답변 캐시를 공유하지 않는다.

## 11. 로컬 전환을 위한 최소 경계

- GenerationProvider: 답변 stream, 취소, 사용량, 구조화 출력 capability.
- EmbeddingProvider: 모델 ID/차원, 배치 크기, embed.
- KnowledgeStore: 지정 scope의 문서/검색/삭제. 서버 Postgres와 미래 로컬 저장소 구현 분리.
- FileAccess: 폴더 선택/목록/읽기/권한 확인. 업로드 fallback과 후속 companion 대응.

v0.1에서는 클라우드 구현 하나만 완성하고 contract test를 둔다. 미래 공급자용 빈 패키지를 대량으로 만들지 않는다. 로컬 모드에서 서버 전송이 없는지 네트워크 검사로 검증해야 한다.

WebLLM은 브라우저 WebGPU 추론과 Worker 실행을 지원하지만 모델 다운로드·캐시·기기 메모리 제약이 있다. 브라우저 저장소는 사용자가 지우거나 quota/eviction 영향을 받을 수 있어 개인 AI 자산의 유일한 백업으로 쓰지 않는다. PWA 설치도 파일 접근 권한이나 상시 프로세스를 보장하지 않는다. [WebLLM](https://webllm.mlc.ai/docs/), [캐시/Worker](https://webllm.mlc.ai/docs/user/advanced_usage.html), [브라우저 저장소](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)

## 12. 제안 코드 구조와 작업 분담

아래는 생성 예정이며 현재 구현이 아니다.

```text
apps/web/src/app/                 페이지·API·인증 라우트
apps/web/src/features/auth/       로그인·온보딩
apps/web/src/features/library/    폴더·문서·가상 분류 화면
apps/web/src/features/chat/       대화·인용·중지
apps/web/src/features/artifacts/  결과물 패널·버전·내보내기
apps/web/src/features/memory/     프로필·기억 승인
apps/web/src/lib/files/           브라우저 FileAccess 구현
apps/web/src/workers/             해시·추출 처리
apps/worker/src/                  서버 색인 job 실행
packages/domain/src/             문서·기억·AI 인터페이스와 규칙
packages/db/                     스키마·migration·검색·소유권
tests/e2e/                       실제 사용자 흐름
evals/                           합성 문서·질문·정답 근거·평가 버전
docs/PRD.md                      요구사항과 제외 범위
docs/architecture.md             데이터 흐름과 저장 경계
docs/adr/                        기술 선택 이유와 대안
docs/roadmap.md                  단계·의존성·완료 기준
docs/runbooks/                   배포·복구·삭제·키 교체
```

1인 개발은 아래 단계를 순서대로 진행한다. 여러 명이면 공통 schema/API 계약을 먼저 정하고 UI/파일 접근, 인증/DB, 검색/AI를 나눌 수 있다. schema 변경 담당자를 한 명으로 두고 migration을 서로 덮어쓰지 않는다. 테스트·평가는 기능 구현 PR에 함께 포함하며 마지막에 몰지 않는다.

## 13. 개발 순서, PR, 버전

| 단계 | 산출물과 예상 PR 분할 | 완료 조건 |
|---|---|---|
| S0 기술 검증 | docs/product-scope, spike/folder-access, spike/model-eval, spike/auth-providers | 폴더 재연결/MD읽기/3사 로그인 설정 가능성 및 모델 후보 2~3개의 평가 기록 |
| S1 v0.1 기반 | chore/project-foundation, feat/auth-google, feat/workspace-isolation | CI 통과, 로그인/로그아웃, A/B 계정 격리 테스트 |
| S2 v0.2 초기 핵심 2축 | feat/chat-shell, feat/chat-stream, feat/folder-picker, feat/local-file-manager | 실제 웹 채팅과 로컬 폴더 탐색·파일 미리보기를 각각 사용 가능. 권한 복구·대화 초안 유지. 범위는 25장 |
| S3 v0.3 두 기능 연결 | feat/document-ingestion, feat/indexing-worker, feat/retrieval, feat/citations | 선택한 파일/폴더를 대화에 연결, 출처 확인, 변경분 색인, 재시도 중복 방지. 두 기능을 오가며 맥락 유지 |
| S4 v0.4 개인화 | feat/assistant-presets, feat/profile, feat/memory-review | 공부/이력서 봇, 승인 기억만 사용, 수정·삭제 반영 |
| S5 v0.5 분류·3사 로그인 | feat/virtual-collections, feat/auth-kakao, feat/auth-naver | 원본 이동 없는 다중 분류, 세 제공자 실제 로그인·취소·중복 계정 처리 |
| S6 v0.6 베타 | feat/artifacts, feat/data-export-delete, perf/library, test/beta-gates | 결과물 패널·내보내기/삭제, 할당량, 부하·보안·접근성 검증, 10명 사용자 시험 |
| S7 후속 | feat/wiki-drafts, spike/local-runtime, feat/local-mode | 원문 기반 위키, 로컬 export/import·재색인·무전송 검증을 각각 별도 릴리스 |
| S8 후속 | spike/file-operations, feat/file-plan-preview, feat/file-apply | 브라우저 지원 확인, 부분 실패/경로/충돌/복구 시나리오 통과 |
| 최후순위 | feat/growth-view | 실제 이벤트 기반 성장 표시, 과장된 지능 점수 없음 |

시간은 개발 가능 시간·모델 예산을 확인한 뒤 산정한다. 실제 파일 이동, 완전 로컬, 자동 위키가 끝나야만 MVP를 공개하는 구조로 만들지 않는다. 세 소셜 로그인은 베타 출시 필수 범위다.

## 14. GitHub 운영

- 저장소 하나, main은 항상 배포 가능한 상태. 장기 develop 브랜치는 초기에는 만들지 않는다.
- Issue 하나는 사용자 관점의 검증 가능한 결과 하나. 목적/범위/제외 범위/완료 조건/검증 방법/의존 Issue를 쓴다.
- 브랜치: feat/42-folder-picker, fix/57-index-retry, docs/12-data-policy, spike/8-browser-support.
- 기술 검증 결과는 docs로 남기며 실험 코드를 제품 코드로 무조건 merge하지 않는다.
- 작업 시작 시 Draft PR → 기능·테스트·문서 → CI → diff 검토 → squash merge → 브랜치 삭제.
- PR은 화면 하나보다는 독립적으로 검증·되돌릴 수 있는 변경 하나로 나눈다. DB migration은 종속 소비 코드보다 먼저 또는 같은 호환 PR에 포함한다.
- 커밋 예시: feat(library): add folder permission recovery. UI 라이브러리 교체 같은 무관 변경을 섞지 않는다.
- main에 PR/필수 CI/force-push 방지 규칙. 혼자라면 필수 타인 승인 수를 강제해 merge가 막히지 않게 한다. 가능한 보호 규칙은 GitHub 요금제/저장소 공개 여부를 확인한다.
- PR 미리보기는 합성 자료와 테스트 계정만 사용한다. 운영 DB·실제 이력서·API 비밀키를 preview/fork CI에 연결하지 않는다.
- GitHub Projects: Backlog → Ready → In progress → Review → Done. Milestone은 v0.1~v0.6.
- 기능마다 버전을 올리지 않는다. 검증된 단계에 tag v0.x.0, 수정은 v0.x.1. 공개 안정화 후 v1.0.0.
- CHANGELOG는 사용자에게 보이는 변화, 알려진 제한, migration을 기록한다. ADR은 바뀌면 기존 결정을 삭제하지 않고 대체 문서를 연결한다.
- DB migration 파일은 Git으로 관리하고 운영에 적용된 파일은 수정하지 않는다. 변경은 새 migration으로 추가하며 expand/contract 방식과 복구 계획을 기록한다.
- 모델/임베딩/프롬프트/청킹/평가 데이터 버전도 기록한다. 앱 버전만으로 답변 품질 변화를 추적할 수 없다.

이 흐름은 GitHub의 기능 브랜치·PR 기반 GitHub Flow를 따른다. [GitHub Flow](https://docs.github.com/en/get-started/using-github/github-flow), [보호 브랜치](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches)

PR 템플릿:
```text
문제와 변경 후 동작:
연결 Issue:
변경 범위 / 제외 범위:
검증 명령 및 결과:
화면 변경 증거:
권한·개인정보·비용 영향:
DB/프롬프트/모델 버전 변경:
실패 시 복구 / 알려진 제한:
```

## 15. 검증·출시 게이트

모든 성능 수치는 테스트 장치/브라우저/리전/데이터셋/동시 요청 수와 함께 보고한다. 아래는 초기 목표이며 미달 시 범위를 줄이거나 원인을 수정한다.

| 영역 | 검증 가능한 통과 기준 |
|---|---|
| 사용자 격리 | A/B 계정에서 문서·검색·기억·대화·job ID 교차 접근 테스트 모두 차단. 생성 요청에도 타 사용자 chunk 0개 |
| 인증 | 세 제공자 가입/재로그인/로그아웃/취소, 이메일 미제공, 기존 계정 연결 시나리오 검증 |
| 권한 | 거부/철회/재연결에서 원본 변경 0건, 재선택 안내 정상 |
| 색인 | 동일 job 2회 실행 후 중복 0건, 실패한 새 버전이 활성 버전을 덮어쓰지 않음 |
| 삭제 | 삭제 완료 후 검색/새 답변에 대상 문서 0개, 잔여 job이 자료를 부활시키지 않음 |
| 기억 | 승인 전 사용 0건, 수정/삭제 다음 요청에 반영, 출처 삭제 시 검토 표시 |
| 분류 | 가상 분류 전후 원본 hash/경로 동일, 잘못된 문서 ID 제안 거부 |
| 검색 품질 | 합성 한국어 MD/TXT 100개·정답 근거 질문 50개에서 Recall@5 목표 85% 이상 |
| 답변 품질 | 근거 없는 질문 20개 중 90% 이상 자료 부족 표시, 이력서 평가에서 허구 수치/경력 0건 목표 |
| 인용 | 허용되지 않은/존재하지 않는 citation ID 0개. 주장-근거 일치도 별도 사람 검토 |
| UI 성능 | 1,000개 목록 fixture에서 가상화/키보드 탐색, 색인 중 입력 반응 측정. 베타 현장 p75 INP 목표 200ms 이하 |
| 검색 지연 | 10만 chunk 합성 데이터·동시 검색 10개에서 검색 API p95 1초 이하 목표. 모델 생성 시간과 분리 |
| 모델 지연 | 후보별 첫 token 시간/전체 시간/token 비용 측정. 초기 첫 token p95 5초 목표는 모델·리전 검증 후 확정 |
| 작업 중지 | UI 즉시 중지 표시, 서버/공급자 취소 가능한 범위 실행, 이미 발생한 비용은 정산 |
| 삭제/백업 | 앱 검색 즉시 차단, 물리 삭제 처리 상태 표시, 백업 복구 시 삭제 tombstone 재적용 시험 |
| CI | 타입검사·lint·단위/통합·주요 E2E·production build 통과 |

PR CI는 AI 공급자를 모의 처리해 재현성을 확보한다. 실제 모델 평가는 모델/프롬프트/검색 변경 PR과 릴리스에서 제한된 예산으로 별도 실행한다. 실제 OAuth는 CI 모의 테스트와 고정 스테이징 수동 점검을 구분한다.

## 16. 주요 위험과 완화

- 원본 로컬이라는 표현이 서버 무전송으로 오해됨 → 연결 전 전송/저장 항목 표시, 모드별 데이터 정책.
- 로컬 폴더 접근 제한 → 데스크톱 Chromium 우선, 업로드 fallback, 장치별 재연결.
- 사용자 자료 혼합 → 서버 소유권+DB 제약+RLS+교차 계정 테스트, 캐시 키에 tenant 포함.
- 색인 비용 폭증 → 문서/텍스트/token 한도, 변경분 처리, 작업·비용 예약.
- AI가 파일을 잘못 조작 → MVP는 가상 분류, 후속 실행은 별도 권한·미리보기·결정적 검증.
- 무한한 학습처럼 오해 → 지식/기억/프로필 변경을 명시, 모델 재학습 주장 금지.
- 모델 전환 후 검색 불일치 → 임베딩 버전 고정, 새 인덱스 완성 뒤 전환.
- 삭제한 문서가 작업 재시도로 복구됨 → tombstone/generation 확인, 취소와 쓰기 차단.

## 17. 포트폴리오에서 남길 증거

README에 샘플 체험, 아키텍처, 지원 범위, 실제 성능 수치, 주요 ADR, 3분 시연을 둔다. 실제 개인 이력서 대신 합성 fixture를 공개한다.

핵심 사례는 ① Worker 전후 UI 반응 ② 증분 색인 전후 비용/시간 ③ 교차 사용자 유출 방지 테스트 ④ 근거 인용/환각 평가 ⑤ 실패 복구 UX다. 기술 이름 개수보다 문제·선택·측정·개선·한계가 연결된 PR을 남긴다.

다음 실제 작업은 S0의 PRD/ADR 초안, 폴더 접근 실험, 모델 비교 평가, 소셜 앱 설정 확인이다. 예산·작업 인원·일정이 확정되면 인프라 업체와 목표 용량을 결정한다. 이 문서는 설계 산출물이며 앱 구현·배포·GitHub 저장소/PR 생성은 수행하지 않았다.

## 18. 프레임워크 선정과 대안

### 18.1 권장 조합

**Next.js App Router + React + TypeScript → Better Auth → 애플리케이션 서비스 → Drizzle/PostgreSQL/pgvector**, 별도 Node worker를 같은 저장소에서 운영한다. 이를 ‘모듈형 모놀리스 + 비동기 작업 프로세스’로 정의한다. 기능별 코드는 나누되 초기부터 독립 마이크로서비스를 만들지는 않는다.

| 기술 | 이 프로젝트에서 맡는 역할 | 선택 이유 / 제한 |
|---|---|---|
| React | 채팅·폴더 탐색·결과물 패널 | 대화와 파일 상태를 컴포넌트로 구성. React 자체가 인증/DB 서버를 제공하는 것은 아님 |
| TypeScript | 브라우저·API·worker 간 타입 | DTO와 이벤트 계약 공유. 외부 입력의 런타임 검증은 별도로 필요 |
| Next.js App Router | 라우팅, 서버 화면 경계, 같은 도메인의 API | 소규모 팀이 웹과 BFF를 한 앱에서 운영. 선택 이유는 SEO보다 인증/API 통합 |
| Node.js LTS | 웹 서버와 worker 런타임 | TypeScript 코드 재사용. 구현 시 프레임워크가 지원하는 LTS 버전 고정 |
| Better Auth | 소셜 인증·세션 | 기존 5장의 세 제공자 요구사항 적용. 업무 데이터 권한은 별도 |
| Drizzle ORM | 일반 쿼리·스키마·migration | SQL을 함께 검토하기 좋은 선택. 검색/RLS/작업 선점은 명시적 SQL 사용 가능 |
| PostgreSQL + pgvector | 관계 데이터·기억·벡터·작업 상태 | 초기 운영 구성 단순화. JSONB나 벡터를 관계 모델의 대체재로 쓰지 않음 |
| TanStack Query | 서버 데이터 조회·캐시·갱신 | 폴더/대화목록/기억/작업 조회. 스트리밍 문자열을 token마다 Query 캐시에 쓰지 않음 |
| React reducer/context | 일시적 UI·채팅 생성 상태 | 초기에는 Redux/Zustand 없이 시작. 공유 상태의 복잡도가 확인되면 재평가 |
| CSS Modules + CSS 변수 | 신규 UI 스타일·토큰 | 라이브러리 기본 외관에 종속되지 않도록 구성. 기존 Tailwind 프로젝트는 불필요하게 전환하지 않음 |
| Web Worker + IndexedDB | 브라우저 문서 처리·기기별 상태 | UI와 CPU 작업 분리. 서버 job worker와 역할이 다름 |
| Vitest/Testing Library/Playwright | 규칙·컴포넌트·실제 흐름 | 타입검사만으로는 권한·스트림·복구를 입증할 수 없음 |
| pnpm workspace | 단일 저장소의 패키지 관리 | web/worker/domain/db 계약 공유. 별도 빌드 오케스트레이터는 초기 필수 아님 |

Next.js Route Handlers는 HTTP 요청/응답 경계를 제공하고, Drizzle은 TypeScript에서 SQL 성격의 접근을 제공하며, TanStack Query는 서버 상태를 관리한다. 위 조합은 이 서비스 조건에 대한 설계 권고이지 각 도구가 모든 요구사항을 자동 해결한다는 의미가 아니다. [Next.js](https://nextjs.org/docs/app/getting-started/route-handlers), [Drizzle](https://orm.drizzle.team/docs/overview), [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/overview)

### 18.2 대안 비교

| 대안 | 유리한 조건 | 이번 권고에서의 판단 |
|---|---|---|
| Vite + React + 별도 Node API | SPA와 API 팀/배포를 독립 운영 | 가능하지만 인증·배포 단위가 늘어남. 첨부 Figma Vite 시안은 UI 참고로 재사용 가능 |
| Next.js + NestJS 별도 API | 독립 백엔드 팀, 모바일 API, 많은 통합 기능 | 초기에는 중복 서버 계층 비용이 더 큼. 백엔드 분리 필요 시 검토 |
| React + FastAPI | Python 전처리/ML 파이프라인이 중심 | 현재 MD/TXT + 외부 모델 호출에는 두 언어 운영이 필수가 아님 |
| 별도 벡터 DB | 검색 부하·격리·운영 특성이 PostgreSQL 범위를 초과 | 정확도·지연·비용 측정 후 도입. 시작부터 이중 DB 동기화하지 않음 |

정확한 Next.js/React/인증/ORM 버전은 구현 착수 시 호환 조합을 확인해 package.json과 lockfile에 고정한다. 문서에 ‘최신 버전 자동 사용’을 구현 지침으로 남기지 않는다. 배포 업체와 모델 공급자는 예산·리전·데이터 보관 정책 검증 후 ADR로 확정한다.

## 19. 시스템 아키텍처와 책임 경계

```text
[사용자 컴퓨터]
 로컬 원본 폴더
       ↕ 사용자가 허용한 읽기
 브라우저
   ├─ 채팅 메인 / 폴더 시각화 / 파일·결과물 패널
   ├─ Web Worker: 해시·텍스트 추출
   └─ IndexedDB: 장치별 파일 핸들·임시 상태
       │ HTTPS / 인증된 요청 / 답변 스트림
       ▼
[서비스 웹 프로세스: Next.js]
 Route Handlers + Better Auth 세션 검증
       ↓ 런타임 입력 검증·소유권·할당량
 Application services
   ├─ ChatService → RetrievalService / MemoryService
   ├─ SourceService / DocumentService
   ├─ ArtifactService / ProfileService
   └─ ExportDeleteService
       ├─ DB adapter → PostgreSQL + pgvector
       ├─ AI adapter → 외부 생성 API
       └─ Job repository → PostgreSQL jobs
                                  ↕ 선점·lease·완료
[별도 Node 작업 프로세스]
 Indexing / Export / Cleanup handlers
       ├─ tenant 범위 DB 접근
       └─ Embedding adapter → 외부 임베딩 API
```

| 경계 | 허용하는 책임 | 금지/제한 |
|---|---|---|
| 브라우저 UI | 사용자 입력, 폴더 권한, 표시, 대화 범위 제안 | 공급자 비밀키·DB 연결 문자열 보관 금지 |
| HTTP handler | 세션, 입력 스키마, 요청 ID, 응답/stream | 검색/색인/메모리 규칙을 긴 라우트 함수 안에 혼합하지 않음 |
| Application service | 유스케이스 순서와 트랜잭션 경계 | Next.js Request/Response 객체에 핵심 규칙을 묶지 않음 |
| Domain | 승인 기억, 자료 범위, 버전, 상태 전이 규칙 | React/ORM/공급자 SDK 의존 금지 |
| Infrastructure adapter | DB, 모델 API, 작업 저장소 구현 | UI에서 직접 호출하지 않음 |
| Worker | 재시도 가능한 장기 작업 | 클라이언트가 보낸 owner_id를 신뢰하지 않음 |

web과 worker는 같은 도메인 규칙을 사용하지만 프로세스/동시성 제한은 별개다. 웹 서버가 사용자 컴퓨터의 폴더 경로를 받아 직접 읽는 구조가 아니다. 업로드된 선택 문서 내용만 처리한다.

## 20. 프론트엔드 아키텍처와 채팅 중심 상태 관리

### 20.1 화면·라우트 계약

| 경로 예시 | 역할 |
|---|---|
| `/app` | 새 자유 대화와 연결된 폴더. 목적 선택은 필수 아님 |
| `/app/chats/[conversationId]` | 대화 기록 복원, 입력창, 출처·결과물 열기 |
| `/app/files` | 상세 파일 관리. 대화로 복귀 가능 |
| `/app/settings/profile` | 프로필·답변 선호 |
| `/app/settings/memories` | 승인 기억·검토할 기억 |
| `/login` | 소셜 로그인 |

대화 화면의 `?panel=file&item=...` 또는 `?panel=artifact&item=...`는 선택적 패널 표시 상태다. URL의 ID는 접근 권한을 의미하지 않으며 서버에서 다시 검증한다. 민감한 문서 본문·질문·절대 파일 경로는 URL에 넣지 않는다.

`ConversationShell`이 초안·선택 범위·스크롤을 소유하고, `ContextPanel`은 그 아래에서 열고 닫는다. 파일/결과물을 열기 위해 채팅 컴포넌트를 unmount하지 않는다. 작은 화면에서는 같은 상태를 유지한 overlay/sheet로 보여준다.

### 20.2 상태의 소유권

| 상태 | 저장/관리 위치 | 수명과 규칙 |
|---|---|---|
| 확정 메시지·폴더·기억·결과물 | PostgreSQL → TanStack Query | 서버가 기준. query key에 사용자/workspace 포함 |
| 생성 중 token·중지 상태 | Chat reducer | 화면 수명. 서버 최종 메시지와 ID 기준으로 합침 |
| 입력 초안·선택 자료 | 대화별 React 상태 | 패널 전환 시 유지. MVP 새로고침 복구는 별도 명시 기능이며 묵시적으로 영구 저장하지 않음 |
| 파일 핸들·재연결 정보 | IndexedDB | 사용자/장치별 구획. 계정 전환 시 이전 사용자 핸들을 자동 연결하지 않음 |
| 필터·패널·선택 문서 ID | URL 또는 UI 상태 | 공유할 필요가 있는 탐색 상태만 URL 사용 |
| 인증 세션 | 서버 세션 + 보안 쿠키 | localStorage 토큰 저장 제외 |

로그아웃/계정 전환은 캐시·초안·스트림을 정리한다. Query의 재시도 정책은 조회와 변경 요청을 구분하며 메시지 생성 POST를 무조건 자동 재전송하지 않는다.

### 20.3 렌더링 경계

Server Component: 초기 세션 확인, 공개 설정, 필요한 첫 화면 데이터.
Client Component: 채팅 stream, 입력창, 폴더 선택, 파일 핸들, Web Worker, 패널 전환.
UI module은 DB 패키지를 import하지 않는다. 파일 API는 브라우저에서만 초기화한다. 한국어 IME 조합 중 Enter 전송을 차단한다. Markdown/문서 렌더링은 임의 HTML 실행을 허용하지 않고 링크 스킴도 검증한다.

## 21. API 계약·대화·결과물 데이터 흐름

### 21.1 API 초안

인증 라우트는 Better Auth 계약을 따르며 아래는 제품 API다. 모든 ID 접근은 세션 소유권과 workspace 권한을 검증한다.

| Method / 경로 | 역할 | 핵심 조건 |
|---|---|---|
| GET/POST `/api/sources` | 연결 목록/논리 폴더 등록 | 등록 자체로 브라우저 권한이나 업로드 완료를 주장하지 않음 |
| POST `/api/sources/:id/documents` | 선택 문서 버전 제출 | 본문 크기·해시·총량, idempotency key, 202 + job ID |
| GET `/api/documents/:id` | 자료/출처 조회 | 삭제 여부·버전·권한 검사 |
| GET `/api/jobs/:id` | 처리 상태 | 초기 polling, 노출 정보 최소화 |
| POST `/api/conversations` | 대화 생성 | 일반 대화용 기본 assistant 제공 |
| POST `/api/conversations/:id/messages` | 질문 제출·응답 stream | 범위 snapshot·생성 ID·중복 키·비용 예약 |
| POST `/api/generations/:id/cancel` | 생성 중지 | 동일 사용자만, 중복 중지 허용 |
| GET `/api/conversations/:id/messages` | 확정/미완료 메시지 조회 | cursor 페이지 처리, 재접속 복원 |
| GET `/api/artifacts/:id` | 결과물 조회 | 원본 문서와 별개 소유권·버전 |
| POST `/api/artifacts/:id/revisions` | 결과물 수정 요청 | base_version, 충돌이면 409. 대화와 연결된 생성 흐름 사용 |
| PATCH `/api/profile` | 프로필/선호 변경 | 런타임 스키마·낙관적 버전 검사 |
| POST `/api/memories/:id/approve` | 제안 기억 승인 | 허용 상태 전이·출처 확인 |
| POST `/api/exports` | 개인 AI 내보내기 요청 | 비밀키/세션 제외, job 처리 |
| DELETE `/api/sources/:id` | 연결 자료 삭제 | 클라우드 자료 삭제 범위 안내, 원본 파일 삭제와 구분 |

변경 요청에는 인증과 별개로 CSRF/Origin 정책을 적용한다. TypeScript 타입만으로 입력을 신뢰하지 않고 공유 런타임 스키마로 검증한다. SQL은 매개변수화한다.

### 21.2 스트리밍 계약

MVP는 HTTP POST + Fetch ReadableStream 기반 SSE 형식의 이벤트 응답을 권고한다. native EventSource는 POST 질문 전송에 쓰지 않는다. 브라우저는 event 경계를 파싱하며, 네트워크 chunk 하나가 token 하나 또는 JSON 하나라고 가정하지 않는다. WebSocket은 초기 필수가 아니다.

이벤트 종류: `accepted`, `text_delta`, `citation`, `artifact_ready`, `completed`, `cancelled`, `error`.
공통 필드: `generation_id`, `sequence`, `type`, `payload`. payload 스키마는 종류별로 구분한다. 인용/결과물 이벤트는 서버 검증 뒤 내보낸다.

흐름:
1. 서버가 세션/범위/할당량을 확인하고 사용자 메시지와 generation을 저장한다.
2. 질문 당시의 승인 기억과 source scope/version을 snapshot으로 기록한다.
3. 자료 없는 대화는 검색을 건너뛰고, 자료가 포함되면 허용된 범위만 검색한다.
4. 짧은 DB 작업을 끝낸 후 모델 API를 호출한다. 외부 모델 응답 동안 DB 트랜잭션/연결을 점유하지 않는다.
5. 답변을 전송하고 주기적 checkpoint 또는 완료 시 저장한다. 최소 저장 주기는 구현 시 정하고 매 token DB 쓰기는 피한다.
6. 완료/실패/중지 상태와 실제 사용량을 정산한다. 부분 응답은 미완료 상태로 표시한다.

네트워크 단절 시 UI는 `interrupted`로 표시하고 같은 요청을 자동으로 새 생성하지 않는다. 서버 상태를 조회해 완료 메시지 또는 미완료 상태를 복원한다. 웹 프로세스가 죽으면 heartbeat 만료를 정리하는 작업이 generation을 실패/중단으로 전환한다. 중지 요청은 공급자 취소가 가능한 범위에서 전달하며 이미 소비한 비용은 별도 정산한다. 연결이 끊긴 동안 생성이 계속되는지 여부는 배포 환경 시험으로 확정하고 사용자에게 일관되게 표시한다.

### 21.3 결과물과 권한

`artifacts`는 안정적인 ID, `artifact_versions`는 수정된 본문과 생성 근거를 가진다. 저장된 결과물을 수정해도 로컬 원본 파일은 바뀌지 않는다. 버전 충돌은 마지막 저장으로 덮어쓰지 않고 409 응답으로 처리한다. 결과물 패널은 별도 GET으로 로드되므로 긴 결과물을 채팅 목록에 매번 중복 포함하지 않는다.

자료 접근을 철회/삭제하면 새로운 검색은 즉시 제외하고 관련 진행 중 생성을 취소 대상으로 표시한다. 이미 모델 공급자에 전달된 내용이나 이미 표시된 응답을 소급 철회할 수 없다는 한계를 구분한다. 연결 해제, 클라우드 복사본 삭제, 대화·파생 결과 삭제는 별도 범위로 안내한다.

## 22. 비동기 색인·큐·실패 복구 아키텍처

작업 상태: `queued → running → succeeded` 또는 `failed/cancelled`. 재시도 가능한 실패는 attempts/next_run_at을 갱신해 다시 queued로 이동한다. 영구 형식 오류는 무한 재시도하지 않는다.

- 제출: 문서 버전과 job을 같은 트랜잭션으로 저장해 한쪽만 존재하는 상태를 방지한다.
- 선점: 짧은 트랜잭션에서 `FOR UPDATE SKIP LOCKED` 등을 이용해 한 worker가 job을 가져간다. 선점 뒤 외부 API를 호출하기 전에 트랜잭션을 종료한다.
- lease: 작업자 ID, 만료 시각, attempt/fencing token을 저장한다. 장기 작업은 heartbeat로 갱신한다.
- 복구: 만료된 lease는 제한된 횟수로 재배정한다. 늦게 돌아온 이전 worker는 현재 token과 일치하지 않으면 완료 결과를 반영하지 못한다.
- 멱등성: workspace/document/content hash/parser/embedding version을 조합한 처리 키로 중복 생성 방지. 외부 API 호출 비용까지 exactly-once라고 보장하지 않는다.
- 공개: 새 chunk와 vector가 모두 준비된 뒤 document의 active version을 원자적으로 전환한다.
- 취소: chunk 처리 사이 취소를 확인하고, 최종 공개 직전 문서 tombstone/세대 번호를 다시 검사한다.
- 장애 분류: 429/일시 장애는 backoff와 jitter, 형식·권한 오류는 즉시 실패, 최대 시도 초과는 수동 재시도 가능한 상태.

PostgreSQL 문서는 SKIP LOCKED가 일반적인 일관 조회보다는 queue 성격의 다중 소비자 경쟁 회피에 적합함을 설명한다. [공식 SELECT/locking 문서](https://www.postgresql.org/docs/current/sql-select.html)

브라우저 Web Worker는 사용자의 파일 읽기 보조 작업이며 이 서버 worker와 다르다. 브라우저가 닫히면 새 로컬 변경을 지속 감지할 수 없지만, 이미 서버에 제출된 색인은 별도 worker에서 계속 처리할 수 있다.

## 23. 배포·운영·환경 구성

### 23.1 초기 배포 토폴로지

```text
개발: web + Node worker + 개발용 PostgreSQL/pgvector + 모의 AI
스테이징: 고정 HTTPS 도메인 + 별도 OAuth 앱 + 테스트 DB + 제한된 실제 AI
운영: 웹 서비스 + 상시 worker + 관리형 PostgreSQL/pgvector + 모델 API
```

web과 worker는 DB와 가까운 리전에 둔다. 배포 단위는 분리하되 하나의 저장소/호환되는 공통 패키지 버전을 사용한다. 모델 공급자 비밀키는 서버 secret 저장소에만 두며 public 환경변수 prefix로 노출하지 않는다. 브라우저 핸들은 서버에 직렬화해 저장하지 않는다.

웹 호스팅 선정 게이트: streaming buffering 여부, 최대 요청 시간, client disconnect 처리, Node 지원, DB 연결 풀, 리전, 비용. worker 선정 게이트: 상시 실행, 정상 종료 유예, 재시작, 동시성 제한, 관측 가능성. 자체 컨테이너에서도 동일 조건을 검증한다. 업체 선택을 이 문서만으로 확정하지 않는다.

### 23.2 배포 순서

1. PR: 타입/lint/테스트/build, 합성 fixture preview. 운영 비밀정보는 preview에 제공하지 않는다.
2. 스테이징: migration 적용, OAuth·스트림·worker 복구·검색 평가.
3. 운영: 이전 코드와 호환되는 schema 확장 migration을 전용 단계에서 1회 실행.
4. 새 web/worker 배포. in-flight job을 고려해 이전 payload 버전도 필요한 기간 수용.
5. 상태 확인 후 오래된 열·인덱스 제거는 별도 릴리스. 앱 rollback과 DB 복원은 서로 다른 절차로 문서화.

migration을 모든 web replica의 시작 훅에서 동시에 실행하지 않는다. 공유 패키지의 job payload에는 버전을 둔다. 개발 DB와 운영 DB를 같은 자격증명으로 연결하지 않는다.

### 23.3 관측과 보존

측정: 요청/생성 ID, 첫 token 시간, 전체 생성 시간, 검색 p95, queue 대기, lease 만료, 재시도, token 비용, 취소, DB pool 대기.
기본 로그에는 문서 본문·질문·개인 프로필·OAuth 토큰을 기록하지 않는다. 품질 평가용 내용을 수집할 때는 별도 동의/보관 정책을 둔다.
web readiness는 DB 연결 등 필수 의존성, worker health는 heartbeat와 queue 지연으로 확인한다. 백업은 복원 시험까지 포함한다. RPO/RTO와 백업 보존 기간은 인프라 예산 확정 시 정하고 공개 전에 문서화한다.

## 24. 로컬 AI 확장·구현 순서·아키텍처 검증

### 24.1 실행 모드의 구분

| 모드 | 생성 | 검색·기억·대화 | 의미 |
|---|---|---|---|
| Cloud | 서비스 모델 API | 서버 DB | 초기 기본 |
| Hybrid | 로컬 모델 | 일부 서버 데이터 사용 | 로컬 모델을 사용해도 완전 로컬 아님. 전송 항목 표시 |
| Local | 브라우저/companion | 로컬 지식 저장소 | 개인 내용은 명시한 선택 동기화 외 서버 AI로 전송하지 않음 |

Local은 GenerationProvider만 바꾸지 않고 EmbeddingProvider, KnowledgeStore, 개인 데이터 저장 구현도 교체한다. 계정 로그인에 필요한 통신과 개인 문서/대화 전송을 구분한다. 클라우드 장애나 로컬 모델 오류 시 사용자 모르게 다른 모드로 fallback하지 않는다.

companion을 도입하면 인증된 pairing, 허용 origin 검증, 요청별 인증, 로컬 loopback 바인딩, 경로 제한, 업데이트 정책이 필요하다. 외부 웹페이지에서 임의 localhost API를 호출할 수 있게 열어두지 않는다. HTTPS 웹과 로컬 연결의 브라우저 정책은 기술 검증을 먼저 수행한다.

### 24.2 구현 단위

1. `packages/domain`: 자료 scope, 기억 승인, 생성/job 상태와 DTO 계약.
2. `packages/db`: schema, migration, 역할/RLS, A/B 사용자 격리 통합 테스트.
3. `apps/web`: 인증된 채팅 shell, 자료 없는 일반 대화, 스트림 중지/실패 복원.
4. `apps/web` 파일 기능 + `apps/worker`: 문서 제출·색인·버전 전환·작업 상태.
5. 검색과 승인 기억을 대화 파이프라인에 연결. source scope snapshot과 인용 검증.
6. `features/artifacts`: 대화와 결과물 패널, 버전 수정, 내보내기.
7. 비용·삭제·관측·부하 검증 후 베타. 완전 로컬은 후속 provider/store 구현으로 확장.

### 24.3 추가 통과 기준

- 자료 없이 새 대화 전송 가능. 특정 목적/폴더 선택을 필수로 요구하지 않음.
- 파일/결과물 패널 10회 전환 후 초안/대화 ID/참고 범위 유지.
- 사용자 A/B 교차 API·DB·job 접근 차단. 캐시 전환 시 이전 사용자 내용 미노출.
- 동시 worker 2개가 같은 job을 선점해도 활성 문서 버전 1개만 공개.
- worker 강제 종료 후 lease 복구, 오래된 worker 완료 결과 반영 차단.
- 생성 중 네트워크 단절/중지/웹 재시작 후 중복 사용자 메시지와 조용한 재생성 없음.
- 결과물 수정 버전 충돌에 409, 로컬 원본 파일 변경 0건.
- 외부 API 지연 중 DB 트랜잭션이 열린 채 유지되지 않음.
- 삭제된 문서의 후속 job/검색/생성 범위 재검증.
- Local 모드 출시 전 네트워크 검사로 개인 내용의 클라우드 전송과 자동 fallback 없음 검증.

이 장들의 구조는 구현 기준 초안이다. 모델 공급자, 배포 업체, 정확한 dependency 버전, 백업 목표치는 구현 전 ADR로 확정할 항목이며 완료된 운영 환경으로 표현하지 않는다.

## 25. 초기 개발의 최우선 범위: 웹 채팅 + 로컬 파일 관리

### 25.1 초기 버전의 목적

사용자가 웹에 접속해 바로 AI와 대화하고, 같은 서비스에서 자신의 로컬 폴더를 연결해 파일을 찾고 확인하며 필요한 자료를 대화에 활용할 수 있도록 만든다. 초기 개발의 시간과 검증은 이 두 축에 우선 배분한다.

웹 채팅은 자료 없이도 사용할 수 있고, 로컬 파일 탐색은 AI 응답이나 전체 색인 완료를 기다리지 않고 사용할 수 있어야 한다. 두 기능을 각각 완성한 후 연결하는 것이 구현 순서이며, 서로 떨어진 제품으로 만드는 것은 아니다.

### 25.2 핵심 A — 웹 챗봇 채팅 화면

초기 필수:
- 새 대화, 질문 입력·전송, 실제 모델 응답 표시.
- 스트리밍, 응답 중지, 실패 안내, 사용자가 선택하는 재시도.
- 대화 기록 조회와 기존 대화 이어가기.
- 한국어 IME 처리, 여러 줄 입력, 긴 대화 스크롤.
- 현재 참고 범위 표시: 자료 없이 / 선택한 파일 / 선택한 폴더.
- 파일 관리·미리보기를 열어도 대화 ID, 위치, 입력 초안 유지.
- 목적이나 프로젝트 선택을 요구하지 않는 메인 화면.

초기 화면에서 폴더/파일 접근은 쉽게 발견할 수 있어야 하지만 채팅을 밀어내지 않는다. 결과물 편집기, 작업 종류 선택 화면, 성장 화면을 먼저 구현하지 않는다. 답변은 우선 일반 대화로 제공하고 전용 결과물 관리는 후속 단계로 확장한다.

### 25.3 핵심 B — 로컬 폴더·파일 관리

초기 필수:
- 사용자가 직접 폴더를 선택하고 읽기 권한을 허용.
- 여러 연결 폴더의 이름·계층·연결 상태를 시각적으로 확인.
- 폴더 열기, 하위 폴더 탐색, 파일 목록·파일명 검색.
- MD/TXT 본문 미리보기와 파일의 소속 폴더 확인.
- 연결할 자료 선택, 제외, 연결 해제, 다시 연결.
- 수동 새로고침을 통한 추가·수정·누락 파일 확인.
- 권한 거부/철회, 지원하지 않는 파일, 읽기 실패를 구분해서 안내.
- 선택한 파일·폴더를 채팅의 참고 자료로 지정.

여기서 초기 ‘관리’의 최소 완료 범위는 연결·탐색·검색·미리보기·자료 선택·갱신·연결 해제다. 단순히 파일 목록 모형만 보이는 시안은 완료로 인정하지 않는다. 실제 사용자 허용 폴더를 읽는 동작을 검증한다.

원본 파일의 이름 변경·본문 편집·이동·삭제는 초기 필수 범위와 분리한다. 9장의 쓰기 권한·충돌·복구 절차를 갖춘 후 별도 기능으로 추가한다. 연결 해제는 로컬 원본 삭제가 아니며, 클라우드에 이미 저장된 자료의 보존/삭제 선택도 별도로 안내한다. 지원하지 않는 브라우저의 업로드 대체 기능을 지속적인 로컬 폴더 연결과 동일하게 설명하지 않는다.

### 25.4 두 기능을 연결하는 핵심 사용자 흐름

```text
웹 접속 → 바로 자유 대화
             ↕ 대화 초안과 위치 유지
폴더 연결 → 파일 탐색·미리보기 → 참고 자료 선택
                                  ↓
                         선택 자료 내용 전송 안내
                                  ↓
                        처리·검색 준비 상태 표시
                                  ↓
                  자료를 참고한 대화 → 출처 파일 확인
```

폴더를 보는 행위와 AI에게 문서 내용을 제공하는 행위를 구분한다. 클라우드 전송 대상은 사용자가 확인한 자료로 제한하고, 색인 전에도 파일 탐색과 일반 대화는 계속 가능하게 한다. 자료가 준비되지 않았으면 준비 상태를 표시하며 이미 읽은 것처럼 답하지 않는다.

### 25.5 개발 작업 분리와 우선순위

| 우선순위 | 작업 단위 | 완료 결과 |
|---|---|---|
| P0 기반 | 세션·사용자 격리·모델 API 서버 연결 | 비밀키를 노출하지 않는 사용자별 대화 기반 |
| P0-A | 채팅 화면·스트림·중지·기록 | 폴더 없이 실제 AI와 대화 가능 |
| P0-B | 로컬 폴더 연결·탐색·검색·미리보기·재연결 | 실제 허용된 폴더를 웹에서 확인·관리 |
| P0 연결 | 선택 자료 제출·색인·검색·출처·초안 보존 | 파일을 참고한 대화와 원문 확인의 왕복 흐름 |
| P1 | 개인 프로필·기억 승인·가상 분류·전용 결과물·나머지 소셜 로그인 | 핵심 두 기능 검증 후 확장. 세 소셜 로그인은 공개 베타 전 완료 |
| 후속 | 로컬 AI·위키·성장 시각화·원본 파일 변경 | 각각 별도 검증 후 추가 |

P0-A와 P0-B는 공통 세션/자료 범위 계약을 먼저 정하면 독립적으로 개발할 수 있다. 두 담당 영역의 통합 시점에는 실제 로컬 자료 → 채팅 → 출처 미리보기 흐름을 함께 검증한다. 1인 개발이라면 같은 순서를 작은 PR로 나누어 진행한다.

### 25.6 초기 완료 기준

- 연결한 폴더가 없어도 질문을 보내고 실제 모델 응답을 받을 수 있다.
- 권한을 허용한 서로 다른 폴더 2개 이상을 등록하고 각각의 하위 파일을 확인한다.
- 지원하는 MD/TXT를 검색·열기·미리보기 할 수 있다.
- 폴더 권한을 거부하거나 잃어도 채팅이 중단되지 않고 재연결 경로를 제공한다.
- 질문 작성 중 파일을 열고 닫아도 질문 초안과 현재 대화가 유지된다.
- 자료 연결 후 해당 자료의 근거를 확인할 수 있으며, 선택하지 않은 사용자 비공개 자료를 임의로 포함하지 않는다.
- 로컬 원본을 변경한 뒤 새로고침하면 갱신 상태가 반영된다. 재색인 중에는 오래된 버전 여부를 구분한다.
- 연결을 해제해도 원본 파일은 남으며 클라우드 자료 처리 범위가 명확하다.
- 네트워크/모델 오류·중지·재시도에서 중복 메시지와 무한 생성이 발생하지 않는다.
- 파일이나 AI 데이터를 가짜로 표시한 UI만으로 이 기준을 통과했다고 주장하지 않는다.

초기 완료 판정은 이 두 핵심 기능과 연결 흐름에 집중한다. 성장 시각화, 로컬 모델, 고급 편집 기능의 구현 여부는 초기 핵심 기능 완료의 선행 조건이 아니다.
