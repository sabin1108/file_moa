# 로컬 검색과 RAG 후속 작업 검증

같은 날 이후 [자동 확인·탐색 재개·운영 반영](../local-rag-followup-20261115/README.md)을 추가했다. 아래 운영 미실행/schema3/checkpoint 없음 표시는1afcb40 당시 기록이다. 최신 상태를 앞 문서로 확인한다.

2026-11-15. 사용자 요구285와 합성 질문 유료 호출 승인(최대1달러)에 따른 후속 작업이다. 기존 캐시 재사용은 `3d251c0`이며 이번 작업은 그 다음 단계다. 운영 DB 적용·푸시·배포는 실행하지 않았다.

기능·회귀 커밋: `4343c5b`(44파일). 읽을 순서는 이 문서→명세→query plan/field→catalog/session→원격 요청 경계→테스트다. 기존 함수를 확장하고 검색 DB·모델·엔진의 제품 의존성을 늘리지 않았다.

## 결과와 선택

- 미지원 파일까지 포함하는 기기 metadata catalog, 수동 갱신·상태·파생 색인 지우기를 구현했다. 원본과 저장한 AI 기록은 삭제하지 않는다.
- 원문과 조건의 출처를 보존하는 query plan, 필수·선호·정확 구절·제외·형식·경로와 기존 날짜 확인을 연결했다. 선호 조건만 미충족인 후보는 관련 자료로 표시한다.
- 질문만 보내는 선택형 AI 조건 제안은 전송 미리보기·동의·제안 검증·별도 적용을 갖췄다. 기본 flag는 꺼져 있다.
- MiniSearch와 로컬 E5 임베딩을 같은 합성 셋에서 실행 비교했다. 추가 품질 이득이 부족해 제품 패키지·모델을 추가하지 않았다. 의미 검색을 제품에서 제공한다고 표시하지 않는다.
- 최종 질문의 원본 재읽기·hash·부분 범위 승인·전송 동의·인용 검사를 기존 RAG 경로에서 회귀 확인했다. 검색 자체는 AI 답변이나 파일 쓰기를 실행하지 않는다.

## 문제와 해결 원리

기존 방식은 이름·경로·본문을 합쳐도 모든 단어를 필수로 보았다. 고유 대상과 문서 종류를 함께 적으면 관련 메모를 놓치고, 기술 기호·정확 구절·제외 조건의 의미도 유지하기 어려웠다. 캐시에는 읽은 본문만 있어 미지원 파일 목록과 저장량을 관리하기 어려웠다.

