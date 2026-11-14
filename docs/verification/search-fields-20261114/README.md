# 로컬 검색 1단계 — 필드 결합과 선택 근거

2026-11-14. 요구282의 첫 실행 단위다. 파일 이름·상대 경로·본문 검색 결합, 설명 가능한 기본 순위와 본문 미확인 후보 경계를 구현했다. 지속 metadata catalog, 증분 색인, 범용 의도 해석, 동의어/vector와 새 검색 라이브러리는 아직 도입하지 않았다. 다음 단계의 기준 문서는 [전체 검색 개선 설계](../../planning/local-search-improvement.md)다.

## 왜 이 문제부터 다뤘나

기존 `findTextEvidence`는 검색어가 본문에 모두 있어야 후보로 반환했다. 파일 이름의 대상과 본문의 문서 종류가 나뉘어 있으면 문서가 있어도 누락됐다. 별도 이름 검색과 본문 검색이 한 후보 생성 과정으로 합쳐지지 않은 것이 직접 원인이었다.

예를 들어 파일 이름이 `도담센터.md`이고 본문에 `연구보고`가 있다면 `도담센터 연구보고` 요청을 찾지 못했다. 이제 각 검색어가 이름·상위 경로·본문 중 어디에 있는지 확인해 같은 문서로 결합한다. 특정 회사나 문서 종류를 제거하는 분기는 없다.

다른 회사의 연구보고까지 모두 반환하도록 AND를 무조건 OR로 바꾸지는 않았다. 사용자가 확인한 검색어를 여전히 모두 요구하되, 확인할 위치를 넓혔다. 따라서 “여러 단어 중 일부를 주제로 해석한다”는 범용 query understanding까지 해결한 것은 아니다.

## 대안과 비교한 적합성

| 방식 | 이번 문제에 적용했을 때 | 선택 이유와 남는 한계 |
| --- | --- | --- |
| 단어 일괄 제거/모든 단어 OR | 예시의0개를 쉽게 줄일 수 있으나 다른 회사·다른 유형도 섞일 수 있다 | 채택하지 않았다. 원래 대상과 유형을 조용히 버리지 않는다. |
| 기존 reader에 이름·경로·본문 결합 | 직접 빠진 비교 대상을 추가하고 근거 위치를 설명할 수 있다 | 이번 단계의 선택. 기존 권한/hash/Worker/취소/범위와 연동하고 새 의존성이 없다. 단순 문자열 일치이므로 동의어/문장 관계는 아직 못 푼다. |
| MiniSearch 등 lexical 엔진 | field boost·ranking·prefix/fuzzy와 색인 기능을 제공한다 | 이후 동일 corpus 비교 후보다. 도구를 도입해도 field를 제대로 공급하지 않으면 이름 누락 원인은 남는다. 한국어 token·메모리·직렬화·갱신 비용을 측정하기 전 우열을 주장하지 않는다. |
| 로컬 embedding/vector | 다른 표현의 의미 유사성을 회수할 수 있다 | 지금 확인한 누락은 정확한 이름/경로를 비교하지 않은 문제라 모델이 먼저 필요하지 않다. 정확한 고유 이름·날짜·부정 조건과 모델 비용은 별도 처리해야 한다. |
| 원격 LLM/원격 vector DB | 질문 해석과 검색을 외부에서 처리할 수 있다 | 현재 로컬 파일 경계를 바꿔야 한다. 전체 폴더 전송 없이 질문만 해석하는 선택 기능은 후속 검토지만 이번 로컬 필드 결합에는 필요하지 않다. |

