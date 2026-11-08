# 채팅에서 로컬 TXT·MD 자료 찾기

2026-11-08. 사용자의 ‘10월쯤 한 회의자료 있는데 그것좀 찾아줄래’ 예시 후 다음 기능 진행 요청을 구현했다. [FIND-001~007](../../specs/document-find.md). 일반 의미 검색·새 모델·PDF/Word/PPT 파싱·원본 변경은 추가하지 않았다.

## 현재 동작과 책임

찾기만 요청하면 대화 안에서 검색어·범위·연도·월·날짜 기준·기간을 확인한다. 연도와 날짜 의미는 추정하지 않으며 ‘쯤’은 해당 월 또는 앞뒤7일 포함을 고른다. 실제 시작 버튼을 누르기 전에는 본문을 읽지 않는다. 단어는 모두 포함하는 조건이며 수정 가능하다. 기간이 없으면 전체 기간을 고를 수 있다. 명확하지 않은 날짜 기준/부정한 기간은 확인 대상으로 남긴다.

검색은 연결한 범위의 TXT/MD 전체 본문에서 단어와 명시 날짜 근거를 확인한다. 회의일/작성일은 명시 필드만 사용하며 파일 이름/수정 시각을 대신 쓰지 않는다. 조건에 맞는 후보와 날짜 불명/기간 안팎 혼재 후보를 구별하고 실제 근거를 표시한다. 명확한 기간 밖 자료는 제외한다. 결과0은 읽은 범위에서 후보0이라는 뜻이다.

읽을 순서:

1. `features/local-folders/lib/document-find.ts`: 요청 단서, 확정 기간, 전체 본문의 단어/날짜 근거와 Worker 응답 검증. 기존 날짜 계산은 `shared/content-dates.ts`로 옮겨 정리 기능과 함께 사용하며 이전 import를 재export로 유지했다.
2. `services/copy-hash.worker.ts`/`copy-hash.ts`: 같은 읽기와 SHA256/UTF-8 처리에서 검색 근거도 만든다. 전체 본문은 UI로 돌려주지 않는다. 기존 hash/text 프로토콜을 유지하고 검색 응답의 kind/날짜/근거 크기를 검사한다.
3. `source-snapshot.ts` → `connection-session.findSourceDocuments`: 기존 재귀 탐색/한도/권한/owner·연결 세대 검사를 재사용한다. 검색 근거는 별도 결과로 반환하고 AI 전송용 문서 DTO에는 넣지 않는다.
4. `DocumentFindController`: 조건/요청/검색/취소/늦은 결과만 담당한다. SourceConnectionController/Provider가 수명을 소유하고 연결·권한·owner 변경 때 초기화한다.
5. `LiveConversation` → `FindConversation` → `DocumentFindPanel`/`DocumentFindResults`: 공통 shell/composer/버튼/파일 행과 기존 SourceDocumentPreview/controller를 사용한다. 조건 확인 중에는 입력을 겹쳐 두지 않고 결과에서는 조건을 접는다. 후보는20개씩 펼치며 근거는 기본2개/상세 보기다. 미리보기 중 목록을 보존하고 닫으면 원래 행에 초점을 돌린다.

[행동별 함수 호출·반환·상태 흐름](../../reports/document-find-reading.md). 정리와 복사를 새 검색 응답으로 위장하지 않았고 새 writer·서버 endpoint·DB·의존성을 만들지 않았다.

## 현재 검증

