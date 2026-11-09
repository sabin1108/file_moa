# 단일 대화·공통 입력 UI — 2026-11-09

사용자 지시에 따라 일반 대화·자료 찾기·자료 정리를 하나의 대화와 입력창으로 통합했다. 요청 내용을 규칙으로 판별하고 애매한 경우에만 같은 화면에서 확인한다. 자료 전송 동의와 원본 파일 작업의 별도 검토·실행은 유지했다. [확정 기준과 계획](../../planning/unified-conversation.md), [DESIGN.md](../../../DESIGN.md).

## 크기가 달랐던 이유와 재사용 범위

기존에도 같은 `ConversationWorkspace` form/textarea와 `composer.module.css`를 사용했다. 그러나 `interaction`이 있으면 textarea를2줄, 없으면3줄로 렌더링했다. [수정 전 실측](../composer-consistency/before/composer-sizes.json)의390px 입력 높이는 일반83.17px·찾기60.78px였다. 현재는3줄로 통일했다. [네 너비 실측](search/composer-sizes.json)은 일반/찾기의 입력과 외곽 상자 크기 일치를 확인한다. 안내·설정 내용의 높이는 입력 상자 크기와 구분하며, 사용자가 펼친 설정은 내용에 맞게 늘어난다.

기존 `LiveConversation → MaterialConversation → FindConversation` 전체 화면 교체를 제거했다. `LiveConversation`만 공통 shell·메시지·form을 소유한다. 검색·정리·근거 답변은 같은 메시지 안의 작업 UI이며 새로운 입력 폼을 만들지 않는다. 자료·전송·보관 설정은 한 곳에 접어 좁은 화면의 대화 영역을 확보했다. [390px](general/unified-390.png), [1440px](general/unified-1440.png).

## 코드와 상태 흐름

1. `workspace-request.ts`는 chat/find/organize/grounded/choose를 판단한다. 파일 관련 일반 지식 질문은 일반 대화로, 모호한 복합 요청은 선택 확인으로 보낸다. 이 단계에서 모델을 부르거나 파일 본문을 읽지 않는다. 한국어 전체 의미를 이해하는 분류기로 표현하지 않는다.
2. `useWorkspaceConversation`은 공통 초안을 기존 `useGeneralChat`, `useConversationRequests`, finding/organization controller로 연결한다. 검색 조건 답변과 정리 확인 질문은 기존 파서를 사용한다. 일반·찾기·정리·자료 답변의 대기 상태를 함께 검사하고 중지는 해당 작업에만 적용한다.
3. `MaterialWorkPanel`은 기존 `DocumentFindPanel`, `SourceDocumentPreview`, `OrganizationPreparationPanel`을 재사용한다. 결과 선택→다시 읽기→발췌 확인→새 동의→제안→실제 파일 작업 검토의 기존 경계를 유지한다.
4. `useGroundedConversation`은 공통 입력의 질문과 owner/connection/문서 hash를 동의에 묶는다. 전후 원본 재확인, 인용 검증, 취소와 늦은 결과/인용 이동 제외를 수행한다. `GroundedConsent`와 `GroundedAnswerView`는 표시와 콜백만 담당한다. 별도 질문 textarea는 제거했다.
5. `ConversationStateProvider`/`ConversationStore`는 인증된 작업 공간 layout 수명에서 대화·초안·저장 선택·프로젝트 범위·현재 인용을 보관한다. 페이지가 바뀌어도 동일한 대화를 이어가고, owner가 바뀌면 별도 store다. 로컬 기록에는 turn kind를 보존하지만 일반 모델의 최근 문맥에는 완료된 일반 turn만 넣는다. 예전 kind 없는 기록은 기존 일반 대화로 읽는다.
6. `useConversationRecords`는 저장이 성공한 뒤 작업을 초기화하고 기록을 연다. 모든 응답·자료 읽기·원본 관리 작업 중에는 전환을 막고 명령 시점에도 최신 상태를 확인한다. 연결 해제는 저장→최신 검사→동기 대화 초기화→비동기 해제 순서다. controller도 대기 전에 연결 표시를 중지하며 실패 뒤 끊긴 상태를 유지한다.
7. `AiLibraryPanel`의 삭제 확인은 연결 revision을 캡처한다. 확인 중 폴더 조작을 막고 controller에서 revision/pending을 다시 검사하므로 A의 확인으로 복제 폴더 B의 같은 ID를 삭제하지 않는다. 자료 답변에서 저장한 결과물도 현재 저장 대화 ID와 연결하고 임시 대화만 연결 ID가 없다.

일반/자료/찾기 화면 세 개를 삭제하고 공통 UI·기존 파일/전송 controller를 재사용했다. DB schema·API·실제 한도·공급자를 바꾸지 않았고 의존성을 추가하지 않았다. 최종 횟수 제한 제거는 후속이며 현재10회와 공유 한도를 유지했다.

## 이번 검증

