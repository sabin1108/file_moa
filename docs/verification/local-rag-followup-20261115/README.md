# 검색·RAG의 남은 운영 반영과 탐색 재개

2026-11-15. 사용자는 남은 작업의 수행과 `$ego-browser` 사용을 요청했다. 이어 다운로드형 의미 검색의 대기·사용성 저하를 질문했다. 앞선135MB 모델은 추가 품질 이득이 없어 이번에도 도입하지 않았다. 자동 metadata 확인·지속 탐색 재개·운영 반영을 진행했다. 일반 의미 검색이 완료됐다는 뜻은 아니다.

## 현재 결과

기능 커밋 `5c08b78`을 기존 cache/query plan 커밋과 함께 origin/main에 일반 푸시했다. 운영 migration `20261115010000_search_query_usage`를 적용하고 이력6개·확장된 query CHECK·제한 runtime 역할을 재확인했다. Vercel Production Ready·Current와 실제 운영 도메인의 새 기능을 확인했다. [배포](https://vercel.com/sabins-projects-011c6dea/web/3NdcCEANJaE4fftwKGysyAnLPu6w), [운영 사이트](https://web-eight-rho-72.vercel.app/)

## 자동 확인과 중단 재개 원리

이전 metadata 갱신은 매번 루트부터 시작했다. 이제 기존 IDB의 schema4 `scans` store에 연결별 queue·cursor·관측 경로·누적 제한·실패·활동 시각을 둔다. 한번에250항목 또는 약1초까지 처리한 뒤 저장한다. 원본 파일명·경로는 기존 연결 권한 범위의 기기 DB에만 남으며 서버에 전송하지 않는다.

1. 수동 갱신/자동 확인이 세션의 owner/workspace/connection과 권한을 확인하고 scope Web Lock을 얻는다. 자동은 잠금이 비어 있지 않으면 기다리지 않고 건너뛴다.
2. 검증된 checkpoint가 있으면 마지막 완료 batch부터 queue를 이어간다. 개수뿐 아니라 전체 경로/레코드 오버헤드의 추정2MiB 상한, root·cursor·카운터·관측 경로의 처리된 queue 소속도 검사한다. 활동이24시간 끊기거나 손상된 지점은 재사용하지 않는다.
3. metadata는 기존 `readSourceSnapshot()`·listing/path/permission 검사를 재사용한다. 본문을 Worker로 보내지 않는다. 취소된 batch는 직전 저장 지점에서 다시 처리한다. 실패가 있는 cycle도 남은 queue를 확인하되 retain은 실행하지 않는다.
4. 건강한 전체 cycle이 끝난 경우에만 관측하지 못한 파생 cache/catalog를 정리한다. 시간 배치 중지는 재개 가능, 전체 파일/폴더/깊이/listing/checkpoint 상한은 부분 결과로 구분한다. checkpoint 저장 실패는 이전 지점 삭제를 시도하고 자동 확인을 꺼 반복 실패를 막는다.
5. 자동은 기본 꺼짐이고 연결별 opt-in이다. 보이는 화면에서만30초 간격으로 확인하며 focus가 자주 바뀌어도 주기를 지킨다. 숨김·owner/연결 변경·화면 종료는 취소한다. 사용자 검색은 자동 확인을 우선 중단하지만 자동 설정 자체를 끄지는 않는다.
6. 기기 색인 지우기는 본문/catalog/stats/checkpoint를 원자 삭제하고 자동 확인도 끈다. 원본과 AI 기록은 유지한다. 자동 실행 직전에 현재 저장 설정을 다시 읽어 다른 탭의 clear 뒤 재생성을 막는다.

읽을 순서: [checkpoint 검증](../../../apps/web/src/features/local-folders/search/documents/local-index-scan.ts)→[IDB](../../../apps/web/src/features/local-folders/search/documents/local-text-index.ts)→[snapshot](../../../apps/web/src/features/local-folders/organization/source-snapshot.ts)→[세션](../../../apps/web/src/features/local-folders/connection-session.ts)→[React 수명/설정](../../../apps/web/src/features/local-folders/use-source-folder-connection.ts)→[설정 UI](../../../apps/web/src/features/local-folders/search/documents/SearchIndexSettings.tsx). 명세는 [RAG-S10~12](../../specs/local-rag-search.md)다.

새 FileSystemObserver에 의존하지 않고, 이미 허용된 handle의 읽기 권한을 query만 한다. 자동 권한 요청·본문 추출·AI 호출·원본 쓰기는 없다. 브라우저가 닫혀 있으면 감시하지 않는다. [권한 확인](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemHandle/queryPermission), [Web Locks](https://w3c.github.io/web-locks/), [실험적 observer](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemObserver/observe)

## 검증

- 전체167파일1,501단위, type/lint, 서버경계26·web32/domain6/layout3·S0 graph174,22경로 production build 통과. 최종 architect CLEAR.
- 실제 Chromium의 새 RAG37·field21·grounded33·사용성136검사 통과.300개 추가 파일에서 batch→다른 복원 탭 재개→기존 metadata 중복 읽기 없음, hidden 중 자동0/visible 재개, 추가·수정·삭제 관측, checkpoint quota 실패 후 자동 중단·catalog 보존을 확인했다. 자동이 사용자 작업으로 중단돼도 설정/checkpoint를 유지하는 단위 회귀를 추가했다.
- 실제 IDB의 schema2→4 본문/통계 보존, catalog20,000상한·손상·quota·원자 clear/rollback·타 scope 보존과 checkpoint near-cap/손상/quota/clear를 확인했다. 자동 경로에서 status 전체 getAll을 하지 않는다.
- checkpoint 상한 직전 합성1,546 queue항목, JSON UTF-8 994,055bytes에서3회 clone1.1~1.8ms·쓰기2.5ms·읽기1.6~2.5ms였다. 추정2MiB는 IDB의 실제 직렬화 크기와 동일한 수치가 아니다. Edge 실기기/실디스크/long-task 직접 관측은 없다.
- 실제 production Worker hash/발췌/cache/잘못된UTF-8/본문 검색도 통과했다.11guest경로×2폭×3회66표본·console오류0. JS/CSS47파일3,603,981→3,610,476bytes(+6,495). 보호 경로의 redirect·일부 인증 CLS를 원자료에 유지했다. 인증 채팅 성능·현장 지표·속도 개선율이 아니다.

## 운영 브라우저 확인

Ego에서 기존 로그인과 이미 연결된 검증 폴더를 사용했다. 새 OS 폴더 권한을 우회하거나 개인 노트 전체를 스캔하지 않았다.6개 metadata 목록 갱신/자동 켜기·끄기,1440/390px 넘침 없음, TXT 형식의 로컬 검색에서 기대 파일1개, 선택 자료 질문 준비와 전송 버튼 잠금을 확인했다. 개인 자료를 AI에 보내지 않았다. 원래 활성 연결과 자동 확인 설정은 마감 시 복원한다.

운영 질문 해석은 합성 질문만 사용했다. 첫 시도는 로컬 fallback 안내, 다음 시도는 Server Action200/ok와 제안·별도 적용을 확인했다. 첫 실패의 원인은 응답을 캡처하지 않아 확정하지 않는다. 제안 적용만으로 검색은 시작되지 않았다. 운영 usage flag가 꺼져 있어 이 두 시도의 실제 토큰 원장은 없으며, 이후 활성화 검증은 별도 기록한다.

최종 운영 확인: `AI_USAGE_LEDGER_ENABLED=true` 등록 후 `e931e2b` 배포 성공을 확인하고 마지막 합성 질문1회만 추가했다. 화면에 조건 제안이 표시됐고 운영 query 원장에는 `completed / gpt-6-luna / 입력227·출력31 / 총258토큰`1건이 기록됐다. 요청/응답 캡처는 질문·모델·조건의 합성 정보와 오류 코드만 보관하고 cookie/토큰/문서 본문은 수집하지 않았다. 초기 응답 관측이 다른 Server Action보다 먼저 끝난 경우가 있어, 모델 요청 응답과 UI 결과가 도착할 때까지 관측한 뒤 성공으로 판정했다.

실제 제한 runtime의 검증된 TLS·비슈퍼유저/NOBYPASSRLS·원장 RLS 강제·문맥 없는 조회0행도 확인했다. usage에는 질문·본문을 저장하지 않는다. 개인정보가 있는 노트 전체와 선택 자료 본문은 유료 확인에 보내지 않았다. 전체 운영 grounded 답변 생성은 여전히 별도이며 준비/동의 잠금과 합성33검사까지 확인했다.

비용: 기존6회 토큰 추정$0.0003125, 마지막 원장 확인1회$0.0000382다. 원장 비활성 상태의 앞선 운영2시도는 실제 토큰이 없어0으로 기록하지 않는다. 입력4096/출력1600 제한과 확인한 표준 가격으로 세 운영 시도의 토큰 상한을 합쳐도 전체 검증$0.0039413 이하(1달러 예산 이내)다. 실제 결제 대시보드·세금·다른 사용자의 사용액은 포함하지 않는다. 유료 호출은 더 하지 않았다.

## 운영 적용 경계

운영 migration 전 기존5개 이력의 본문/체크섬을 확인했다. workspace guide 파일의 차이는 Git CRLF/LF뿐임을 HEAD와 대조했다. 새 SQL hash는 `3e8f09a5419b44ab547e6bf1dc925044e0283629765897b4322998ea71063b85`다. TLS 검증은 끄지 않았다. 처음 사전 확인 스크립트의 URL TLS 옵션이 CA를 덮어쓴 오류를 기존 앱의 URL 정리 방식으로 수정했다. 실제 서비스의 TLS 오류라고 단정하지 않는다.

`ENABLE_REMOTE_QUERY_PLAN=true`를 운영에 등록하고 해당 설정이 포함된 배포의 실제 UI를 확인했다. 사용량은 질문/문서 없이 기존 연산·모델·토큰 metadata만 기록한다. 유료 검증은 원래 승인한 합성 질문/최대$1 안에서 제한하며 실결제 대시보드 비용과 토큰 추정을 구분한다.

원자료 `.omx/verification/local-rag-followup-20261115/`에는 browser/index/fields/grounded/usability/production/routes-after.json/db-after.json/db-apply.json/production-query-diagnostic.json이 있다. 작은 결과 요약과 최종 운영 상태는 evidence.json을 따른다.

남은 한계는 일반 의미 검색·독립적인 실제 사용자 품질 평가·물리 IME/실기기·브라우저 종료 중 감시·현재 상한 밖의 폴더다. 이 범위를 끝났다고 표시하지 않는다. 다운로드형 모델은 첫 방문 대기·메모리 부담과 확인되지 않은 추가 이득 때문에 보류한다.
