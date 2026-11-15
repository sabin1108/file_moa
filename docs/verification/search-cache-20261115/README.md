# 검색 캐시 재사용과 갱신 검증

2026-11-15. 어제 마친 [검색 필드 결합](../search-fields-20261114/README.md) 다음 작업을 진행했다. 기존 IndexedDB 캐시에 추출 metadata를 보강하고, 현재 원본 hash가 일치할 때 TXT/MD 디코딩과 PDF/OCR 추출을 재사용한다. 검색어 해석이나 순위는 바꾸지 않았다.

## 문제와 선택 근거

이전 Worker는 TXT/MD 바이트를 읽고 hash와 UTF-8 디코딩까지 마친 뒤 캐시와 비교했다. PDF/OCR은 캐시와 무관하게 다시 추출했다. 따라서 `readPath`가 항목을 찾는 횟수만으로 비용 절감을 주장할 수 없었다.

기능 수정 전에 같은 합성 MD/PDF로 측정한 결과, 재검색3회 모두 MD 디코딩과 PDF 추출이 다시 실행됐다. 이번에는 원본 바이트 읽기와 SHA-256을 유지하면서 그 뒤의 추출만 생략한다. 크기/수정 시각만 비교하면 동일 metadata의 변경 파일을 놓칠 수 있으므로 채택하지 않았다. 새 DB를 만들면 갱신·격리 책임이 늘어나므로 기존 `documents`/`stats`를 그대로 쓴다. 서버 검색·새 패키지·embedding은 이 비용 문제의 해결에 필요하지 않았다.

## 사용자 행동부터 화면까지

1. 사용자가 검색을 시작하면 기존 controller/session이 현재 owner·workspace·connection·선택 범위와 취소 신호를 `readSourceSnapshot()`에 전달한다. [실제 읽기](../../../apps/web/src/features/local-folders/organization/source-snapshot.ts)
2. snapshot은 현재 읽기 권한과 파일 크기를 확인하고 `LocalTextIndex.readPath(scope, path)`로 같은 범위의 파생 본문을 조회한다. 저장 행의 식별자·scope·본문·hash·parser version·metadata 형태를 검사하며, 실패하면 캐시 없이 원본을 읽는다. [기존 저장소](../../../apps/web/src/features/local-folders/search/documents/local-text-index.ts)
3. `createCopyHasher.readText()`가 현재 `File`·질문·검색 조건·캐시를 이 기기의 Worker로 보낸다. Worker의 `arrayBuffer()`는 원본 바이트를 읽고 `crypto.subtle.digest()`는 그 바이트의 SHA-256을 새로 만든다. 이 메시지는 클라우드 전송이 아니다. [Worker 호출과 수명](../../../apps/web/src/features/local-folders/content/copy-hash.ts)
4. `reusableCachedText()`는 새 hash와 캐시 hash, 형식, 크기/수정 시각, OCR 설정을 비교한다. 모두 맞아야 `cacheHit:true`가 된다. 이전 항목에 metadata가 없거나 parser version/형식/설정이 다르면 다시 추출한다. size/mtime은 hash를 대체하지 않는다. [재사용 규칙](../../../apps/web/src/features/local-folders/content/text-cache.ts)
5. hit이면 저장된 전체 본문과 PDF/OCR의 쪽수·완전 여부를 사용한다. miss이면 기존 UTF-8/PDF/OCR 처리와 오류 분기를 실행한다. 어느 쪽이든 `organizationExcerpt(text, instruction)`으로 현재 질문의 발췌를 다시 만들고 발췌 hash와 현재 검색 근거를 새로 계산한다. [Worker 처리](../../../apps/web/src/features/local-folders/content/copy-hash.worker.ts)
6. 반환된 본문·발췌·hash·metadata를 받은 snapshot은 파일을 다시 얻어 size/mtime을 비교하고 현재 권한·세대·취소를 재확인한다. 새 추출은 기존 항목을 갱신하고 hit은 본문을 다시 쓰지 않는다. 현재 질문의 발췌를 기존 `documents`에 넣어 controller와 화면으로 반환한다. 부분 PDF/OCR은 기존 한도 표시를 유지한다.
7. 전체 범위 탐색이 실패·한도 없이 끝났을 때만 `retain()`이 누락 파생 항목을 제거한다. 선택 범위/부분 탐색/취소는 삭제 근거가 아니다. 손상된 파생 행은 이 정리에서 제거하고 유효 행만으로 통계를 다시 만든다. 원본이나 별도 AI 기록 저장소는 대상이 아니다.

## 갱신과 저장 경계

