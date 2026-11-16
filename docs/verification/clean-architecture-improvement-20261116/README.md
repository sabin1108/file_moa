# 검색·편집·스냅샷 경계 개선과 대화 확인

2026-11-16. 기준 HEAD `f43214f8621f3161766dbf43e7e396c2c3bcfeef`. 구현은 미커밋 작업 트리에 있다. 사용자 요청에 따라 개인 폴더·운영 DB·유료 AI·새 패키지·모델 다운로드·배포·커밋·푸시는 실행하지 않았다.

## 범위와 읽기 순서

기존 계획은 `.omx/plans/clean-architecture-improvement-20261115/plan.md`다. P0 기준선 뒤 P1→P2→P3→P4 순서로 구현하고 각 단계의 부족한 회귀를 기존 코드에서 실패시킨 뒤 수정했다. UI 증상과 브라우저 fixture 보정은 구조 개선과 구분한다.

1. `search/documents/document-find-controller.ts`, `document-find.ts`, `search/semantic/semantic-query.ts`: 검색 기준 연도와 조건 확인.
2. `documents/editing/inline-editor-session.ts`: 사용자 활성화·권한 요청·잠금의 실행 순서.
3. `search/semantic/semantic-source.ts`: 필요한 저장소·모델 메서드와 시각 입력.
4. `organization/source-snapshot.ts`: reader/index factory·시간 예산·자원 정리.
5. `connection-session.ts`, `connection/source-connection-controller.ts`: 실제 브라우저 어댑터 조립과 호출자.

위 경로의 기준은 `apps/web/src/features/local-folders/`다. 대응 테스트는 `apps/web/tests/local-folders/` 및 기존 자료 작업 테스트에 있다. P1의 평가 fixture와 `tests/research/evaluate-local-rag.mjs`도 명시 연도2026을 전달한다. 평가셋·점수·임계값은 변경하지 않았다.

## UI 확인과 별도 수정

- U1: 자료 찾기에서 자료 정리를 선택해 요청하면 실제로 정리 controller가 실행된다. `organization.phase === "scope"`에서 찾기처럼 읽히는 문구가 나왔다. 합성 브라우저의 `ui-red-settled`에서 잘못된 안내와 올바른 organize 선택을 함께 확인한 뒤 `useWorkspaceConversation.ts`의 한 문구만 ‘정리할 자료의 범위를 확인해 주세요.’로 바꿨다.
- U2: 일반 응답·검색·자료 읽기·분석 또는 원본 작업이 실행 중이면 선택을 막는 기존 정책이다. 실제 검색 읽기와 합성 스트림 중 select disabled, 강제 change 이벤트에도 선택 유지, 중지·실패 뒤 선택 가능을 확인했다. mode는 다음 제출의 의도이고 진행된 task.kind를 소급 변경하지 않는다.
- U3: 같은 문서 안 파일/채팅 화면 이동은 Provider 소유 대화와 초안을 유지한다. 실제 새로고침은 임시 대화와 초안을 초기화한다. 명시적으로 보관을 켠 대화는 로컬 AI 기록에 저장하고 기록함에서 직접 다시 연다. 자동 복원·서버 대화 보관을 추가하지 않았다.
- `tests/browser/check-conversation-continuity.mjs`: 기존 local-organization/OPFS fixture와 합성 HTTP 응답을 재사용하는10검사. 390/1440/1920 화면, 원본 쓰기0·정리 공급자 호출0, 경로 이동·실제 reload를 검사했다. 저장 기록 다시 열기는 기존 `check-ai-records.mjs`의 별도 OPFS 회귀로 확인한다. 물리 키보드·실제 OS 선택창 검증은 아니다.

## 구조 변경과 보존 계약

### P1

`DocumentFindController(read, permissionLost = () => {}, getReferenceYear)`가 한 흐름의 연도를 보유한다. start는 새로 한 번 읽고 reset은 비운다. start 없는 configure/setScope/configureSemantic/submitReply/search는 처음 한 번만 확보한다. none 답변은 공개 snapshot 동일성과 listener0회를 유지한다. 값은 기존 publish에서만 공개한다.

`confirmFindQuery(filters, allowEmptyTerms, referenceYear)`와 `confirmSemanticQuery(filters, meaning, confirmed, referenceYear)`의 기간·출처 판정에 같은 값을 전달한다. 미리보기는 연도가 null이면 확인 함수를 호출하지 않는다. getter2026→2027, 새 흐름, none/invalid 답변, 기본/의미 기간과 출처를 검사했다.

### P2

