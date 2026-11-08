# 대화·파일 정리 통합 검증 — 2026-11-07

정식 메인과 샘플 메인이 같은 `ConversationWorkspace`를 사용하도록 연결했다. 샘플은 가입 대신 별도 서명 세션과 가상 자료를 공급한다. 정식 개인 자료의 AI 전송/실행은 활성화하지 않았으며 화면에도 준비 중임을 표시한다. 튜토리얼·외부 배포·범용 PDF/XLSX 파서는 이번 범위가 아니다.

## 바뀐 동작

- `/demo`: 대화·입력·자료 패널이 계속 유지된다. 요청 → 본문 분석 → 인용 근거/계획 → 명시 승인 → 가상 적용/되돌리기 순서다. 패널 토글과 계획 전환으로 대화/입력 DOM을 교체하지 않는다.
- `/demo/files`: 실제 `/files`의 `FolderWorkspaceFrame`, 파일/폴더 행, 미리보기 pane, 목적지/경로 입력, 변경 계획 표시를 재사용한다. 샘플은 자체 목록/상태만 제공하고 실제 폴더 핸들·Provider·IndexedDB를 주입하지 않는다. `/demo/settings`도 샘플 세션을 확인하며 정식 설정으로 권한을 확장하지 않는다.
- 공통 `WorkflowTransition`은 단계가 바뀔 때 높이/등장을260ms로 연결한다. 정식 복사/이동의 `SourcePlanDialog`와 샘플에서 공유한다. `WorkflowStepper`도 공통 진행선 전환을 제공한다. reduced-motion에서는 해당 전환을 실행하지 않는다.
- 앱 공개 자료10개에 원본 합성24개를 추가해34개로 구성했다. 기존 평가용 holdout은 앱에 옮기지 않았다. 받은 자료 아래 팀 공유/업무·메일 첨부·다운로드·개발 노트·생활 기록과 중첩 경로를 제공하고, 날짜/주제 목적지는 승인한 가상 계획에서 만들 수 있다.
- 결과는 문서 ID·정확한 본문 인용·확인된 날짜·상대 목적지·보류 설명이다. 제목만 성능 테스트인 파일, 일반 개념 학습, 하드웨어 시험과 실제 웹 측정 자료를 분리하는 fixture를 포함한다. 모델 재학습이나 파인튜닝은 실행하지 않았고 버전 관리하는 요청별 지침을 적용했다.

## 코드 읽을 순서

1. [명세](../../specs/conversation-organization.md) CO-001~007, `shared/organization.ts`: 인용·범위·날짜·상대 경로 검증.
2. `server/sample-organization.ts`: 등록 ID/동의/세션/Origin → 공통 원자 예약 → 요청별 지침 → 모델/결과 검증. 본문은 서버 등록부에서 가져오며 클라이언트 본문/경로/모델 주장을 받지 않는다.
3. `server/gemini-classification.ts`: 기존 단순 분류와 새 조직화가 실제 REST 전송·countTokens·용량·완료 상태·사용량 처리를 공유한다. 새 SDK/의존성은 없다.
4. `features/sample-workspace/lib/sample-state.ts`: 후보와 일치 자료 분리, 새 가상 폴더, 공통 계획, 승인 대상만 커밋, 폴더 포함 되돌리기/복원.
5. `components/layout/ConversationWorkspace.tsx`와 `features/{conversation-workspace/components/LiveConversation,sample-workspace/components/SampleConversation}.tsx`: 같은 표시·입력·패널 뒤에 정식/샘플의 세션·자료 처리를 구분한다. app 페이지가 action을 주입한다.
6. `components/ui/{WorkflowStepper,WorkflowTransition}`, `local-folders/components/{listing/FolderWorkspaceFrame,listing/SourceFileRow,plan/SourcePlanDialog}`: 공통 조작/전환을 실제 두 소비처에서 재사용한다. 화면마다 별도 Stepper/가짜 실제 폴더 브라우저를 만들지 않았다.

## 테스트 결과

최종 빌드 `0ybMAmLCjLIo2IzSyeUAT`. 일반 검사는 실제 키/모델 호출을 하지 않는다.

| 분모 | 실행 결과 |
| --- | --- |
| 전체 Vitest | 792개 /86파일 통과 (`--maxWorkers=4`) |
| 타입·lint·build | 통과, lint 경고0,52페이지 생성 |
| 서버 경계/구조 | 21 / web25·domain6·layout3 통과 |
| 샘플 파일 브라우저 | 39개 통과: 기존 검토/수정/복원/세션/권한·파일 자산과 실제 단계 애니메이션/reduced-motion |
| 대화 브라우저 | 17개 통과:4폭,중첩 폴더,동의/요청 수정,10회 토글 뒤 입력 DOM·초안 유지,합성IME Enter·Shift+Enter,API요청0/실제IO0 |
| 실제 AI 보고서 예제 | 20개 통과:6개 일치·승인 전 위치 유지·승인 대상만 이동·F5 재호출0·되돌리기 |
| 실제 AI 성능 예제 | 20개 통과:5개 일치·다른 달의 관련 자료 포함·승인/복원/되돌리기 |
| UI replay | 저장된 실제 합성 계획을 모델 재호출 없이4폭에 복원,본문/자료 영역과 페이지 가로 넘침0 |
| 비밀값 | 최종 정적42파일에 등록 API키 문자열0,서버 전용 유지 |

브라우저의 각 분모와 단위·실모델 평가를 합쳐 정확도/실사용 지표로 표시하지 않는다. 실제 개인 계정으로 `/`를 로그인해 브라우저 검증한 결과는 아니며 정식 화면의 공통 구성은 소스/타입/경계로 확인했다. `/files`의 인증 접근 보호는 새 브라우저에서도 확인했다.