MiniSearch가 browser in-memory 검색, field boost와 prefix/fuzzy를 지원하는 것은 [공식 문서](https://lucaong.github.io/minisearch/)로 확인했다. 이번 구현이 더 빠르거나 더 정확하다는 비교 실험은 하지 않았다. 이번 선택은 확인한 원인을 기존 안전 경계에서 가장 작게 고칠 수 있다는 판단이다.

## 실제 코드가 실행되는 순서

1. 사용자가 검색 조건을 확인하고 **검색 시작**을 누른다. `DocumentFindController.search()`가 `confirmFindQuery()`로 검색어와 날짜를 검증한 뒤 session reader에 범위/query/AbortSignal을 전달한다. 원래 자연어 요청은 controller의 `request`에 남는다.
2. `FolderConnectionSession.findSourceDocuments()`가 `inspectSourceSnapshot()`을 호출한다. owner·연결 세대·선택 handle·취소가 바뀌면 전체 작업을 폐기하는 기존 검사를 유지한다.
3. `readSourceSnapshot()`이 폴더와 파일 이름을 탐색하고 현재 파일 metadata를 확인한다. 읽을 수 있는 본문은 `createCopyHasher().readText()`에 파일·query·이름/상대 경로를 전달한다.
4. `copy-hash.worker.ts`가 기존처럼 바이트/hash/UTF-8/PDF/OCR을 처리하고 `findTextEvidence()`를 호출한다. `postMessage`는 이 기기의 Worker와 UI 사이 메시지이며 클라우드 업로드가 아니다. 큰 본문 작업을 Worker에서 처리하는 이유는 입력·화면과 분리하기 위해서다. [Worker 동작](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)
5. `matchDocumentFields()`가 각 검색어의 이름·상위 경로·본문 위치를 확인한다. JavaScript의 `indexOf`와 `includes`는 문자열 위치/포함 확인이고, 이 함수는 그 결과를 문서 단위로 결합하는 프로젝트 규칙이다. 하나라도 확인되지 않으면 후보가 아니다. 본문 snippet과 이름/경로 근거를 구분해 반환한다.
6. `findTextEvidence()`는 기존 날짜 규칙을 적용한다. 파일명 날짜를 본문 날짜로 취급하지 않는다. 수정일은 확인한 `File.lastModified`만 쓰고 원본이 읽는 중 바뀌면 낡은 수정 시각을 버린다. 결과는 일치 위치/본문 근거/날짜 상태다.
7. snapshot은 본문을 읽지 못한 파일의 이름/경로가 맞으면 별도 `findings`에 `contentAvailable:false`를 넣는다. 이를 AI 원본 `documents`에 넣지는 않는다. 권한·취소·hash 기반 시설 오류는 metadata-only 성공으로 낮추지 않는다.
8. `retainFindCandidate()`가 같은 비교 규칙으로 상위500개를 유지한다. 이진 탐색은 삽입할 위치를 좁히는 방법이며, 뒤에서 더 강한 후보를 발견하면 가장 약한 후보를 제거한다. 순위를 적용하기 전에 처음500개에서 탐색을 끝내지 않는다.
9. session이 순위 결과와 확인/제외/한도를 반환하고 controller가 현재 세대일 때만 화면에 게시한다. UI는 공통 파일 행을 재사용하며 이름/경로/본문 일치를 짧게 표시한다. 본문 미확인 후보는 선택 불가이고 자세한 근거를 펼쳐 본다.

읽는 순서:

- [조건과 날짜](../../../apps/web/src/features/local-folders/search/documents/document-find.ts), [필드 결합](../../../apps/web/src/features/local-folders/search/documents/document-field-match.ts)
- [Worker](../../../apps/web/src/features/local-folders/content/copy-hash.worker.ts), [snapshot과 metadata fallback](../../../apps/web/src/features/local-folders/organization/source-snapshot.ts)
- [순위와 상위 후보 유지](../../../apps/web/src/features/local-folders/search/documents/document-find-ranking.ts), [session 진입점](../../../apps/web/src/features/local-folders/connection-session.ts)
- [결과 표시](../../../apps/web/src/features/local-folders/search/documents/DocumentFindResults.tsx), [선택 상태](../../../apps/web/src/features/local-folders/search/documents/document-find-controller.ts), [최종 준비 방어](../../../apps/web/src/features/conversation-workspace/material-work/request-routing.ts)

## 순위와 제한의 의미

날짜가 확인된 후보를 미확정 후보보다 먼저 둔다. 같은 날짜 상태에서는 검색어마다 이름4/상위 경로2/본문1 중 가장 강한 위치를 한 번만 반영한다. 같은 검색어가 이름과 본문에 반복된다고 중복 가산하지 않는다. 동점은 상대 경로로 정한다. 이 숫자는 이름/위치를 기억하는 파일 탐색의 설명 가능한 초기 정책이며 통계적으로 최적화한 수치가 아니다.

본문500개/50MiB 예산이 소진되면 검색 모드에서는 본문 읽기만 중단하고 이름·경로 확인은 계속한다. 일반 정리/질문용 snapshot의 기존 중단 동작은 유지한다. 항목/폴더/깊이/탐색 시간과 취소 경계는 그대로다. 시간 검사는 파일 사이의 기존 탐색 검사이며 긴 단일 OCR 처리의 전체 deadline을 뜻하지 않는다.

결과도 최대500개만 보관하고 초과 시 `result-limit`으로 부분 표시를 알린다. 제외 목록이0개여도 한도 문제를 `0개 제외`처럼 오해하게 표시하지 않는다. 전체 탐색이 불완전하면 기존 IndexedDB cache의 누락 자료를 삭제하지 않는다.

## 검증과 증거의 한계

- 실패 테스트에서 이름+본문/경로+본문/이름만 일치와 기술 기호/잘못된 field 응답의6개 실패를 먼저 확인하고 수정했다. C++/C#/.NET/Next.js의 기호를 보존한다. 이는 완전한 형태 분석기나 범용 자연어 parser 검증이 아니다.
- 단위 검증은 문서/용량 예산 뒤 metadata 탐색, 뒤쪽 강한 후보의 상위500 교체, 이름과 본문 날짜 구분, getFile 실패/원본 변경/권한 상실, metadata-only 위조 선택을 포함한다. `contentAvailable`은 기존 로컬 fixture 호환을 위해 타입상 선택 값이지만 실제 producer는 true/false를 명시한다. controller와 최종 준비 helper 모두 false를 거부하고 AI reader도 파일을 다시 검증한다.
- 합성13파일의 실제 Worker/hash/IndexedDB/OPFS 브라우저21검사 통과. 다른 회사 제외, 분산 field, 지원하지 않는DOCX/UTF-8 실패, 기술 식별자3종, 날짜, 범위, 원본 변경 후 cache, 취소와 권한, source쓰기0/모델endpoint0을 확인했다.1440/768/390px 사진을 확인했다. 권한은 합성 주입이며 실제 OS 권한 창은 이 검사의 대상이 아니다.
- 기존 사용성136, 자료 질문33 브라우저 회귀 통과. 새 검색과 합해190개다. 새 사용자 의미 이해의 정확도190개를 뜻하지 않는다.
- seed20261114로80개 query/400개 문서를 생성해 field 위치 누락을 비교했다. 기대 관련240개 중 본문만 검색하면80개, field 결합은240개를 회수했고 무관한 후보는0개였다. 독립 자연어 holdout/실제 개인 corpus/동의어/vector/라이브러리 비교 점수가 아니다. [평가 테스트](../../../apps/web/tests/local-folders/search/documents/document-field-quality.test.ts)에 목적과 생성 규칙을 남겼다.
- 첫 browser 검사는 권한 상실 후 phase가 `error`로 남는다고 가정해 실패했다. 실제 공유 연결 controller가 상태와 결과를 reset하고 다시 연결을 요구하므로, 그 실제 사용자 계약을 검사하도록 수정했다. 제품의 권한 보호를 제거한 것이 아니다.

최종 전체 단위1,461개, 타입·린트·서버 경계26·feature web32/domain6/layout3·S0 graph170과 production build를 확인했다. architect 정적 재검토 CLEAR. 마지막 metadata 상태 문구는 본문 미확인/선택 불가로 줄여 근거 상세와 분리했고, 읽지 않은 본문에 일반 확인 표시가 붙지 않게 했다.

원자료: `.omx/verification/search-fields-20261114/{browser-complete,usability,grounded,quality.json}`. 실제 유료 모델, 개인 폴더 전체 검색, 실제 모바일/물리IME는 검사하지 않았다.

기능 커밋 `ba3810bcd3b7018e29c2fa7bfe2de272b725a02f`를 main에 푸시하고 [Vercel 성공](https://vercel.com/sabins-projects-011c6dea/web/71KGWgSi7GwtJYPuC9RXG13dgYH8)을 확인했다. 실제 기존 계정의1440/390px 화면에서 새 field 안내, `Next.js` 기호 보존, 범위 radio2개, 로컬 검색 안내와 가로 넘침 없음을 확인했다. 운영에서는 검색 조건까지만 진행했고 개인 폴더 실제 검색·AI 호출·원본 쓰기는 하지 않았다. 운영 결과 정확도를 확인했다고 보고하지 않는다. `.taste-skill/search-stage1-production`에 두 상태와 사진을 남겼다.

## 비용과 다음 단계

13개 합성 파일의 같은 브라우저에서 첫 Worker/cache 검색140.5ms, 같은 corpus 재검색107.3ms가 관측됐다. 각1표본이고 이전 엔진과의 속도 비교가 아니므로 개선율·p95·실디스크 성능으로 주장하지 않는다. 본문을 읽는 방식과 hash 재검증은 그대로여서 캐시가 매번 원본을 읽는 비용을 없앤 것은 아니다.

최종 production 전체47JS/CSS 원본 합계는3,557,749→3,562,977bytes(+5,228)다. 경로별 최초 압축 전송량과 다르다. 로컬 guest11경로×2폭×3회66표본, 실제 redirect와 CLS는 [성능 기록](performance.md)에 구분했다.

다음 단위는 기존 IndexedDB cache를 활용한 metadata catalog/갱신 책임이다. 현재 코드와 query plan을 통째로 바꾸기 전에 아래를 확인한다.

1. 이름/경로/본문 후보 생성과 권한 검사, hash 재검사의 기준선을 유지한다.
2. cache hit가 실제 바이트 읽기와 추출 비용을 얼마나 줄이는지 계측한다. 현재 TXT/MD도 hash와 decode 뒤 cache를 비교하고 PDF/OCR은 먼저 추출하므로 단순 hit 수를 비용 절감으로 표현하지 않는다.
3. 수정 시각/크기는 변경 후보 단서로만 쓰고 최종 사용은 hash로 확인한다. 부분 탐색/권한 상실을 삭제로 처리하지 않는다.
4. 지속 metadata schema/version과 소유자·연결 격리, 최대 용량/제거/재생성/다중 tab writer 정책을 먼저 정한다. 새 저장소를 중복 생성하지 않는다.
5. 이후 범용 query plan에서 대상/유형/명시조건/원문/문맥 출처를 구분한다. 현재 남은 목적 문구 제거 휴리스틱을 예문별 불용어로 늘리지 않는다.
6. 같은 평가 corpus와 실제 부족 사례를 확보한 뒤 lexical 라이브러리와 선택형 로컬 embedding을 비교한다. 이번 변경을 의미 검색 완료로 보고하지 않는다.

새 모델·패키지·원격 query 해석·서버 DB·전체 폴더 업로드는 이번에 추가하지 않았다. 실제 원본 쓰기와 AI 전송 동의 계약은 그대로다.