editor constructor 뒤에 `isUserActionActive`와 `withWriteLock` callback 두 개를 추가했다. 제품 조립은 기존 navigator 조건식과 `moa-folder-creation` Web Lock이다. manual은 활성화→root/vault permission promise 동기 생성→await→기존 작업 순서다. automatic은 request 없이 query를 사용한다. 첫 보존은1회이며 첫 저장의 proof 갱신은 기존처럼 잠금 반환 뒤다. 반복 저장은 archive 검사부터 baseline 갱신까지 기존 잠금 본문을 유지한다. 저장당 잠금1회·최대 깊이1, 실패 해제, owner/abort 변경, 보관본 손상 회귀를 검사했다.

### P3

semantic 함수는 로컬 Pick 타입의 index/model과 `{createIndex, now}`를 받는다. 조회는 createIndex만 받는다. 호출마다 index1개이고 생성 전에는 DB/모델 작업을 시작하지 않는다. parserVersion은 adapter가 검증한 row에서 받는다. 동일 hash 재사용은 모델/저장0회, 현재 snapshot 경로만 읽기, 저장 실패 partial, epoch 변경과 owner/abort 뒤 늦은 결과 거부를 유지한다.

### P4

`readSourceSnapshot(runtime, root, scope, instruction, assertCurrent, signal?, find?, indexContext?, options?)`가 reader/index factory·now·parserVersion을 필수 입력으로 받는다. 제품 두 호출은 session의 같은 runtime을 공유하되 자원을 미리 만들지 않는다. indexContext가 없으면 index0개, 있으면 호출당1개다. index factory를 기존 try 안에서 실행해 예외에도 생성된 reader를 finally에서1회 해제한다. reader factory 자체가 실패하면 미생성 reader를 해제하지 않는다.

시작 시각은1회, 1초 slice와15초 한도는 기존 short-circuit 위치에서 새 now를 읽는다. checkpoint createdAt은 재개에도 유지하고 updatedAt은 갱신한다. cacheHit 쓰기0, 빈 fullText 저장, cache read/put 오류 fallback과 결과 동일성을 검사했다. 전체 성공일 때만 retain3종을 실행하며 paused/failed/limit은 기존 정책을 유지한다. metadata catalog 실패는 기존 오류로 노출한다.

DB 이름/버전/키·파일/저널/복구/감사 형식은 바꾸지 않았다. 요청 freshness·작업 ID·감사 시각·간접 Next 의존·module quota는 기존 계획대로 보류했다. 이 네 경계를 프로젝트 전체의 완전한 의존성 역전이라고 부르지 않는다.

## 실행 근거

원자료: `.omx/verification/clean-architecture-improvement-20261115/`.

| 단계 | 실행 결과 |
| --- | --- |
| P0 |328소스 해시 일치. check173파일/1515테스트·타입·린트·빌드, S0 180모듈 통과 |
| P1 |새 회귀8실패 확인→관련139통과·타입·린트·빌드 통과 |
| P2 |활성화/잠금 회귀 실패 확인→관련91통과, 추가 owner/abort/주입 능력 독립성 포함 editor9통과·타입·린트·빌드 통과 |
| P3 |plain fake runtime 회귀 실패 확인→관련37통과·타입·린트·빌드 통과. 테스트의 optional check 호출 타입 오류는 수정 후 재검사 |
| P4 |runtime 회귀6실패 확인→snapshot/session36통과·타입·린트·빌드 통과 |
| EGM 보완 전 |`pnpm check`:173파일/1539테스트·타입·린트·서버 경계26·web32/domain6/layout3·빌드 통과. `pnpm test:s0-graph`:180모듈 통과 |
| EGM 보완 후 최종 |`post-egm-check.log`:173파일/1548테스트·타입·린트·서버/구조 경계·빌드 통과. `post-egm-s0.log`:180모듈 통과. `post-egm-rag-browser.log`:16검사 통과. 세 명령 exit0 확인 |
| 편집 workflow |최종 `editor-browser.log`:49검사 전체 통과. 앞선 실패 로그는 보존 |
| 관리 파일 |최종 `managed-browser.log`:32검사 전체 통과 |
| 합성 RAG |최종 `rag-browser.log`:16검사 통과. workflow와 별도 suite이며 --answer도 fixture 공급자만 사용 |
| 캐시 |최종 실제 Chromium Worker/PDF.js/IndexedDB 합성 검사 완료. cost.json과 로그 보관 |
| 대화 |최종 `continuity-browser.log`:10통과. `records-browser/records-checks.json`:66개 OPFS 검사 통과. 자동 임시 저장/복원 정책 변경 없음 |

단계별 개수는 실행한 기존 테스트와 추가 회귀의 합계다.1548개를 모두 새로 작성했다는 뜻이 아니다. 캐시 검사 비용은 합성 파일의 브라우저 측 값이며 서버 비용·개인 자료 품질 증거가 아니다.