## 최종 두 실제 요청

둘 다 현재 동일 빌드에서 등록 가상34개를 명시적으로 전송했다. 문서 ID/이름/짧은 본문/가상 상대 위치만 제공하며 개인 자료·실제 절대 경로·원본 PDF/XLSX 바이너리·정답 메타데이터는 제공하지 않는다.

| 요청 | 실제 선택 | 완료 시간 | 입력/출력/전체 토큰 |
| --- | --- | ---: | ---: |
| 10월 보고서를 본문 작성일 기준으로 날짜별 정리 | report-1002/1005/1009/1014/1021/1028 | 5459ms | 3258/859/4117 |
| 웹사이트 성능 테스트 자료만 내용으로 모으기 | perf-lcp/inp/network/bundle/longtask | 5607ms | 3188/540/3728 |

본문의 정정일과 파일명이 다른 보고서는 본문2026-10-21을 사용했다. 날짜 없음·서로 다른 날짜는 이동하지 않았다. 성능 자료는 제목이 모호한 파일과11월 long-task 측정까지 포함하고, 제목만 관련된 여행 단어장·하드웨어 시험·HTTP 학습 자료는 이동하지 않았다. 모델의 보류 목록에는 명확한 제외 사유도 들어왔으며, 보류/제외 항목은 승인 위치 변경에 포함되지 않는다.

기대 ID는 도우미가 작성한 미검토 합성 fixture 초안이다. 현재 두 예제의 연결/의미 선택 증거이며 전체 사용자 요청·holdout의 정확도를 보장하지 않는다. 무료 계정의 결제 설정이나 모델별 계정 quota는 확인한 것이 아니다.

## 실패를 발견하고 고친 과정

- 복원 폴더 이력이 검증되지 않음: 회귀가 실패한 뒤 before/after와 실제 커밋 폴더 관계를 검증했다.
- 비연속 custom ID의 중복, 검토에서 제외한 새 폴더까지 커밋: 두 회귀 실패→사용하지 않는 ID 할당/최종 참조 폴더만 커밋→통과. 되돌림 메시지를 대화에 추가했다.
- `date:null`로 임의 날짜 폴더를 제안할 수 있음: 실패 회귀→목적지의 모든 ISO 날짜가 선언 날짜와 같고 본문 단일 날짜임을 검증→통과. source 루트는 거부하고 정확한 가상 표시 루트 하나만 상대 경로로 정규화한다.
- 초기 모델 요청400: countTokens200도 생성 스키마의 수용을 증명하지 못했다. provider 출력 스키마를 실제로 수용된 작은 구조로 제한하고 ID/길이/경로/인용/날짜 제한은 서버 Zod에서 유지했다. 여러 스키마 제약 조합 중 어떤 키가 단독 원인이었는지는 확정하지 않는다. 오류 때 자동 재시도/준비 결과 대체/쓰기 없이 닫혔다.
- 중간 실제 응답은 보고서가 아닌 측정 파일을 보고서로 포함하거나, 날짜 제한 없는 성능 요청에서11월 자료를 보류했다. 요청별 보고서/날짜 정책을 분리하고 날짜 필터가 없는 요청은 모든 시기를 포함하도록 v2 지침을 검증했다. 중간 기록은 최종 통과로 덮어 해석하지 않는다.
- Shift+Enter 검사에서 잘못된 CDP 문자(`\n`)를 보낸 검증 도구 문제는 native Enter 문자(`\r`)로 수정한 뒤 통과했다. 제품 IME 처리는 합성 이벤트로만 검사했으며 물리IME는 미검증이다.

원자료: [보고서](reports-result.json), [성능](performance-result.json), [보고서20](reports-checks.json), [성능20](performance-checks.json), [대화17](browser-checks.json), [파일39](files/checks.json), [UI replay](plan-replay-checks.json), [정적 비밀값](client-secret-check.json), [성능](performance.md). `model-before-policy-fix.json`/`model-validation-probe.json`와 `performance-before-policy-v2.json`는 중간 검증/실패 사례다.

## 재현과 한계

```powershell
pnpm exec vitest run --maxWorkers=4
pnpm typecheck
pnpm lint
pnpm test:boundaries
pnpm test:structure
pnpm build
pnpm start
node tests/browser/check-conversation-organization.mjs --scenario=browser
node tests/browser/check-sample-workspace.mjs
node tests/browser/check-organization-replay.mjs
```

실제 무료 API 요청을 사용하는 검사는 명시 opt-in이며 자동 일반 검사에서 실행되지 않는다. 서로 다른 실제 요청 사이에는 앱 전역1분 한도를 지켜야 한다.

```powershell
node tests/browser/check-conversation-organization.mjs --scenario=reports --allow-live
node tests/browser/check-conversation-organization.mjs --scenario=performance --allow-live
```

세션3회/시간·전역1회/분/12회/시간의 공통 원자 한도, 만료/25초 timeout, 동의/후보 범위 snapshot, 중복/늦은 응답 무시는 유지한다. 새 조직화의 사전 입력은8192/출력3200, 기존 단순 분류는4096/1600이다. 승인된 provider 요청은 실패/취소되어도 보수적으로 환불하지 않는다. 검증에서 사용한 호출도 한도를 사용했다. 취소는 응답 대기 취소이며 이미 전송한 요청의 사용량을 되돌린다고 약속하지 않는다.

정식 개인 자료 AI 전송·실제 쓰기·범용 PDF/XLSX 추출·OCR·튜토리얼·외부 배포·여러 운영 인스턴스 부하·물리IME·field INP는 이번 검증이 아니다. 기존 공통 SQL 원자 예약의 실제 DB 검사는 [이전 검증](../sample-gemini/README.md)을 참조하며 이번에는 새 SQL을 추가하지 않았다.
