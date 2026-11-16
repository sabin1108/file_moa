# F1–F3 최소 수정과 검증

2026-11-16. 입력은 `.omx/verification/clean-architecture-recheck-20261116/report.md`와 같은 폴더의 독립 검토·기준선·합성 반례다. 작업 기준 HEAD는 `f43214f8621f3161766dbf43e7e396c2c3bcfeef`이며 현재 변경은 미커밋 상태다.

## 기준선과 순서

시작 시 보고서 기준선의 미커밋28파일 해시는 모두 현재 코드와 같았다. 지정된 원래 재현3개도 현재 코드에서 모두 실패했다. 이미 해결됐다고 보고 수정을 생략할 항목은 없었다. 기존 변경을 되돌리지 않고 F1→F2→F3 순서로 각 경계의 부족한 회귀를 먼저 실패시킨 뒤 수정했다. 최종 대조에서 이번 제품/테스트8파일 외 기존20파일과 개인 MD 두 개의 해시는 그대로였다.

원자료는 `.omx/verification/clean-architecture-fixes-20261116/`에 보관한다. `start-baseline.json`은 시작 상태, `repro-before.log`는 기존 반례 실패다. 이전 점검 보고서와 실패 로그는 당시 근거로 보존한다.

## F1 — 첫 저장 뒤 외부 변경을 정상 기준값으로 채택

원인: managed 첫 저장의 잠금 반환 뒤 다시 읽은 파일의 hash/size/mtime를 그대로 proof에 넣었다. 방금 저장한 내용과 다르더라도 다음 자동/수동 저장에서 외부 변경을 정상 기준값으로 인정했다.

수정: 기존 `prepareManagedOperation`이 만든 `prepared.edited`를 예상 저장 바이트로 재사용한다. 잠금 이후 재읽은 current의 크기와 hash를 예상 File의 크기/hash와 비교하고, 다르면 `managed-changed`로 즉시 거부한다. 기존 attempted 실패 처리가 proof를 blocked로 만들므로 잘못된 checkpoint를 내보내거나 다음 저장을 진행하지 않는다. JavaScript text를 다시 인코딩하지 않아 기존 BOM/CRLF 보존을 유지한다.

첫 백업·반복/자동 저장·권한 동기 구간·잠금 이름·횟수·범위는 그대로다. 별도 잠금이나 복구 쓰기를 추가하지 않는다. 외부 내용은 그대로 남긴다. 외부 변경이 재검증을 마친 뒤 발생하는 경우는 다음 저장의 기존 원본 동일성/hash 검사로 다룬다. 모든 OS 외부 쓰기를 원자적으로 막는다는 주장은 아니다.

회귀: 잠금 직후 같은 크기·같은 mtime의 다른 내용을 넣으면 첫 저장 자체가 충돌로 거부되고 다음 manual/automatic 저장도 쓰기 없이 거부되는2개 반례를 추가했다. 현재 코드에서2실패→수정 후 관련5파일/58검사 통과. BOM/CRLF 첫 저장과 자동 저장도 확인했다.

기존 editor-race 재현의 F1은 첫 저장 성공을 전제했다. 더 이른 충돌 거부도 검사하도록 해당 부분만 보완하고, 외부 내용 유지·외부 hash 미채택·다음 저장 거부를 모두 assert했다. 원래 source는 `editor-race.original.txt`, 원래3실패 로그는 `repro-before.log`에 보존한다. 기대값을 낮춰 기존 덮어쓰기 경로를 허용한 변경이 아니다.

## F2 — 의미 검색에서 명시 연도가 전체 기간으로 사라짐

원인: 원래 year와 현재 year 필드가 같아도 month=all이면 최종 hard.from/to가 null이었다. 원래 기간의 필드 비교만으로 실제 제한의 존재를 보장하지 못했다.

수정: 의미 검색의 기존 보호 기간 분기에서 원래 요청으로 추론한 year가 있으면 최종 hard.from/to가 모두 존재해야 한다. 없으면 `semantic-protected-period`로 거부한다. 일반 `confirmFindQuery`는 바꾸지 않았으므로 사용자가 일반 검색에서 전체 기간으로 넓히는 기존 동작은 유지한다. 연도만 요청한 경우 의미 검색에서 전체 기간을 고르면 조건을 다시 확인해야 하며, 묵시적으로 새 연도 범위를 만들어 넣지 않는다.

회귀: 올해·작년·재작년·절대 연도4조건의 의미 검색 거부가 기존 코드에서 실패했다. 명시 월/여러 달 범위의 보존, lexical companion 기간, 일반 검색의 전체 기간 허용도 같은 파일에서 확인했다. 수정 뒤 관련15파일/136검사 통과. 모델·임계값·UI 배치는 변경하지 않았다.

## F3 — 저장 직전 guard와 마지막 await에 취소 누락

원인: 모델 반환 뒤에는 signal을 확인했지만 putSemantic에 전달한 check는 owner/connection만 확인했다. 저장소가 비동기 대기 뒤 이 guard를 호출해도 취소를 보지 못했다. session의 마지막 readInstalledModel await 뒤에도 signal을 확인하지 않아 취소된 준비 promise가 성공할 수 있었다.

수정: 준비 사용 사례 안에서 기존 assertCurrent와 signal.throwIfAborted를 결합한 작은 check를 사용한다. currentTexts와 putSemantic에 같은 check를 전달하고 저장 await 직후에도 확인해 중지 뒤 progress나 성공을 내보내지 않는다. 마지막 epoch도 같은 check로 확인한다. session은 마지막 모델 설치 표식을 await한 뒤 owner/connection과 signal을 확인하고 stamp를 대조한 다음 반환한다. 기존 조회 함수에 이미 있던 취소 검사는 중복 수정하지 않았다.