| 검사 | 결과와 조건 |
|---|---|
| 전체 단위 | 144파일·1,285개 통과. 분류, 로컬 turn 문맥 제외/복원, store 격리, 실행 중 최신 전환 검사, 중복 입력, 결과물 연결, 다른 폴더 삭제 거부와 비동기 해제 실패 포함 |
| 타입·린트·빌드 | 통과. 최종 production build `ysQ9wc7pEofrT2zI-q9Dm`. 경고 없는 lint 확인 |
| 경계·구조 | 서버26, 기능25·domain6·layout3 통과 |
| 일반/통합 UI | [40개](general/checks.json). 같은 입력 DOM 유지, 일반→검색→모호한 확인→정리→일반, 로컬 경로·발췌의 일반 payload 제외, 파일 왕복, 초안/스크롤·중지·키보드·합성 조합 입력·390/768/1440/1920px |
| 검색 | [55개](search/browser-checks.json). 원문·조건 답변·실패/취소·범위 확대·선택→정리, 네 너비 입력 상자 비교. 새 공통 LiveConversation fixture 사용 |
| 자료 답변 | [15개](grounded/grounded-checks.json). 동의 변경, 전후 원본/권한 확인, 잘못된 인용, 원문 왕복 후 인용 보존, 새 대화 뒤 늦은 이동 차단, 취소 즉시 재요청과 이전 응답의 새 요청 침범 차단 |
| 기록 | [16개](records/records-checks.json). 파일 왕복 후 저장 모드/같은 ID 자동 저장, 버전·임시 대화·기억 제안·다중 폴더·계정 격리·100/500개 대화 |
| 정리 전체 | [36개](organization/browser-checks.json). 질문 답변→새 동의→검토→실제 합성 OPFS 복사·이동·복구·경합/변경 실패. 모델/권한은 fixture |
| 폴더 연결 | [10개](../workspace-details/direct-connection-checks.json). 실제 Provider와 CDP 입력의 userActivation/읽기 권한 요청 옵션·취소 초점·계층·설정. OS 권한창 결과는 아님 |
| production HTTP | [거부5개](production/route-checks.json). 실제 Next 경로의 guest/origin/메서드 경계. 인증 스트림 검증은 아님 |
| production 경로/자산 | [6경로 각3회·history 등9개](performance/routes-assets.json). 보호 경로는 비로그인 redirect, 나머지는 공개 샘플 |
| 개발 서버 | [로그인 화면6회](dev-stability.json): 양식6/6·재로딩0·예외0. `http://127.0.0.1:3034` 재실행. 실제 로그인 제출은 아님 |
| 노출·공백 | 소스/문서 등 Git 대상1,749개에서 실제 설정 비밀8개 값과 credential 패턴 노출0건. `git diff --check` 통과. 전체 보안 감사는 아님 |

독립 읽기 검토에서 취소 범위·요청 잠금·인용 수명·결과물 연결·전환 중 저장·해제와 삭제 확인 문맥 문제를 발견하고 실패 검사와 함께 수정했다. 마지막 검토는 `CLEAR`, 관련3파일11개도 새로 통과했다. 이 검토를 공식 OMX 합의나 전체 보안 감사라고 부르지 않는다.

## 성능과 남은 한계

전체 production JS/CSS는 이전49파일·3,557,453bytes에서49파일·3,564,851bytes로7,398bytes 증가했다. 전체 산출물 합계이며 초기 화면 전송량이나 사이트 전체 사용자 성능과 같지 않다.

[100/500개 대화](records/long-conversation.json)의 이미 읽어 둔 기록 표시를1440px에서 세 번씩 측정했다. 각각40.1~103.5ms/177.9~290.6ms이며 병행 로컬 검증 환경의 작은 표본이다. 디스크 초기 읽기·실사용 INP·속도 개선율로 해석하지 않는다. 좁은 화면에서500개 대화의 줄바꿈/가로 넘침도 검사했다. 숫자만으로 대형 데이터 전체 성능 완료를 선언하지 않는다.

디스크에서 다시 연 과거 자료 답변은 역사 본문으로 복원하며 파일 핸들이나 검색/실행 권한을 재생하지 않는다. 현재 작업 공간 안의 원문 왕복은 검증된 인용을 유지하지만, 앱 새로고침 후 과거 답변의 인용 버튼까지 재구성하는 기능은 추가하지 않았다. 새 자료 준비 뒤 다시 확인해야 한다.

실제 유료 모델의 통합 전체 여정·응답 속도·토큰 정산, 물리 한글 입력·OS 권한창, 실제 사용자 대형 폴더와 장기 부하는 미검증이다. 외부 모델 호출·DB migration·실제 사용자 삭제·원본 개인 파일 변경·배포·커밋/푸시는 실행하지 않았다. 이미 승인된 로컬 사용량 flag는 유지했다.

재현: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm test:boundaries`, `pnpm test:structure`, `pnpm build`; 브라우저는 `tests/browser/check-general-chat.mjs`, `check-document-find.mjs`, `check-grounded-chat.mjs`, `check-ai-records.mjs`에 보고서 출력 경로를 인자로 준다. 정리 전체 검사는 `node tests/browser/check-live-organization-completion.mjs docs/verification/unified-conversation/organization --reply`다. dev를 중지한 뒤 타입/빌드를 실행하고 검증 후3034 서버를 재실행한다.
