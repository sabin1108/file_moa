# 일상 요청 평가 확장·미사용 시안 정리

후속 기대값 근거 검토·표현 변형·지침 v4 평가와 사용자 확인 결과는 [다음 검토 기록](../expectation-review/README.md)에 있다. 이 문서의 실제 6요청은 지침 v3 당시의 기록이다.

2026-11-07. 사용자 요구에 따라 일상 사용자가 생각할 법한 요청을 의도별로 분류하고 기존 84개 합성 자료를 재사용했다. 실제 사용자 조사/빈도 통계는 없으므로 후보와 기대값은 사람 검토 전 도우미 초안이다. 새 의존성·제품 API·원본 파일 접근은 추가하지 않았다.

## 평가 범위

| 구분 | 이번 구성 | 실행 결과 |
| --- | --- | --- |
| development | 공개 84문서, 40요청 | 필수 일치·보류 ID 62/62 후보 유지 |
| holdout | 기존 유보 8문서, 4요청 | 필수 ID 5/5 후보 유지, 제품 튜닝/외부 전송 없음 |
| 미지원 후보 | 6요청 | 미실행, 품질 분모 제외 |
| 새 실제 모델 표본 | development 6요청, 6개 의도 그룹 | 6/6이 초안 기대값과 일치 |

실행 가능한 총 44요청은 다음 12그룹에 속한다.

| 의도 그룹 | 요청 예 |
| --- | --- |
| 기간·날짜 | 본문 작성일로 보고서 정리, 10월만 필터하고 날짜별 폴더는 만들지 않기 |
| 웹 성능 | 실제 LCP/INP/네트워크 측정만 찾고 정의 학습/오해하는 제목 제외 |
| 재무 | 회사 비용, 채널 매출, 거래처 미수금 |
| 통계·분석 | 방문 실적, 만족도 수치, 결측 처리 |
| 공부 | 확률 개념 복습, 영어 공부 시간, 자격시험 오답 |
| 연구 | 선행 연구 선정, 실험 설계, 논문 제출 점검, 진행률 |
| 개발 | 한글 조합 중 Enter, API 비밀키, 접근성, 컴포넌트 책임 |
| 회사 업무 | 실제 재고와 입고 예정 구별, 반품 원인, 문의 집계, 입사 안내 |
| 개인 일정 | 여행 일정, 업무가 섞인 문서 보류 |
| 파일 형식 | 검증된 PDF 인계 내용, 엑셀 예산·오류율 근거 |
| 자료 범위 | 선택 문서만, 현재 폴더와 하위만 |
| 안전·결과 없음 | 해당 계약서 없음, 문서 안 공격 지시문, 부족한 내용 보류 |

미지원 후보는 중복 삭제, 최종본 자동 선택, ‘지난주’ 같은 상대 날짜, 개인정보 가림, 스캔 OCR, 연결하지 않은 폴더 자동 탐색이다. 이 후보 목록을 만들었다는 이유로 기능이 구현됐다고 표시하지 않는다. 현재 계약으로 판정할 수 없는 요구를 가짜 정답이나 skip 테스트로 부풀리지 않았다.

요청별 ID·근거·날짜·목적지·범위·제외는 [request-evaluation.json](../../../tests/fixtures/classification/request-evaluation.json)의 원본을 따른다. 기존 v1 20요청은 그대로 보존하고 새 development 24요청을 추가했다. corpus/holdout 원문·분리·해시는 바꾸지 않았다. 후보 함수는 새 요청에서도 누락이 없어 수정하지 않았다.

## 실제 Gemini 평가

| 요청 ID | 후보 | 일치 / 보류 | 입력 / 출력 토큰 | 전체 ms |
| --- | ---: | ---: | ---: | ---: |
| company-expenses | 19 | 1 / 0 | 2,986 / 135 | 4,864 |
| survey-satisfaction | 20 | 2 / 0 | 2,990 / 207 | 5,067 |
| probability-notes | 19 | 1 / 0 | 2,958 / 145 | 5,775 |
| literature-review | 17 | 1 / 0 | 3,321 / 130 | 4,447 |
| korean-enter-input | 21 | 1 / 0 | 2,794 / 113 | 6,026 |
| no-signed-contract | 18 | 0 / 0 | 3,097 / 41 | 6,035 |

새 생성/countTokens 각각 6회. 입력 18,146 + 출력 771 = 총 18,917토큰. 기본 서버의 서명 세션·Origin·동의·서버 등록 자료·원자 DB 한도·8,192입력/3,200출력/25초 제한을 유지했다. 각 요청은 독립된 익명 샘플 세션이며 전역 분당/시간 제한을 함께 적용했다. 각 생성 사이 60초를 기다렸고 자동 재시도·모델 대체·한도 초기화는 하지 않았다. 요금제/청구 금액은 확인하지 않았다.

회사 지출, 설문 MD+엑셀, 공부 개념, 선행 연구, 입력 폼의 의미를 서로 다른 요청으로 검증했다. 자료가 없는 서명 계약 요청은 일치/보류를 만들지 않았다. 모델 입력은 요청과 서버 소유 후보 문서뿐이며 기대값/holdout은 전송하지 않았다. 모델과 정책은 기존 `gemini-3.5-flash-lite`/v3를 유지했다. 최초 보고서/웹 성능 두 요청과 합하면 지금까지 최종 v3로 평가한 고유 요청은 8개다. 반복 호출을 고유 요청 수로 세지 않는다.