별도 검색 서버 대신 기존 Worker·IndexedDB·연결 세션을 확장했다. catalog는 존재와 관측 상태를 보관하고, 본문 캐시는 현재 원본 hash와 추출 설정이 맞을 때 재사용한다. catalog만 보고 본문을 확인했다고 판단하지 않는다. 수정 시각은 변경 단서이며 내용의 증명이 아니다. [File.lastModified](https://developer.mozilla.org/en-US/docs/Web/API/File/lastModified)

작은 문서 유형 목록은 삭제 목록이 아니라 화면에 드러나는 선호 제안이다. 유형만 요청하거나 `+이력서`로 지정하면 필수로 유지한다. 모르는 일반 표현을 모두 의미 분석하는 구현은 아니다. 명시 조건을 지원하지 못하거나 필수 조건이8개를 넘으면 조용히 버리지 않고 실행을 막는다.

## 실제 호출과 상태 흐름

1. 자료 찾기에 요청을 제출하면 `inferFindRequest()`가 `parseDocumentQueryPlan()`을 호출한다. 원문을 입력받아 필수·선호·구절·제외·형식·경로와 원문 구간을 반환한다. 날짜는 기존 날짜 확인으로 넘긴다. [query plan](../../../apps/web/src/features/local-folders/search/documents/document-query-plan.ts), [검색 규칙](../../../apps/web/src/features/local-folders/search/documents/document-find.ts)
2. 조건을 수정하고 검색하면 `confirmFindQuery()`가 확정 plan을 만든다. 원문과 같은 조건은 request, 수정한 조건은 confirmed 출처를 갖는다. 과거 대화는 자동 추가하지 않는다. `findSourceDocuments()`는 owner/workspace/connection·권한을 확인하고 scope 잠금을 얻는다. [연결 세션](../../../apps/web/src/features/local-folders/connection-session.ts)
3. `readSourceSnapshot()`이 범위 안 파일의 metadata를 catalog에 기록한다. 형식·경로·이름의 확실한 제외는 본문 읽기 전에 거른다. 지원 본문은 Worker가 현재 bytes/hash를 검사하고 추출 캐시를 재사용하거나 새로 읽는다. `findTextEvidence()`가 field 근거·필수 조건·선호 누락·날짜를 반환한다. [snapshot](../../../apps/web/src/features/local-folders/organization/source-snapshot.ts), [field 검사](../../../apps/web/src/features/local-folders/search/documents/document-field-match.ts)
4. 날짜 상태→필수/선호 충족→이름4/경로2/본문1·구절 가중치로 제한된 후보를 정렬한다. 관련 자료의 누락 선호를 표시하고 본문 미확인 파일은 질문 근거 선택을 막는다. [순위](../../../apps/web/src/features/local-folders/search/documents/document-find-ranking.ts), [결과](../../../apps/web/src/features/local-folders/search/documents/DocumentFindResults.tsx)
5. 자료를 선택하고 질문을 준비하면 기존 grounded 경로가 최종 질문으로 원본을 재읽고 발췌/hash를 만든다. 검색 점수나 catalog hash만으로 전송하지 않는다. 동의·범위 확인 후 서버가 세션·한도·인용을 검사한다. [자료 질문 검증](../search-question-20261114/README.md)

설정 갱신은 같은 `readSourceSnapshot(..., {metadataOnly:true})`를 호출하므로 추출 Worker를 실행하지 않는다. 상태 확인은 폴더 스캔을 시작하지 않는다. 새 설정은 기존 SourceFolderSettings에 연결했다. [설정](../../../apps/web/src/features/local-folders/search/documents/SearchIndexSettings.tsx)

## 저장·삭제·동시성 계약

- 기존 `moa-local-text-index-v1` schema2→3에 catalog를 추가했다. parser2와 유효한 schema2 본문·통계·별도 store는 보존한다.
- catalog20,000개와 본문500개/UTF-16 추정50MiB를 별도로 관리한다. 본문 한도 초과 시 같은 scope의 오래된 파생 본문을 원자적으로 제거한다. 원본과 다른 계정/연결은 지우지 않는다.
- 실패·취소·한도가 없는 전체 탐색에서만 실제 관측 경로로 retain한다. 검색 조건과 맞지 않은 파일을 삭제 파일로 취급하지 않는다. 부분 갱신은 이전 목록을 보존한다. 중지 뒤 다음 갱신은 루트부터 재확인하며 지속 checkpoint 재개는 구현하지 않았다.
- inspect/refresh/clear/disconnect는 scope별 Web Lock과 세션 snapshotSequence로 직렬화한다. 새 작업 뒤 늦은 결과는 저장하지 않는다. 연결 해제는 파생 clear 성공 후 연결 정보를 지우며 실패를 숨기지 않는다. IDB 실패 시 이전 상태를 보존한다. [Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API), [IDB transaction](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction)
- **활성 폴더는 탭의 현재 세션 선택이다.** repository.active는 다음 복원의 기본값이다. 다른 탭의 선택을 실시간 강제 적용하지 않는다. 연결이 실제 삭제되면 잠금 뒤 공유 저장소를 재검사해 이전 handle의 재색인을 막는다.
- 손상 행·통계는 재사용하지 않는다. 실제 quota는 기기마다 다르며50MiB는 본문 추정 예산이다. [저장 quota](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)

## 질문만 전송하는 선택 해석

`RemoteQueryControl`은 질문 원문을 미리 보여 주고 별도 동의 후 `{requestId,owner,consent:true,question}`만 보낸다. 파일 목록·이름·경로·본문·검색 결과·이전 대화를 덧붙이지 않는다. 질문 자체에 사용자가 쓴 정보는 포함된다. 모델은 원문 부분 문자열 배열을 제안하고 로컬 검증기가 정확한 위치를 계산한다. 새 이름·모호한 위치·날짜를 내용 키워드로 바꾸는 제안은 거부한다.

동일 문자열의 중복 역할은 결정적으로 정리하되 이미 확인한 필수 대상·구절·제외를 지우지 못한다. 날짜·형식·경로는 확인값을 유지한다. 응답 뒤 조건 변경 시 적용을 막고 취소/화면 전환 뒤 늦은 응답도 버린다. 적용만으로 검색이나 답변을 시작하지 않는다. [제안 검증](../../../apps/web/src/features/local-folders/search/documents/remote-query-suggestion.ts), [UI](../../../apps/web/src/features/local-folders/search/documents/RemoteQueryControl.tsx)

서버는 flag, Origin, 최신 세션/workspace, 요청8KB/질문800자, requestId·공유 한도·timeout과 전후 세션을 검사한다. 기존 사용 원장의 query 연산으로 기록한다. [서버](../../../apps/web/src/server/organization/search-query.ts), [요청 경계](../../../apps/web/src/shared/search-query.ts)

합성 질문으로 기존 OpenAI 어댑터/설정 모델 `gpt-6-luna`를6회 호출했다. 첫3회 위치 포함 schema 검증은 모두 실패했다. 문자열 제안으로 바꾼 다음3회 중 중복 역할2회를 확인했고, 수정한 검증기로 캡처 응답3개를 **추가 호출 없이 재생해3개 모두 형태·원문 출처 검증**을 통과했다. 의미 정확도3/3을 뜻하지 않는다. 첫3회 응답 본문은 보존하지 않아 실패 원인을 하나로 단정하지 않는다.

토큰 기준 누적 추정 **$0.0003125**로 승인$1 이하다. 결제 대시보드는 확인하지 않았다. 호출 당시 확인한 표준 입력$0.10/출력$0.50 per1M 기준이다. [OpenAI 모델·가격](https://developers.openai.com/api/docs/models/gpt-6-luna), [가격표](https://developers.openai.com/api/docs/pricing). Gemini 실호출은 실행하지 않았다.

실호출은 어댑터/요청 형식을, 서버 단위·격리 DB는 인증/한도/원장을 각각 확인했다. 로그인 UI→운영 DB→유료 공급자 전체 검증으로 합치지 않는다. 운영 활성화는 `20261115010000_search_query_usage` migration→원장/격리 확인→`ENABLE_REMOTE_QUERY_PLAN=true` 순서다. 환경은 변경하지 않았다. migration 전에 켜지 않는다. [.env 안내](../../../apps/web/.env.example)

## 대안 비교와 비채택 근거

직접 작성한22문서·19질문(seed20261115,dev8/holdout11)을 고정했다. 개인 자료를 수집하지 않았다. 작은 작성 셋은 독립 공개 평가나 실제 사용자 품질의 증거가 아니다. 같은 필수 조건 검사를 적용한 결과와 검사 없는 의미 검색을 구분했다. [fixture](../../../tests/fixtures/local-rag-search-v1.json), [재현 도구](../../../tests/research/evaluate-local-rag.mjs)

| holdout 방식 | Recall@5 | MRR | 금지 결과 수 | 정답 없는 질문의 잘못된 후보 수 |
| --- | ---: | ---: | ---: | ---: |
| 기존3d251c0 | 0.20 | 0.20 | 0 | 0 |
| 현재 plan/field | 0.60 | 0.60 | 0 | 0 |
| MiniSearch7.2.0 + 조건 검사 | 0.60 | 0.60 | 0 | 0 |
| E5 유사도만 | 0.90 | 0.85 | 12 | 5 |
| E5 + 필수 조건 검사 | 0.50 | 0.50 | 0 | 0 |
| 로컬+검사된E5 RRF(k60) | 0.60 | 0.60 | 0 | 0 |

MiniSearch 실험 index7,390bytes, ESM78,025bytes, 생성 약1.4ms였다. 이 셋에서 추가 품질 이득이 없어 제품에 넣지 않았다. 메모리 검색 엔진은 지속 catalog와 원본 재검사를 대신하지 않는다. [공식 문서](https://lucaong.github.io/minisearch/)

`Xenova/multilingual-e5-small` revision `761b726dd34fb83930e26aab4e9ac3899aa1fa78`,int8를 Node CPU에서 실행했다. 다운로드135,138,424bytes, 초기화4,476.8ms, RSS 증가448,999,424bytes, 짧은21본문 색인142.1ms였다. 동의어 누락 일부를 찾았지만 필수 대상/부정을 위반했고 검사와 결합하면 추가 이득이 없었다. 브라우저 WASM/실기기 비용과 같지 않다. 제품의 자동 다운로드나 개인 폴더 임베딩은 없다. [변환 모델](https://huggingface.co/Xenova/multilingual-e5-small), [원본 E5](https://huggingface.co/intfloat/multilingual-e5-small)

의존성은 `.omx/experiments/local-rag`의 임시 평가에만 설치했다. 앱 package.json/lockfile은 그대로다. 브라우저 모델 채택은 더 큰 독립 셋의 추가 이득, 긴 문서 분할, 배포 라이선스, 기기 메모리·다운로드 동의를 먼저 확인해야 한다.

재현 환경은 이 임시 디렉터리에 `minisearch@7.2.0`, `@huggingface/transformers@3.8.1`을 고정 설치한다. 저장소 루트에서 `node tests/research/evaluate-local-rag.mjs <output>`은 lexical만 실행한다. `--embedding`을 추가하면 위 모델을 다운로드하고 로컬 추론한다. 앱 workspace 의존성으로 설치하지 않는다. 최종 의미 순위 검사는 캡처한 결과에 실제 필수 조건 함수를 다시 적용했으며 lexical 상위5개와의 단순 교집합으로 제한하지 않았다. 결과 수치는 동일했다.

## 검증과 한계

[RAG-S01~09](../../specs/local-rag-search.md)에 따라 query/Worker/경계 회귀를 작성했다. 잠금 도입으로 기존 snapshot 테스트가 scan 시작 전에 전환하거나 후속 scan을 기다리며 이전 잠금을 놓지 않던 문제를 수정했다. 실제 브라우저가 발견한 key cursor 삭제 오류는 objectStore의 primaryKey 삭제로 고쳤다. 관련 자료의 중복 완전 일치 상태도 제거했다.

- 전체166파일1,494단위, type/lint, 서버경계26·web32/domain6/layout3·S0 graph173,22경로 production build 통과. 경쟁 부하의 기존5초 timeout 실패 후 표준 `--maxWorkers=4`로 전체를 실행해 통과했다.
- 실제 Chromium 새 RAG27·field21·grounded33·사용성136 통과. 사용성에는 키보드/합성 한국어 IME가 포함된다. 검색1440/768/390px, 펼친 조건·설정1440/390px를 확인했다. 기존 승인 디자인은 유지했다.
- 실제 IDB schema2 보존·손상·quota 실패·clear rollback·scope 삭제·20,000상한·두 탭 본문 상한·blocked 뒤 연결 닫힘 통과. refresh→clear/clear→refresh, 해제 뒤 다른 탭 재기록, 동의 없는 전송0·조건 변경 뒤 적용 차단·취소 뒤 늦은 응답도 확인했다.
- 임시 로컬 PostgreSQL의 DB 계약29·인증 통합60 통과. query workspace 격리, 타 workspace 읽기/쓰기 거부, 알 수 없는 operation 거부를 확인했다. migration 개수5 고정 fixture는 실제6개로 수정했다. 운영 적용 결과가 아니다.
- production Worker의 binary hash·발췌/hash·캐시 재발췌·잘못된UTF-8·본문 검색 통과. 경로·자산은 [성능 기록](performance.md), 작은 결과 요약은 [근거](evidence.json)를 따른다.
- query/catalog 별도 architect 검토 모두 CLEAR. executor 모델 미지원 호출은 실행으로 세지 않고 주 에이전트가 구현했다.

원자료: `.omx/verification/local-rag-20261115/{index-final,browser-final,fields,grounded,usability,production,evaluation,live-query,routes-after.json}`. 합성 질문만 있고 비밀키는 기록하지 않았다.

재현: `pnpm exec vitest run --maxWorkers=4`, `pnpm typecheck`, `pnpm lint`, `pnpm test:boundaries`, `pnpm test:structure`, `pnpm test:s0-graph`, `pnpm build`. 브라우저 `tests/browser/check-{local-rag,search-cache,search-fields,grounded-chat,chat-usability}.mjs <output>`; cache는 `--expect-reuse` 추가. DB `pnpm test:database`는 격리 컨테이너만 사용한다. 유료 스크립트는 누적6회 예산 소진으로 추가 호출을 차단한다.

남은 한계: 일반 의미 검색·임의 복합 문장·DOCX/XLSX 본문·브라우저 종료 중 자동 감시·지속 scan checkpoint·대규모 개인 폴더 품질. OS 권한창·물리 IME·실제 휴대폰·이번 OCR 추론·운영 로그인과 유료 호출의 통합은 미검증이다. 메일 도메인/미리보기 구조 보류도 유지한다.
