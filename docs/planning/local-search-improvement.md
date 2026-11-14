# 로컬 자료 검색 개선 설계와 대안 비교

작성일: 2026-11-14. 사용자 요구281. 상태: 조사와 후속 설계 제안. 검색 엔진·모델·새 의존성은 아직 도입하지 않았다. 이번에 구현한 자료 질문 연결과 검색 UI 수정은 [별도 검증 기록](../verification/search-question-20261114/README.md)으로 구분한다.

후속 요구282의 첫 실행 단위: 이름/경로/본문의 모든 검색어 확인, field별 기본 순위와 metadata-only 선택 경계를 구현했다. [선택 근거·실행 흐름·검증·다음 단계](../verification/search-fields-20261114/README.md)를 현재 상태로 우선한다. 아래의 본문 strict AND 진단은 첫 조사 당시 상태이며, 현재는 field를 결합한 AND다. 지속 catalog/증분 색인/범용 query understanding/동의어/vector/라이브러리 채택은 아직 후속 제안이다.

## 1. 판단

모아에는 서버로 폴더 전체를 보내는 RAG보다 **기기 안에서 파일을 찾고, 사용자가 고른 파일의 확인한 발췌만 답변에 사용하는 구조**가 적합하다. RAG는 검색과 생성을 결합하는 방식이며 원격 DB를 필수로 하는 제품명이 아니다. 원문의 dense index 구성 역시 검색 저장소가 반드시 원격 서비스여야 한다는 뜻은 아니다. [RAG 원 논문](https://arxiv.org/abs/2005.11401)

우선 기존 Worker와 IndexedDB 글 캐시를 활용해 파일 이름·경로·제목·본문을 함께 찾고 순위를 정한다. 그다음 holdout에서 남는 표현 차이를 확인해 로컬 embedding 또는 질문만 보내는 선택형 해석을 검토한다. 모든 검색에 LLM과 vector를 먼저 붙이지 않는다. 단순 lexical 검색만으로 임의의 자연어 의도를 완전히 이해한다고 주장하지도 않는다.

파일 목록을 원하는 요청과 선택 자료에 대한 답변은 결과가 다르다. “지금까지 쓴 이력서가 무엇인지”는 먼저 실제 파일 목록을 찾는 작업일 수 있다. 자료가 준비되지 않았다고 보내기만 막아 두는 대신 자료 선택과 검색으로 연결해야 한다. 목록 검색의 완료 조건은 관련 파일과 확인 범위 표시이고, AI 답변 생성은 필수가 아니다.

## 2. 현재 코드에서 확인한 문제

| 현재 동작 | 문제와 근거 |
| --- | --- |
| 자연어 요청을 정해진 표현 제거와 token 추출로 변환 | [document-find.ts](../../apps/web/src/features/local-folders/search/documents/document-find.ts)의 `inferFindRequest`. 최대8개 단어와 기술 기호 처리 제약이 있다. |
| 모든 단어가 본문에 있어야 후보 | 같은 파일의 `findTextEvidence`. 이름에만 있는 회사명이나 문서 종류를 놓칠 수 있다. `펄어비스 이력서`가 한 문자열인 문제가 아니라, 본문에서 두 단어 모두를 요구하는 것도 문제다. |
| 이름 검색과 본문 검색이 분리 | 제목·경로·본문을 합쳐 후보를 생성하고 순위를 매기는 흐름이 없다. |
| 매 검색마다 snapshot 탐색 | [connection-session.ts](../../apps/web/src/features/local-folders/connection-session.ts)의 `findSourceDocuments`. 캐시가 있어도 탐색 범위와 읽기 한도의 영향을 받는다. |
| 이미 로컬 전체 글 캐시가 있음 | [local-text-index.ts](../../apps/web/src/features/local-folders/search/documents/local-text-index.ts). owner/workspace/connection/path/hash/parser version으로 격리하며500개/50MiB 한도다. 현재 `search()`는 문자열 포함 검사이고 ranked retrieval에 연결되지 않았다. |
| TXT·MD·PDF·PNG·JPEG만 본문 추출 | [source-snapshot.ts](../../apps/web/src/features/local-folders/organization/source-snapshot.ts), domain 제한. DOCX·XLSX·임의 코드 형식까지 읽었다고 표시할 수 없다. |

사용자가 본 제외361개가 모두 같은 원인인지는 확인하지 않았다. 개인 폴더 전체를 조사하지 않았으므로 미지원 형식·권한·용량·탐색 제한의 실제 비중을 추정으로 단정하지 않는다.

이번 수정으로 기존 본문 AND 검색이 범용 검색으로 바뀐 것은 아니다. 특정 단어를 빼거나 본문 AND를 무조건 OR로 바꾸는 해결도 적용하지 않았다.

## 3. 전체 경로

```text
선택 폴더의 현재 권한 확인
 → 로컬 metadata 목록 갱신
 → 변경한 지원 파일만 Worker로 읽기/추출
 → 기존 IndexedDB 캐시와 lexical 색인 갱신

사용자 원본 질문
 → 목록 찾기/답변/비교 등 의도와 명시 조건 구분
 → 검증 가능한 query plan
 → 이름·경로·제목·본문·metadata 후보 검색
 → 필요할 때만 로컬 semantic 검색 추가
 → 중복 제거/순위 결합/근거 확인
 → 제한된 재검색 또는 부족한 조건 안내
 → 로컬 파일 후보 표시

사용자가 질문에 사용할 파일 선택
 → 최종 질문으로 원본 재읽기와 hash 확인
 → 발췌/부분 범위 확인
 → 명시적 동의
 → 선택 발췌 기반 AI 답변과 인용 검사
```

선택·미리보기·검색 자체가 AI 전송이나 원본 쓰기를 실행하지 않는다. 범용 검색은 파일 작업의 후보를 만들지만 파일 이동·삭제 계획의 승인까지 대신하지 않는다.

## 4. Query Understanding 선택지

| 방식 | 알맞은 책임 | 한계/비용 |
| --- | --- | --- |
| 로컬 규칙과 통계 기반 해석 | 따옴표, 명시 확장자/폴더/날짜, 부정 조건, 기술 식별자 보존, lexical 후보 생성 | 문장 관계·생소한 동의어를 모두 해석하지 못한다. 예문별 불용어를 늘리는 것으로 해결하지 않는다. |
| 로컬 작은 언어 모델 | 기기 밖으로 질문을 보내지 않고 문장 관계를 구조화할 가능성 | 모델 다운로드·초기화·메모리·한국어 품질·지원 기기 차이. 작은 모델이 이름을 바꾸거나 조건을 잘못 추출할 수 있다. 현재 채택하지 않음. |
| 원격 LLM에 질문만 전달 | 자연어 관계/다국어 표현으로 query plan 후보 생성 | 질문 자체도 개인 정보일 수 있다. 동의·비용·지연·timeout·원문 보존·schema 검증 필요. 파일 정보 전송과 분리한다. |
| embedding 중심 검색 | 다른 단어로 표현된 비슷한 내용을 회수 | 정확한 고유명사·부정·수치·날짜 조건은 별도 처리가 필요하다. vector 유사도는 의도 분석이나 정답 보증이 아니다. |

우선은 명시 조건을 로컬에서 안전하게 구분하고 lexical 검색의 누락을 줄인다. 의미 해석은 품질 측정 뒤 별도 선택지로 둔다. 기능을 제공하지 않는 단계에서 “자연어를 완전히 이해한다”는 문구를 쓰지 않는다.

### query plan에 남길 정보

- 원본 질문과 사용자 선택 의도. 목록 검색/질문/비교/정리를 구분한다.
- 원문에 근거한 핵심 대상과 출처 구간. 이름·기술·식별자는 변경 전 값을 보존한다.
- 관련도를 높이는 주제, 문서 종류와 형식. 문서 종류를 모든 상황에서 제거하거나 강제 filter로 만들지 않는다.
- `must`, `should`, `phrase`, 제외 조건. 모든 명사를 `must`로 만들지 않고 중요한 대상도 무분별하게 완화하지 않는다.
- 날짜 범위와 날짜 기준, 폴더 범위. 해석이 모호하면 확정하지 않는다.
- 사용한 이전 문맥과 그 출처. 현재 요청과 연관이 명확한 최근 문맥만 사용한다.
- 확장 표현의 생성 근거. 원문/명시 filter/로컬 해석/원격 해석을 구별한다.

`이력서`, `프로젝트`, `자료` 등은 문맥에 따라 대상·유형·배경이 될 수 있다. 고정 제거 목록으로 분류하지 않는다. 원래 질문도 검색 후보 생성에 반드시 남긴다. `.NET`, `C++`, `C#`, `Next.js`, 오류 코드, 버전, 확장자와 경로 조각을 기호 제거로 훼손하지 않는다.

원격 parser가 새 회사명·기술명·날짜 조건을 만들어도 그대로 신뢰하지 않는다. 예를 들어 Next.js 로그인 요청이 특정 라이브러리 채택을 의미하지는 않는다. 확인되지 않은 관련 표현은 약한 확장으로만 취급하거나 사용자 확인을 받는다.

“최근”에 임의로7일을 부여하거나 “지난달 회의”를 파일 수정일로 단정하지 않는다. 파일 생성일은 브라우저 File API에서 안정적으로 제공하지 않는다. 명시 범위가 없으면 최신순 제안 또는 기준 확인이 적절하다. [File.lastModified](https://developer.mozilla.org/en-US/docs/Web/API/File/lastModified)

## 5. 파일을 읽고 로컬 색인을 유지하는 방법

서버에 업로드하지 않고도 사용자가 선택한 폴더 handle로 파일을 읽을 수 있다. handle은 IndexedDB에 보관할 수 있지만 다음 실행에서도 권한을 다시 확인해야 한다. [File System Access 공식 설명](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)

내용 검색에는 기기가 파일 내용을 읽는 과정이 필요하다. 폴더 연결만으로 디스크 전체의 의미가 생기지는 않는다. 처음에는 이름·확장자·경로·크기·수정 시각을 저렴하게 목록화하고, 지원 형식의 변경 파일만 제한된 작업으로 추출한다.

### 재사용할 현재 경계

- owner/workspace/connection으로 분리된 기존 IndexedDB 캐시.
- Worker의 hash 계산과 PDF/OCR 추출, 중지·늦은 결과 차단.
- 파일당2MiB, 작업당500개/50MiB, 항목·폴더·시간 제한을 둔 snapshot 읽기.
- 원본 재검사와 발췌 hash 확인. 검색 결과는 과거 캐시이며 원본이 최종 기준이다.

새 저장소를 하나 더 만드는 것보다 기존 cache에 metadata catalog, field와 색인 version을 더하는 방향을 검토한다. 전체 추출 글·postings·직렬화 index를 얼마나 중복 보관할지는 저장량 측정으로 결정한다.

### 증분 갱신과 삭제

수정 시각/크기는 변경 후보를 찾는 단서다. 같은 값이라고 내용이 같다고 확정할 수 없으므로, 최종 사용 전 hash를 재검증한다. 본문 cache는 파일 hash와 parser version으로, vector는 여기에 chunk/model version까지 더해 구분한다.

부분 탐색·권한 실패·탐색 상한으로 안 보인 파일을 삭제된 파일로 처리하지 않는다. 성공적으로 끝난 전체 탐색에서만 누락을 확정한다. 재연결/검색 시 갱신, 중지 뒤 재개, 단일 writer 또는 Web Locks 기반 다중 탭 충돌 방지 여부를 검증한다.

브라우저 저장소는 영구 백업이 아니다. 할당량 초과와 eviction을 처리하고 삭제 가능한 파생 cache로 관리한다. `estimate()`로 용량을 살피고 `persist()`를 요청할 수 있지만 보관을 절대 보장하지는 않는다. [브라우저 저장 한도와 제거](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)

로컬 색인은 본문과 민감한 내용을 포함할 수 있으며 자동 암호화 저장소가 아니다. “원본 파일을 복제하지 않는다”는 문구로 추출 텍스트 저장 사실까지 숨기지 않는다. 연결별 사용량·갱신 상태·지우기/재생성 경로를 제공한다. 계정/연결 경계에서 접근을 막고, 연결 삭제 시 해당 캐시 정리 정책을 적용한다.

### 지원하지 않는 파일과 브라우저 수명

DOCX·XLSX·소스 코드 등은 추출기를 추가하기 전까지 이름/경로/확장자 등 metadata-only 결과로 표시한다. PNG/JPEG OCR은 글자를 읽는 기능이며 강아지 사진이나 대시보드 배치의 의미를 인식하는 모델과 다르다. format별 지원·부분 추출·암호/손상/한도를 구분한다.

숨겨진 tab은 freeze/discard될 수 있어 웹 앱을 무제한 background 색인 daemon으로 설계하지 않는다. 짧은 작업 단위와 재개 가능한 checkpoint를 사용한다. `FileSystemObserver`는 실험적 지원이므로 필수 갱신 계약으로 삼지 않는다. [Chrome 페이지 수명](https://developer.chrome.com/docs/web-platform/page-lifecycle-api), [FileSystemObserver 상태](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemObserver)

## 6. 후보 생성과 순위

이름/경로/metadata 검색과 본문 검색을 결합한다. 이름의 정확 일치·phrase, 제목, 본문 lexical 점수, 근접도, 문서 종류를 각각 다룬다. 이름 일치만으로 본문까지 검증했다고 표시하지 않는다. 날짜와 범위의 명시 filter는 점수보다 우선한다.

BM25 계열은 단순 substring보다 field와 단어 중요도를 다루기 좋지만 한국어와 기술 token 품질은 별도 평가 대상이다. exact 식별자를 무제한 fuzzy로 바꾸지 않는다. 일반 조사·언어 표현 차이의 처리는 고유 이름 보존과 구분한다.

vector를 넣는다면 lexical과 semantic 결과를 별도로 얻어 문서 단위로 중복 제거한다. 긴 문서의 chunk가 결과를 독점하지 않게 한다. 점수 체계가 다를 때 RRF 같은 rank 기반 결합을 비교할 수 있다. 기존 논문의 개선 수치를 모아 성능으로 가져오지는 않는다. [RRF 원 논문](https://cormack.uwaterloo.ca/cormacksigir09-rrf.pdf)

후속 reranking은 제한된 후보에만 수행한다. 원격 reranker에 본문을 보내는 것은 “질문만 해석”과 다른 전송이며 현재 제안의 기본 경로에 포함하지 않는다.

재검색은 후보가 없거나 관련 근거가 부족할 때만 제한된 횟수로 실행한다. 원본 query와 핵심 대상을 유지한 채 phrase/명시 filter, lexical, 제한된 prefix/fuzzy, 선택 semantic 순으로 비교한다. 날짜·대상을 조용히 완화하지 않는다. 한도에 도달하면 부족한 범위를 알리고 멈춘다. 관련 없는 결과를 채워 성공처럼 표시하지 않는다.

## 7. 구현 도구 비교

다음은 공식 기능 설명의 비교이며 채택·설치·한국어 품질·실측 성능 우열을 뜻하지 않는다. 의존성 선택 전문 에이전트는 지원되지 않는 모델로 실행 실패했으며 그 검토를 확보했다고 보고하지 않는다.

| 후보 | 확인한 기능/장점 | 모아에서 검증할 비용과 판단 |
| --- | --- | --- |
| 기존 IndexedDB/Worker 발전 | 이미 권한·계정·hash·용량 경계가 있음 | 중복 저장소를 피하는 우선 방향. 직접 검색 엔진 전체를 만드는 뜻은 아님. postings와 ranking의 유지 비용을 라이브러리와 비교한다. |
| MiniSearch | 브라우저 내 in-memory full-text, field boost, prefix/fuzzy, ranking | lexical 기준선 실험이 단순한 후보. 전체 index 메모리·한국어 token·현재 캐시 직렬화/갱신을 측정해야 한다. 의미 해석을 자체 제공한다고 볼 수 없다. |
| OramaJS | full-text/vector/hybrid를 제공하는 로컬 실행 가능 도구 | 이후 hybrid 통합 후보. Orama Cloud와 구별한다. 한국어 품질·모델 별도 비용·시작/저장 비용을 비교해야 한다. |
| FlexSearch | 브라우저/Worker, 여러 field, persistent index 경로 | Worker와 persistence가 유용한 후보. 설정 범위·CSP·한국어 처리·직렬화·취소의 실제 연동을 확인해야 한다. |
| SQLite WASM FTS5 | SQL schema, phrase/prefix/boolean/BM25, 로컬 persistence | 복잡한 filter/큰 자료에서 재평가. WASM·VFS·migration·다중 탭 locking 부담이 있다. 선택 VFS에 따라 COOP/COEP 등 조건이 다르며 OPFS 전체가 같은 header를 요구하는 것은 아니다. |
| desktop companion | native 파일 감시와 background 색인 가능 | 설치·서명·업데이트·IPC·권한·복구가 별도 제품 범위다. 대용량/지속 감시 요구가 실제로 웹 한도를 넘을 때 검토한다. |

공식 근거: [MiniSearch](https://lucaong.github.io/minisearch/), [MiniSearch 검색 옵션](https://lucaong.github.io/minisearch/types/MiniSearch.SearchOptions.html), [OramaJS](https://orama.com/products/oramajs), [OramaJS hybrid 문서](https://docs.askorama.ai/docs/orama-js/search/hybrid-search), [FlexSearch](https://github.com/nextapps-de/flexsearch), [SQLite FTS5](https://sqlite.org/fts5.html), [SQLite WASM persistence](https://sqlite.org/wasm/doc/trunk/persistence.md), [Electron process 경계](https://www.electronjs.org/docs/latest/tutorial/process-model).

추천은 기존 cache를 유지한 lexical 기준선과 MiniSearch 같은 작은 후보를 동일 데이터로 먼저 비교하는 것이다. 처음부터 자체 BM25/형태 분석기/DB/vector 서버를 모두 구축하지 않는다. 새 의존성 도입은 별도 결정이며 이번에는 lockfile을 바꾸지 않는다.

## 8. 선택형 로컬 embedding과 원격 해석

로컬 모델은 Transformers.js/ONNX Runtime Web의 WASM/WebGPU 경로로 실행할 수 있다. 모델 다운로드는 네트워크 요청이지만 문서 업로드와 다르다. 실행 가능 여부가 기기에서 감당할 품질·시간·메모리를 보장하지는 않는다. [Transformers.js](https://huggingface.co/docs/transformers.js/en/index), [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/)

lexical holdout에서 같은 뜻의 다른 표현 누락이 반복될 때 한국어/다국어 embedding을 평가한다. 모델 다운로드 크기, cold 준비, 첫 색인, 변경 파일 갱신, vector 저장량, Worker memory와 배터리 비용을 기록한다. 모델을 받지 않아도 기존 검색이 동작하고 실패하면 lexical로 복귀해야 한다.

원격 query parser는 사용자가 명시적으로 선택한 경우 질문과 허용한 비개인 날짜 조건만 전송한다. 이름·경로·본문·색인·검색 결과·다른 대화 기억을 몰래 추가하지 않는다. 현재 “이 기기에서만 검색” 약속을 유지한 채 원격 해석을 숨길 수는 없다. 실제 질문 전송 미리보기와 별도 안내가 필요하다.

parser는 JSON plan 후보만 반환하고 클라이언트가 schema/문자 길이/token 수/조건 출처/날짜/확장 범위를 검증한다. 모델이 파일 접근 명령을 실행하지 않으며 로컬 executor가 범위를 강제한다. 거절·timeout·비용 제한·잘못된 응답은 원본 query를 보존한 로컬 fallback으로 끝낸다. 같은 요청의 한정된 plan 재사용은 가능하지만 계정/문맥/날짜 기준이 다른 요청을 섞지 않는다.

## 9. 선택 자료 답변의 실제 전송 경계

현재 앱 서버에는 질문과 선택 자료의 id·이름·경로·발췌·hash·크기·수정 시각이 전달된다. 외부 AI 공급자에는 질문·내부 문서 id·파일 이름·발췌를 전달한다. 공급자 payload의 `documents[].name`을 안내에서 누락하면 안 된다.

근거: [useGroundedConversation.ts](../../apps/web/src/features/conversation-workspace/grounded/useGroundedConversation.ts), [grounded-chat schema](../../apps/web/src/shared/grounded-chat.ts), [공급자 요청 생성](../../apps/web/src/server/organization/grounded-chat.ts).

질문이 바뀌면 발췌 위치도 바뀔 수 있으므로 기존 hash와 재동의만으로 충분하지 않다. 최종 질문에 맞춰 선택 자료를 다시 읽고 발췌를 새로 확인해야 한다. 준비 목적·질문·선택·원본/발췌 hash에 동의를 묶고 일부만 읽혔다면 그 범위를 승인받는다. 인용이 발췌에 포함되는지 검증하고 원본/권한 변경과 취소 뒤 늦은 답변을 표시하지 않는다.

## 10. UI 방향

평소에는 검색 대상과 범위, 검색 행동만 보인다. 날짜와 고급 조건은 요청에 필요할 때 펼친다. 결과는 파일명과 짧은 이유를 중심으로 목록화하고 상세 근거는 펼쳐 확인한다. 제외 수백 개를 기본 화면에 모두 출력하지 않는다.

0개 결과는 “무엇을 바꾸면 되는지”와 확인하지 못한 범위를 구분한다. 미지원 형식·읽기 실패·한도는 한 실패처럼 보이게 합치지 않고 접은 상세에서 원인별 수와 제한된 항목을 확인한다. 날짜 미확정과 조건 일치는 서로 다른 상태다. 모든 점수와 기술 설정을 처음 사용자에게 노출하지 않는다.

이번 변경은 조건 접기, 기간 접기, 결과/0개 위계, 제외 상세20개씩 표시, 선택한 자료로 질문 연결을 구현했다. 이름/본문 결합·ranking·새 query plan은 후속 설계다.

## 11. 평가 자료와 성공 기준

사용자가 제시한 예시는 요구 범위를 보여 주는 test family다. 예문을 그대로 통과시키는 분기 목록으로 쓰지 않는다. 취업·코드·학습·업무·디자인 등 여러 분야의 합성 corpus와 새로운 query를 만들고, 설정 조정용과 holdout을 분리한다. 생소한 회사/프로젝트 이름은 임의 생성해 사전 의존을 확인한다. 개인 파일은 허용 없이 외부 평가 서비스에 보내지 않는다.

필수 반대 사례:

- 이름에만 핵심 대상이 있는 자료, 본문만 일치하는 자료, 잘못된 회사의 같은 문서 종류.
- `이력서 양식`에서 유형을 버리지 않는지, 같은 단어가 문맥에 따라 달라지는지.
- C++/.NET/C#/Next.js/버전/오류 코드/따옴표 phrase, 한국어와 영어 혼합.
- 서로 다른 대상 여러 개, 부정 조건, 짧고 모호한 질문, 무관한 이전 문맥.
- 날짜 불명/서로 다른 본문 날짜/수정일 차이, 임의 생성일/최근 기간을 만들지 않는지.
- 동일 이름의 다른 경로/버전, 긴 문서 chunk 중복, metadata-only DOCX/XLSX, 이미지 OCR과 사진 의미 검색 차이.
- 파일 변경/삭제/권한 상실/계정 전환/취소/다중 탭, 부분 탐색 뒤 캐시 보존, 저장소 eviction/초과.
- 실제 관련 파일이 없는 query에서 무관한 후보나 답변을 억지로 생성하지 않는지.

품질은 Recall@K, 첫 관련 파일의 순위(MRR), 순위 품질(nDCG), 고유 대상 보존, 조건 정확도, 무관 후보율, 근거 원문 일치를 기록한다. 반환 건수만으로 성공을 판정하지 않는다. 모델을 사용하는 경우 schema 실패·대상 변경·날짜 추정 오류도 별도 기록한다.

비용은 파일 수/본문 크기/형식/기기/seed/holdout 출처를 남기고 첫 목록화, 추출, 색인, 증분 갱신, cold/warm 검색의 p50/p95, main thread blocking, Worker memory, 저장 bytes와 bundle/model 다운로드를 측정한다. 목표값과 실제 측정은 구분한다. 현재 엔진 대안의 비교 수치는 없다.

## 12. 실행 순서와 남은 결정

1. 현재 실패를 기준 corpus/query로 고정한다. UI 수정과 정확도 지표를 구분한다.
2. 기존 캐시에 metadata catalog와 field를 도입하고 이름/경로 후보를 본문과 결합한다. 미지원 파일은 metadata-only로 포함한다.
3. 일반 query plan과 원문/식별자 보존, lexical 순위, 제한된 fallback을 함께 실험한다. 저장소 중복과 새 범용 계층은 피한다.
4. 같은 corpus로 기존 방식과 작은 lexical 후보를 비교한다. 품질/메모리/갱신/번들 비용으로 채택을 결정한다.
5. 표현 차이의 누락이 남을 때만 선택 로컬 embedding을 측정한다. 원격 질문 해석도 별도 opt-in 계약 뒤 비교한다.
6. 선택 파일을 최종 질문으로 다시 추출하는 답변 경계와 기존 hash/동의 검증을 계속 유지한다.
7. 지속 감시/규모가 실제 웹 한도를 넘을 때만 desktop companion을 별도 제안한다.

미결정: 한국어 token 처리 방식, 도구 채택, field 가중치, catalog/본문/postings 저장량, index 한도와 migration, chunk 크기와 모델, 원격 해석 허용 여부, 다중 탭 writer 정책. 이 결정 전 모든 확장 기능이 구현된 것으로 표시하지 않는다.