- 새 요청/근거/controller16검사와 기존 Worker2검사를 추가했다. 모듈 미구현, Worker 검색 미구현/검증 누락을 실패로 확인한 뒤 구현했다. 전체 **1,040검사/105파일** 통과.
- 타입·린트(경고0)·빌드·서버 경계21·구조25 web/6 domain/3 layout 통과. 최종 빌드 `lpCxf_CNfziJk7VhXxTME`.
- [자료 찾기31](browser/browser-checks.json): 실제 controller/session/Worker/OPFS와 합성 owner/권한. 조건 전 본문 읽기0, 1,200자 뒤의 날짜, 회의일/작성일/기간 안팎 근거, 잘못된 UTF-8와 일부 결과, 원문 보기/초점 복원, 화면 전환, 새 요청의 이전 미리보기 제거, 취소/owner/F5·자동 검색 방지, 외부·모델·쓰기0.
- 기존 [정리 답변·실행35](organization/browser-checks.json), [전송23](transfer/browser-checks.json), [준비28](preparation/browser-checks.json) 통과. 총 브라우저117검사다. 정리 회귀의 OPFS 복사/이동은 실제 Windows 원본 변경과 구별한다.
- [production Worker](production-worker.json): 실제 공개 Turbopack bootstrap으로 기존 이진 hash/발췌/invalid UTF-8와 새 긴 본문 검색까지 통과. 인증 경로를 우회하지 않고 로그인 화면에서 합성 File을 전달했다.
- 390/768/1440/1920px의 조건/결과 캡처와 가로 넘침·파일 행 높이, 데스크톱 첫 화면 검색 행동을 확인했다. [조건1440](browser/conditions-1440.png), [결과390](browser/results-390.png).

실패 도구 기록은 `harness-visual-attempt.json`과 `parallel-attempt.json`으로 보존했다. 초기 DOM 반환 직렬화 오류는 Boolean 대기로 수정했다. 공통 파일 행의100% 높이는 재현 검사로 고정한 뒤 기존 내용 높이 CSS를 함께 재사용했다. 병렬 준비 검사에서 미리보기 클릭 대기가 끝나지 않았지만 예외는 없었고 단독 재실행은28개 통과했다. 이를 확정된 제품 원인으로 기록하지 않는다.

## 화면 검토

기존 achromatic-ledger/seed2044201404, 서체·색·브랜드·공통 프레임을 유지했다. 화면 질문은 ‘어떤 조건으로 찾고, 어느 파일이 근거에 맞는가’다. 모아 이름/연결 범위와 실제 상대 경로·본문/날짜 근거가 화면의 내용이다. 새 스타일 추첨이나 장식 카드/가짜 숫자를 추가하지 않았다.

시각 스킬 source lint는0FAIL/0WARN. [동일 app probe/judge의 조건·결과4폭8관측](browser/taste-checks.json)은0FAIL/1WARN이다. 390px 하단 설명의14px 여백 경고는 승인된 공통 composer 간격이며 가로 넘침/가려짐이 없어 유지했다. 검사 때 fixture 전환 버튼만 숨겼고 제품 UI는 바꾸지 않았다. 실제 inspector처럼350ms 스타일 안정화를 적용했으며 전환 중 순간 대비를 최종 화면 대비와 구별했다.

[성능 전후54+54](performance.md). 기존 비로그인 경로 측정과 실제 인증 정리·실디스크·field INP를 구분한다.

## 범위와 재현

현재는 단어 일치와 명시 본문 날짜의 근거 검색이다. 동의어/의미 검색, 모든 자연어 말투, 월 초/말의 자동 범위 확정, 모든 파일 형식은 지원하지 않는다. 검색어/기간은 시작 전 확인한다. 기본 본문 제한은 파일당2MiB/500문서/50MiB와 기존 탐색 상한이다. 결과는 검색 시점의 근거이며 원문은 열 때 다시 읽는다. 인덱스 지속 저장/지속 감시/자동 재검색은 없다.

물리 한국어 IME와 실제 로그인한 Windows 폴더 전체 여정, 대용량 실디스크/실사용 INP는 미검증이다. 사용자 브라우저 주소 확인 제한을 우회하지 않았고 확장 프로그램 확인은 사용자 담당이다. 이번에 새 유료 모델 생성·개인 자료 전송·Windows 원본 쓰기·배포를 하지 않았다.

재현: 루트의 `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm test:boundaries`, `pnpm test:structure`, `pnpm build`. 새 브라우저는 `node tests/browser/check-document-find.mjs <새 결과 폴더>`. 기존 회귀 도구에는 새 결과 폴더를 넘기며 정리 답변은 `--reply`를 쓴다. production Worker는 `node tests/browser/check-production-snapshot-worker.mjs http://127.0.0.1:3035 <새 결과 폴더>`다.