- DB 이름 `moa-local-text-index-v1`, IDB schema2와 parser2를 유지했다. 추출 방식 자체는 그대로라 version을 올리지 않았고, metadata 없는 이전 행은 안전하게 miss로 처리한다.
- 성공적으로 읽은 본문의 같은 행에 format/size/mtime/OCR 설정/PDF·OCR 상태를 둔다. 미지원 형식과 본문 없는 파일까지 포함하는 전체 metadata catalog는 아직 후속이다. 별도 영구 저장소를 추가하지 않았다.
- 500개/본문 UTF-16 추정50MiB 한도와 초과 쓰기 거부 정책을 유지한다. 자동 eviction은 없다. metadata의 소량 부가 공간이나 브라우저 quota 전체를50MiB로 보장한다는 뜻은 아니다.
- 두 탭의 쓰기는 documents/stats의 같은 readwrite transaction에서 직렬화된다. 손상 행·음수/비정상 통계는 쓰기를 중단해 기존 유효 데이터를 보존한다. blocked open은 실패로 반환하며, 그 요청이 늦게 성공해도 연결을 닫는다.
- 캐시는 같은 origin에서 생성한 파생 본문이라는 신뢰 가정을 갖는다. 형태 손상은 거부하지만 본문과 hash를 함께 바꾸는 악성 same-origin 코드에 대한 인증 저장소는 아니다. 별도 추출 본문 checksum을 추가하지 않았다.
- OCR 설정을 끄면 저장된 OCR 본문을 사용하지 않는다. 이전 본문을 즉시 물리 삭제하는 정책은 이번에 추가하지 않았다. 브라우저가 닫힌 동안 원본 변화를 지속 감지하지 않는다.

## 실행한 검증

- 명세 [CACHE-001~007](../../specs/local-search-cache.md)을 먼저 작성하고 기존 Worker에서5개 실패를 확인했다. decode 생략/PDF 재사용과 새 cache 상태 반환이 아직 없어서 실패했고, 구현 후 통과했다.
- 전체161파일1,471단위, 타입/린트, 서버경계26·web32/domain6/layout3·S0 graph171, production22경로 build 통과. [Worker 테스트](../../../apps/web/tests/local-folders/content/source-snapshot-worker.test.ts)는 실제 handler와 실제 SHA-256을 실행하며 PDF 파서는 대체한다. [snapshot 테스트](../../../apps/web/tests/local-folders/organization/source-snapshot.test.ts)는 저장 호출·hit 쓰기 생략·전체/부분 탐색 정리를 확인하며 디스크/Worker를 대체한다.
- [새 Chromium 검사](../../../tests/browser/check-search-cache.mjs)는 실제 Worker/PDF.js/IndexedDB를 실행한다. 매 hit의 원본 바이트 읽기1회와 source/발췌 hash2회, warm MD decode0회, warm PDF 추출0회, 현재 질문 발췌를 확인했다. scope3종·이전 parser·취소 보존·손상 행·NaN 통계·실패 쓰기 보존·통계 복구·blocked 뒤 연결 닫힘·두 탭499→500 한도 경쟁도 통과했다.
- 실제 OPFS/Worker를 사용하는 기존 field 검색21검사와 자료 질문33검사 통과. 최종 production으로 컴파일된 Worker의 hash/발췌/캐시 재발췌/잘못된UTF-8/본문 검색도 통과했다. 합성 권한과 실제 OS 권한창을 구분한다.
- 기존 실제 PDF.js 검사도 통과했다. 텍스트 PDF·빈/손상 PDF·51쪽·문자 한도·파일 크기·기존 index 교체/격리/취소/정리를 확인하며 실제 스캔 문서 OCR 검증으로 보지 않는다.
- architect가 처음 지적한 손상 통계 경로를 보완했고 재검토 결과는 `CLEAR`다. 별도 executor 역할 호출은 지원되지 않는 모델 오류로 실행되지 않았으며, 그 작업은 주 에이전트가 수행했다.

명령: `pnpm exec vitest run --maxWorkers=4`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `node tests/architecture/check-server-boundary.mjs`, `node tests/architecture/check-feature-boundary.mjs`, `node tests/architecture/check-s0-module-graph.mjs`.

브라우저 재현: `node tests/browser/check-search-cache.mjs .omx/verification/search-cache-20261115/recheck --expect-reuse`, `node tests/browser/check-search-fields.mjs <output>`, `node tests/browser/check-grounded-chat.mjs <output>`, production 서버 실행 뒤 `node tests/browser/check-production-snapshot-worker.mjs http://127.0.0.1:3034 <output>`.

## 비용과 남은 범위

합성 PDF의 warm3회 중앙값은247.6→12.7ms, MD는18.3→17.6ms였다. 작은 단일 파일과 새 Worker를 쓰는 통제 관측이며 실제 디스크·대규모 폴더·사용자 집단의 개선율이 아니다. 자세한 단계별 비용과 사이트 경로 결과는 [성능 기록](performance.md)을 따른다.

원자료는 `.omx/verification/search-cache-20261115/`의 before/after·fields·grounded·production·routes-after.json에 있다. 원본 개인 폴더 전수 검색, 실제 OS 권한창/물리IME/실제 휴대폰, 실제 OCR 추론·유료 모델과 운영 검색은 검증하지 않았다.

다음 검색 품질 단위는 원문·고유 대상·문서 유형·명시 조건·문맥 출처를 보존하는 query plan이다. 미지원 파일을 포함하는 전체 catalog/자동 eviction/증분 탐색과 의미 검색은 완료로 표시하지 않는다.