원자료는 `organization-evaluation/live-<요청ID>-2026-11-07T09-*.json` 6개다. 각 파일에 `datasetVersion: request-v2`, `intentId`, corpus/정책/프롬프트 해시, 후보 ID, 원 응답·토큰·시간·판정이 있다. 기계 판독 요약은 [live-summary.json](live-summary.json). 후보 검색 보고서는 [retrieval-report.json](../organization-evaluation/retrieval-report.json)이며 모델 정확도와 구분한다.

## 정리 결과와 근거

[사전 계획](../../planning/everyday-evaluation-cleanup.md)을 작성하고 기존 관련 129검사를 통과시킨 뒤 참조 그래프를 조사했다. 명시적으로 선택하는 ‘준비된 제안 보기’는 실제 AI 오류를 숨기는 fallback이 아니므로 유지했다. 제거/보존 판단은 사용처와 책임을 기준으로 했으며 임의 계층·디자인 재작성은 하지 않았다.

| 판단 | 구성과 근거 |
| --- | --- |
| 제거 | SourcePanel, DocumentInspector, FileList, FolderOverview: 다른 소스에서 import/reference 없음 |
| 제거 | sources/inspector/file-list CSS Modules: 위 미사용 컴포넌트 전용 |
| 제거 | 위 시안의 고립된 자료 export 6개: 다른 소비자 없음 |
| 유지 | shared library.module.css: 활성 파일 시안 컴포넌트들이 사용 |
| 유지 | `/demo`의 채팅·파일·설정·미리보기·계획 검토·되돌림·API·샘플 상태: 실제 체험 경로 |
| 유지 | `/preview` 카탈로그, 5 screen/28 scene, 데이터·피드백·버튼: 디자인 비교와 캡처 경로에서 사용 |

삭제한 7파일은 191줄/20,809바이트이며 자료 export 정리는 별도다. 원본은 무시된 `.omx/cleanup-backups/everyday-prototypes`에 복구 사본을 남겼다. 실제 사용자 파일이나 기존 기록을 삭제하지 않았다. 코드만으로 미사용이라고 단정하기 어려운 CSS 선택자·향후 기능은 이번에 확대 삭제하지 않았다.

작성과 별도의 읽기 전용 그래프 확인에서도 삭제 파일의 남은 실행 코드 import가 없고 활성 `/preview`·`/demo` 및 공통 CSS가 유지됨을 확인했다. 과거 source-hash/이동/설명 기록에 남은 이전 파일명은 검증 이력이라 보존했다. 이 확인은 전체 제품 코드리뷰를 대신하지 않는다.

## 검증과 재현

- 새 요청까지 평가 102검사 통과. 전체 90파일/907검사(`--maxWorkers=4`), 타입·린트·서버21/구조25web·6domain·3layout·빌드52 통과.
- Chromium에서 실제 prototype 5화면/28장면 총33개가 예외 없이 렌더링됐다. [렌더 기록](prototype-render-checks.json), [1440px](files-1440.png), [390px](files-390.png)을 확인했다. Next 링크/탐색 shim을 사용하는 독립 표시 fixture이며 인증된 `/preview` 경로 전체·상태 전이·실제 디스크를 검증한 것은 아니다.
- 새 production build `mLQrut3l8CjHiCc7fX-fF`의 `/demo`, `/demo/files`, `/demo/settings` 3경로가 실제 브라우저에서 렌더링됐다. [demo smoke](demo-smoke.json). 모델 Action이나 실제 폴더 읽기는 실행하지 않았다.
- 정적/고립 시안에는 기능 테스트나 Lighthouse 반복 실행을 추가하지 않았다. 화면 확인용 fixture는 production 소스 밖 테스트 폴더에 둔다.

```powershell
$env:MOA_ORGANIZATION_REPORT='1'
pnpm exec vitest run apps/web/tests/sample-workspace/organization-evaluation.test.ts
Remove-Item Env:MOA_ORGANIZATION_REPORT
node tests/browser/check-prototype-cleanup.mjs
```

실모델은 기존 `MOA_RUN_ORGANIZATION_LIVE=1`, `MOA_ORGANIZATION_CASE=<development ID>`와 `tests/database/vitest.organization-live.config.mts`로 한 요청씩 실행한다. 44개를 한꺼번에 API로 호출하는 기본 테스트를 추가하지 않았다.

demo smoke용으로 새로 실행한 로컬 3035 서버는 확인 후 종료했다. 기존 3034 서버는 건드리지 않았다.

검토 순서: 평가 JSON → evaluation test/helper → 실제 live checks와 원자료 → 정리 계획/삭제 목록 → prototype render fixture. 새 업무 규칙·검색 알고리즘·샘플 동작은 바꾸지 않았다.

## 한계

실제 새 6요청 각1회와 과거 최종2요청은 전체44요청의 모델 검증이 아니다. 나머지 development32/holdout4의 실제 출력, 사용자 빈도/사람 정답 검토, 표현 변형·장문·일반 PDF/엑셀 파싱·공격 저항 전체는 미검증이다. holdout8문서는 모두 예산에 들어가므로 그 후보 회수율을 대규모 검색 성능으로 해석하지 않는다. 모델 요약의 완료 시제·표현 품질도 이번 판정 기준에는 포함하지 않았다. 삭제는 고립된 코드만 대상으로 했고 사용 중인 시안은 남겼다. 미커밋/미push/미외부배포다.