파생 캐시를 삭제하거나 rollback하는 처리는 추가하지 않았다. 저장 직전 guard가 실행되기 전에 취소되면 새 저장을 막는다. 정상 commit이 먼저 끝났다면 그 캐시는 보존하고 취소된 준비의 완료/진행 표시만 거부한다. IndexedDB transaction에 이미 반영된 정상 결과를 소급해서 취소한다는 뜻이 아니다.

회귀: 지연 저장 guard 전에 취소해 쓰기0·이전 정상 캐시 유지, commit 직후 취소해 정상 캐시 보존·progress0, 실제 공개 session API의 마지막 설치 표식 await 중 취소를 추가했다. 이 중 보호 누락3개가 기존 코드에서 실패했고, 정상 완료 control도 검사했다. 수정 뒤 semantic/session6파일/51검사와 지정 재현3개를 통과했다. 실제 공급자·모델·운영 DB는 사용하지 않았다.

지연 저장 반례는 fake index이고 실제 IndexedDB의 guard 호출 위치와 transaction 완료 순서는 소스로 대조했다. 기존 캐시 브라우저 검사에 실제 IndexedDB가 포함돼도 이 좁은 취소 timing까지 실행 재현했다는 뜻은 아니다. 마지막 stamp 검사는 공개 session 경로를 실행하되 설치 표식 읽기와 하위 준비 작업은 mock이다.

## 변경 파일

저장소 기준 제품4파일과 기존 테스트4파일만 기능 수정했다.

| 항목 | 제품 | 회귀 |
| --- | --- | --- |
| F1 |`apps/web/src/features/local-folders/documents/editing/inline-editor-session.ts` |`apps/web/tests/local-folders/documents/editing/inline-editor-session.test.ts` |
| F2 |`apps/web/src/features/local-folders/search/semantic/semantic-query.ts` |`apps/web/tests/local-folders/search/semantic/semantic-query.test.ts` |
| F3 |`apps/web/src/features/local-folders/search/semantic/semantic-source.ts`, `apps/web/src/features/local-folders/connection-session.ts` |`apps/web/tests/local-folders/search/semantic/semantic-source.test.ts`, `apps/web/tests/local-folders/connection-session.test.ts` |

재현 산출물에서는 `.omx/verification/clean-architecture-recheck-20261116/editor-race.repro.ts`의 F1 조기 충돌 처리만 보완했다. 설정·패키지·DB schema·잠금 adapter·UI/CSS는 변경하지 않았다. 범용 helper·공유 계층·DI 컨테이너를 추가하지 않았다.

## 최종 검사

| 검사 | 이번 실행 결과 | 원자료 |
| --- | --- | --- |
| F1 관련 |5파일/58검사 통과 |f1-green.log |
| F2 관련 |15파일/136검사 통과 |f2-green.log |
| F3 관련 |6파일/51검사 통과 |f3-green.log |
| 지정 합성 반례 |3검사 통과·exit0 |repro-after.log |
| pnpm check |173파일/1561단위·타입·린트·서버/구조 경계·빌드 통과·exit0 |check.log |
| pnpm test:s0-graph |180모듈 통과·exit0 |s0.log |
| 편집 workflow 브라우저 |49검사 통과·exit0 |editor-browser.log·editor-browser/checks.json |
| 합성 RAG 브라우저 |16검사 통과·exit0 |rag-browser.log·rag-browser/checks.json |
| 캐시 브라우저 |실제 Worker/PDF.js/IndexedDB 합성 검사 완료·exit0 |cache-browser.log·cache-browser/cost.json |
| 자료 찾기 브라우저 |55개 중53통과,1440/1920 첫 화면 위치2실패·exit1 |find-browser.log·find-browser/browser-checks.json |
| 화면 점검 |기존과 같은20지적 유지 |find-browser/taste-checks.json |

최초 전체 check의 새 테스트 readonly 배열 타입 오류는 수정했으며 `check-first-type-error.log`도 보존했다. 전체 검사1561개는 기존1548개를 재사용하고 이번13개가 증가한 값이다. 브라우저와 반례는 격리 합성 자료이며 실제 개인 원본·유료 공급자·운영 DB의 실행 증거가 아니다.

## EGM 독립 검토

원본 보호, 의미 기간 보호, 취소/저장 경계를 별도 문맥의 세 검토자가 실제 코드·호출자·테스트·반례와 대조했다. 세 명 모두 요청 범위에서 추가 지적을 찾지 못했다고 완료 결과를 반환했다. 과거 clean 판정을 재사용하지 않았으며 제품 전체나 미검증 실환경의 안전을 보장하는 판정도 아니다. [독립 검토 근거와 한계](egm-review.md)에 세부를 남긴다.

## 남은 위험과 제외 범위

- 기존 find browser의 첫 화면 위치2실패와 taste20지적은 별도 잔여다. 이번 재실행 결과를 과거 값과 구분해 기록한다. 화면 배치는 바꾸지 않았다.
- editor Web Lock 대기 자체의 signal 지원, 다른 보류 항목은 범위를 넓혀 수정하지 않았다.
- 실제 개인 폴더·운영 DB·유료 AI·새 모델 다운로드·실모델 추론·물리 IME·OS 권한창·실제 여러 탭의 경합 일정은 검증하지 않았다. 배포·커밋·푸시는 실행하지 않았다.

다른 채팅창에 전달할 [후속 지시문](NEXT_CHAT_PROMPT.md)을 함께 보관한다. 이미 해결한 항목을 다시 수정하는 지시가 아니라 현재 결과를 독립 재점검하는 범위다.