의미 모델 가중치 설치나 실제 의미 모델 추론은 이번에 새로 실행하지 않았다. P3은 plain fake index/model과 기존 controller 회귀로 확인했고, RAG 브라우저는 실제 파일 Worker와 합성 질문 해석/답변 경계를 사용했다. 실제 의미 모델 품질·물리 IME·OS 권한 선택창·운영 인증/DB·실제 원격 공급자는 이번 검증 범위 밖이다.

P2의 navigator 부재 테스트는 주입된 activation/lock만으로 저장할 수 있음을 확인한다. EGM 뒤에는 실제 `FolderConnectionSession`을 만들고 공개 연결/편집 API를 호출하는3조건 회귀도 추가했다. 합성 navigator의 userActivation 미제공/활성/비활성에서 실제 제품 callback을 실행하며, 미제공/활성은 파일 저장과 잠금 이름을, 비활성은 권한/잠금0회를 검사한다. 실제 API가 없는 브라우저에서 실행한 검증은 아니다.

## EGM 뒤 보완

- 준비 함수에 늦은 fake model 결과가 돌아온 시점의 abort 검사를 추가했다. 취소된 모델 결과를 index에 쓰고 마지막에야 거부하던 반례를 먼저 확인했다.
- 조회 함수는 records/score/evidence/마지막 epoch의 async 반환 뒤에도 abort를 직접 확인한다. 빈 records·낮은 score·evidence·epoch 반환 중 취소4경로가 기존 코드에서 실패했고 수정 뒤 통과했다. 실제 모델과 상위 controller의 방어에만 의존하지 않는다.
- `retain`과 `retainSemantic` 실패 각각에서 snapshot 결과와 reader1회 해제를 유지하는2개 회귀를 추가했다. snapshot 제품 로직은 추가 변경하지 않았다.
- 원자료 execution.md는 착수 당시 상태와 최신 완료 상태를 구분했다. 첫 최종 검사1539개는 보완 전 실행이며, 보완 후 전체1548개 결과는 위 실행 근거 표에 명시했다.

## 브라우저 fixture 보정과 미해결 검사

- managed/find/records Vite fixture에 기존 RAG와 같은 React dedupe를 넣었다. 외부 경로 navigation shim에서 생긴 duplicate React invalid-hook-call을 보정한다.
- 최신 시작 화면의 실제 작업 버튼을 거치고 records는 버튼 준비를 기다린다. 기존 자동 판별 검사는 첫 task 이후 mode=null인 기존 대화 상태로 검사한다.
- managed runner에 계획된 workflow mode를 연결했다. 실제 script가 `/settings`도 여는 점이 계획에서 빠져 있어 별도 fixture 보정으로 해당 경로와5줄 editor-settings fixture를 추가했다. 제품 설정·라우터·DB는 바꾸지 않았다.
- find의 옛 날짜/부분 결과 문구 검사는 현재 표시 문구와 정확한 날짜 두 개·외부 자료 제외 계약으로 맞춘다. first-screen 위치 검사는 유지하고 마지막으로 지연해 다른 검색 동작도 검사한다. 실패는 최종 exit code에 반영한다.
- find 최종55검사 중53개 통과,1440/1920px 첫 화면 검색 버튼 위치2개 실패다.1440px 실패는 P0부터 관찰됐다. UI 위치/배치 변경은 이번 구조 개선에 섞지 않았다. 원자료 `find-browser-current-labels/browser-checks.json`과 `failure.json`에 실패를 보존했으며 suite exit code는1이다. taste-checks에는 fixture 전용 위키 조작의 대비/가장자리와 기존 체크 표시 문자 관련20개 지적도 남았다. 화면 검사 전체 통과로 표시하지 않는다.
- workflow 첫 실행은 실제 editor 검사를 통과한 뒤 미제공 settings 경로에서 중단됐다. fixture 보정 뒤 새 목적지 폴더 진입 대기에서 timeout이 한 번 관찰됐으나, 최종 `editor-browser.log`와 `editor-browser/checks.json`은49검사 전체 통과·브라우저 오류0이다. 앞선 실패 이력도 삭제하지 않았다. 비결정적 fixture 대기 위험은 남는다.
- 일반 채팅의 옛 별도 시각 suite는 outline을 기대하지만 현재 CSS는3px box-shadow를 쓴다. 해당 suite는 이번 완료 근거로 사용하지 않으며 제품/CSS와 기존 script는 변경하지 않는다.

## EGM

실제 구현과 문서를 별도 문맥의 Goldfish 세 명이 검토했다. 결과 집계·완료 근거 표현을 고쳤고 실제 제품 callback 회귀, 의미 검색 직접 취소, retain 실패 검사를 보완했다. 각 원 검토자가 조치를 재확인했으며 이 제한 검토 범위에 열린 Blocker/Major/Nit은 없다. 남은 화면 검사 실패를 해소했다는 판정은 아니다. [검토와 조치](egm-review.md)를 함께 읽는다.
