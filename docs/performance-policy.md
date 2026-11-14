# 사이트 전체 성능 측정 정책

최신 자료 질문 연결·검색 화면: [2026-11-14 비용과11경로66표본](verification/search-question-20261114/performance.md). 전체47JS/CSS 원본3,547,771→3,557,749bytes(+9,978). guest/redirect 경로의 실제 도착과 인증 검색을 구분하고 속도 개선율을 주장하지 않는다. 질문33·사용성136브라우저 검사와 범용 검색 후속 설계는 별도다.

최신 첫 사용·채팅 조작 보완: [2026-11-14 전후11경로132표본](verification/chat-usability-20261114/performance.md). 전체 JS/CSS 원본은3,527,234→3,540,157bytes이며 최초 전송과 구분한다. 소개로 바뀐 비로그인 진입과 신규 안내 비용을 포함하며 순수 최적화 개선율은 주장하지 않는다. [사용성 검증81개와 한계](verification/chat-usability-20261114/README.md)를 함께 본다.

최신 대화·기록함 UX 재구성: [검증과 비용](verification/workspace-ux-rebuild/README.md). 최종 빌드 전체49JS/CSS는3,617,630bytes로 직전 대비18,936bytes 증가했다. 새 도구/목록·설정/편집의 구성을 바꿨으며 실제 모델 속도 개선을 주장하지 않는다. production 게스트/샘플 경로와 임시DB 인증36표본, 긴 대화6표본을 field INP·실사용 UX와 구별한다.

최신 실제 녹화 진단: [원자료와 검증](verification/recording-latency/README.md). 수정 전 실제 요청은 준비4544ms·첫provider9973ms·첫공개10987ms/HTTP약12.1초였다. 실제 runtime/TLS의 SELECT1은warm약220ms,4왕복transaction약882ms. DB region은ap-southeast-2다. 예약 SQL5→1·중복session조회제거 뒤 실제유료전체시간은 재측정하지 않았다. 마지막 측정 빌드 대비 JS/CSS1,714,956→1,715,365bytes(+409)/44파일동일이며 중간 한도 문구 변경도 포함한다. 합성UI32·자료51/35·임시PG25계약+55통합과 운영계정/field INP/heap/부하를 구별한다. [이전 화면/응답 변경](verification/progressive-chat/README.md), [첫 표시 개선](verification/chat-smoothness/README.md)도 보존한다.

최신 검색·정리 요청 전환: [공통 판별과 취소 경계 검증](verification/request-routing/README.md). 실제 controller/합성 OPFS45개와 질문 답변 회귀35개를 구분한다. 전체 JS/CSS +2,897bytes. 실제 경로별 진입 지연·heap·INP는 미측정이며 속도 개선을 주장하지 않는다.

최신 로그인 복귀 후 대기 UI: [상위 loading 경계·실제 Next fixture 비교](verification/auth-transition/README.md). 합성1800ms guard의 상태 표시 선행29검사와 실제production guest/샘플12검사를 구분한다. JS/CSS1,701,044bytes 동일. 실제 네이버의 약3초·Vercel callback·전체 로그인 지연 감소는 미측정이다.

최신 메인 화면 응답 후 설정 준비: [초기 대기 분리와 검증 한계](verification/settings-background-preparation/README.md). Next `after`로 초기 캐시 준비를 응답 이후로 이동했다. JS/CSS 1,701,044 bytes 동일, 새 실제 계정 지연·운영 성능은 미측정이다. 아래 80개 표본은 변경 전 blocking 캐시 구현의 기록이다.

최신 설정 캐시 실제 사용자 비교: [이전 조회 방식 복원 vs 현재의 80개 화면 준비 표본](verification/settings-cache-timing/measurement-20261108-v2/report.md). 반복 설정 중앙값 1.541→0.675초, 56.2% 감소. 초기 작업 공간+첫 설정 합계는 6.852→6.927초로 거의 같음. 정확한 옛 빌드·운영 Vercel·사용자 집단의 성능으로 해석하지 않는다.

OpenAI 공급자 추가 당시: [정적 산출물 비교와 한계](verification/openai-provider/README.md). 전체 JS/CSS +657바이트. 모델 지연과 비용 차이는 미측정이다. 설정 지연은 위 후속 기록을 따른다.

최신 로컬 TXT·MD 찾기: [전후54+54 guest 관측](verification/document-find/performance.md). JS/CSS +27,789 bytes, 관측 CLS0. Worker/OPFS 검색과 production bootstrap은 별도 확인했고 실제 인증 검색/field INP/대용량 실디스크는 미측정이다.

최신 로컬 채팅 답변 연결: [전후54+54 guest 관측](verification/organization-reply/performance.md). 로딩 표본과 답변 정확도 검사를 구분하며 실제 인증 정리/field INP/실디스크/물리 IME로 확대하지 않는다.

최신 대화 안 정리·공통 비교: [전후54+54 guest 관측](verification/chat-first-live/performance.md). 정적 JS/CSS +10,930 bytes, 관측 CLS0. 실제 인증 정리·실디스크·field INP는 미측정이다.

최신 정리 질문·기존 실행 연결과 빈 상태 높이 수정: [2026-11-08 전후54+54 guest 및 실제 합성 공급자2회](verification/live-organization-completion/performance.md). 전체 정적 JS/CSS +42,075 bytes, 관측 CLS0. 인증된 Windows 전체 여정·field INP의 근거는 아니다.

최신 정식 전송 경계: [2026-11-08 전후54+54 guest/redirect와 대체 공급자 새 흐름](verification/live-ai-transfer/performance.md). 정적 JS/CSS +6,736 bytes(6.6KiB), CLS 관측0. 실제 인증 경로/모델 지연/field INP로 확대하지 않는다.

최신 카카오 일시 제외: [두 공급자 UI와 기존 인증 경로36표본](verification/kakao-disabled/README.md). 활성 등록과 역사적 계정/세션 보존을 나누어 검증했고 로컬 lab 표본은 실사용 성능으로 확대하지 않는다.

최신 가입 후 이름·문서 바탕: [기존 인증 경로36표본](verification/signup-profile-and-loading/performance.md). 검은 canvas 재현/초기 스타일 검사와 로딩 성능 표본을 구분하며 실제 사용자 GPU·INP 측정으로 확대하지 않는다.

최신 인증/설정 후속: [인증된6경로×2폭×3회와 운영 실행 지역](verification/auth-social-settings/performance.md). 창 복귀의 blocking UI를 제거한 상호작용 검증, 로컬 초기 paint, 운영 공개 세션 조회를 구분한다.

최신 단일 보관함 연결·A4 지면·우측 하단 알림: [2026-11-04 같은 source36표본](verification/document-a4-vault-actions/performance.md). 연결된 지면의 위치/비율 검증과 초기 로딩 측정을 분리했다.

최신 보관함·문서·공통 계획 일관성: [2026-11-04 전체36표본과 files 추가3표본](verification/workspace-consistency/performance.md). 같은 source의 원자료·첫 files 지연 이상치·미확정 원인을 보존하고 표시 통합의 비용을 구분했다.

최신 편집·공통 목적지·단계/F5 수정: [2026-11-04 전체36표본과 신규 기능 비용](verification/workflow-ux/performance.md). 코드 설명서/README 문서 변경에 따른 전체 src hash 차이와 동일 실행 소스를 구분했다.

최신 파일 관리1~6: [실제 이동·폴더 copy/move·휴지통·편집·현재 상태 대조](verification/file-management-six/performance.md). 테스트 보류를 해제하고 최종 production 빌드에서 전체 경로를 재측정한다.

최신 새 파일 복원/보관함 현재 상태: [2026-11-04 전체6경로×2폭×3회·16MiB 복원](verification/recovery-restore/performance.md). 기존 조회 빌드와 기능 비용을 비교하고 실제 디스크/실사용 지표와 구분한다.

최신 보관함 조회·권한 안내: [2026-11-04 최종36표본·안내 삽입 CLS 수정·명시적 상세 확인](verification/recovery-archive/performance.md). 초기 회귀 측정을 보존하고 신규 기능 비용과 수정 효과를 구별한다.

최신 실제 덮어쓰기: [2026-11-04 전체6경로×2폭×3회·16MiB 분할 쓰기](verification/recovery-overwrite/performance.md). 연결 흐름 빌드를 기준선으로 보존하고 새 기능 비용/실사용 미측정을 구별한다.

최신 상위 이동·선택·팝업 안정성: [2026-11-03 전후6경로/프레임 근거](verification/folder-interaction-stability/performance.md). 전체 로딩과 상호작용 안정화를 별도 판단하며 이전 빌드/수정 중 source hash 차이를 기록했다.

최신 경로 중복·전환·길게 누르기·상위 이동: [2026-11-02 탐색 후속 측정](verification/folder-navigation-ux/performance.md). 직전 파일 작업 단계 UI 측정을 기준선으로 사용한다.

최신 파일 작업 단계·목적지 통합 UX: [2026-11-02 전체6경로×2폭×3회](verification/file-actions-ux/performance.md). 직전 복사 완료 빌드를 기준선으로 보존하고 추가 UI 비용과 신규 상호작용 표본을 구별한다.

최신 실제 복사·기록·현재 내용 대조: [2026-11-02 마감 보고](verification/copy-execution/performance.md). 10월31일 기준선, 11월1일 구현 직후와 11월2일 최종 표시 수정 후 측정을 구별한다.

최신 미확인 작업의 현재 대상 확인: [2026-10-31 전체 6경로×2폭×3회 및 신규 확인 비용](verification/history-target-inspection/performance.md). 직전 기록 조회의 최종 원자료를 기준선으로 보존했다.

최신 작업 기록 조회: [2026-10-31 전체 6경로×2폭×3회 비교](verification/folder-history/performance.md). 기존 생성/연결 기능의 이전 원자료를 보존하며 실제 파일 존재 재확인 성능을 뜻하지 않는다.

최신 현재 위치의 폴더·TXT·MD 생성: [2026-10-30 전체 6경로×2폭×3회 비교](verification/current-folder-creation/performance.md). 직전 폴더 시안 측정을 기준선으로 보존한다.

최신 폴더 시안·생성 기능 측정: [2026-10-30 최종 화면 6경로×2폭×3회 비교](verification/folder-workspace/performance.md). 직전 [복사 전 검사](verification/copy-inspection/performance.md)의 기준선을 보존한다.

최신 목적지/새로고침 UX 측정: [2026-10-30 경로별 전후와 갱신 좌표](verification/folder-controls-ux/performance.md).

최신 파일 화면/방문 기록 변경 측정: [2026-10-29 파일 우선 화면](verification/file-browser-navigation/performance.md).

최신 실제 기능 측정: [2026-10-29 이름 검색 전후](verification/file-name-search/performance.md). 아래 초기 단계 표는 당시 기준이며 현재 연결·탐색·미리보기·선택·계획·검색의 실행 결과는 기능별 검증 문서를 따른다.

사용자 요구 반영: 2026-10-24. 성능은 채팅 응답뿐 아니라 사이트 전체의 로딩, 상호작용, 리소스, 메모리, 네트워크와 서버 비용을 포함한다.

## 측정 시점

최신 정식 TXT/MD 로컬 준비: [2026-11-07 범위·발췌·동의 준비](verification/live-local-preparation/performance.md). 전후 guest/샘플9경로54+54표본과 새 합성 OPFS 준비4표본을 구분한다. 인증된 실제 정식 경로·실디스크·실사용 INP 측정은 아니다.

- 정적 디자인 프로토타입: 성능/기능 테스트 대상에서 제외한다. 타입·린트·빌드와 화면 확인만 한다. 기존 Lighthouse 보고서는 과거 정적 시안의 기록이며 현재 제품 성능이 아니다.
- 첫 실제 기능: 구현과 함께 명세·작은 정답셋을 마련하고 동작 가능한 시점에 최초 성능 기준선을 기록한다. 모든 기능이 완성될 때까지 미루지 않는다.
- 기능 추가/공통 코드 변경: 영향을 받는 기존 흐름을 같은 조건으로 재측정하고 새 흐름은 별도 기준선을 만든다.
- 배포 후보: 대표 경로 전체와 결합 흐름을 확인한다. 서버가 생긴 뒤 예상 동시 사용자 부하를 검증한다.
- 운영: 동의·비식별 기준 안에서 실제 사용자 지표를 장치/경로별로 집계한다. 실험실 결과와 분리한다.

## 비교를 유지하는 방법
기능 추가 전 기준선은 폐기하지 않는다. 아래 세 비교를 구분한다.
1. 회귀 비교: 같은 사용자 작업·데이터·장치·네트워크·권한·캐시 조건에서 기존 화면이 느려졌는지 확인.
2. 신규 기능 비용: 새 경로의 로딩/실행 비용을 새 기준선으로 기록. 전체 배포 자산 증가와 기존 경로의 초기 다운로드 증가는 별개.
3. 최적화 비교: 동일 기능 집합과 데이터로 개선 전후 비교. 기능 추가와 최적화를 한 번에 비교했다면 순수 개선율로 보고하지 않음.

예: 로그인 추가 후 기존 채팅 비교는 양쪽 모두 동일한 인증 조건의 대화 화면에서 한다. 로그인부터 채팅까지의 전체 여정은 별도 신규 시나리오다. 시각화 페이지가 추가되어도 해당 코드를 기존 화면에서 불필요하게 로드하지 않으면 기존 화면 비용이 반드시 늘어나는 것은 아니다.

## 사이트 전체 수치표
전체 사이트를 Lighthouse 점수 하나나 페이지 점수 단순 평균으로 대표하지 않는다. 아래 경로 표와 공통 자원/대표 여정 표를 함께 유지한다. 미구현·미측정은 0 대신 —로 표시한다.

| 화면/흐름 | 단계 | LCP ms | CLS | TBT ms (lab) | INP ms (field p75) | 초기 전송 KiB | JS 전송 KiB | 요청 수 | 보고서 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 채팅 / | 정적 시안, 제품 미측정 | — | — | — | — | — | — | — | 기존 시안: audits/ |
| 파일 /files | 정적 시안, 제품 미측정 | — | — | — | — | — | — | — | 기존 시안: audits/ |
| 로그인 | 미구현 | — | — | — | — | — | — | — | — |
| 폴더 시각화 | 미구현 | — | — | — | — | — | — | — | — |
| AI 성장 시각화 | 미구현 | — | — | — | — | — | — | — | — |

| 사이트 공통 지표 | 단위/집계 | 비교할 조건 |
| --- | --- | --- |
| 공통 JS/CSS와 전체 배포 자산 | KiB, 공유 chunk 중복 제외 | build revision, 원본/압축 방식 구분 |
| 최초 방문과 경로 전환 전송량 | KiB, 요청 수 | 캐시 cold/warm 별도, 실제 여정 단위 |
| 주요 화면 전환/작업 완료 시간 | ms, 충분한 표본의 p50/p95 및 n | 동일 시나리오·데이터 크기 |
| 브라우저 메모리 | MiB, 진입/반복 작업 후 추세 | 동일 브라우저, 측정 방식, GC 조건; JS heap과 총 메모리 구분 |
| 주 스레드 정지 | long task 수·최대 ms, trace | 동일 입력/선택/스크롤 흐름 |
| API 응답 | ms p50/p95, 오류율 %, 요청 수 | 경로·동시성·DB·캐시, 모델 호출 분리 |
| 서버 자원 | CPU %, RSS MiB, 처리량 req/s | 서버 사양·부하 모델·측정 시간 |
| 측정 범위 | 구현 경로 중 측정 경로 수, 미측정 목록 | 전체 사이트라고 부를 수 있는 범위 명시 |

대량 화면은 파일 100/1,000개와 깊은 폴더, 긴 대화 등 데이터 규모별로 분리한다. 파일 수는 테스트 케이스 수와 다르다. 현재 임시 500문서 한도를 넘는 1,000개 fixture는 탐색/표시 부하와 상한 거부 확인용이며 1,000개 색인을 허용한다는 뜻이 아니다. 채팅 TTFT/스트림 끊김은 별도 작업 지표이며 사이트 전체 성능을 대체하지 않는다.
실사용 사이트 전체 p75를 낼 때는 실제 방문 분포의 원자료로 집계한다. 페이지별 p75의 평균을 사이트 p75라고 부르지 않는다. 전체 수치와 장치/경로별 수치를 함께 본다.

## 측정 규약
production build, revision/날짜, 장치/OS/Chrome·도구 버전, 화면 크기, CPU/네트워크 제한, 서버 위치, 데이터셋 버전·seed, 사용자 권한, 캐시 상태, API/mock/model 조건을 기록한다.
초기 lab 기준은 같은 조건 3–5회 원자료와 중앙값·범위를 남긴다. 적은 표본의 p95를 안정적 지표처럼 해석하지 않는다. 부하/field의 분위수는 표본 수와 기간을 함께 기록한다.
Lighthouse의 TBT는 INP 측정값이 아니다. Performance API로 계산한 유사 TBT는 공식 Lighthouse TBT와 구분한다.
목표/예산과 실측은 다른 열에 적는다. 변경 허용 예산은 첫 기능의 반복 측정 변동폭과 사용자 요구를 보고 정하며, 보편적인 회귀 허용 %를 임의 적용하지 않는다.
반복 스크롤/화면 전환 후 메모리 추세와 이벤트 해제 여부는 기능 단계에서 점검한다. 화면별 비용과 공통 번들 회귀를 먼저 추적하고 근거 없이 memo/useCallback을 일괄 추가하지 않는다.

## 포트폴리오에서 채택한 기록 방식
참고: 사용자 제공 해준이 포폴.pdf, 6쪽(초기 로딩 병목과 개선), 10쪽(배포 빌드 성능/테스트).
원본: %USERPROFILE%/Desktop/임시 c드라이브 파일/포트폴리오/학습용/해준이 포폴.pdf.
채택할 것은 문제 → 조건 → 병목 증거 → 변경 → 동일 조건 전후 수치 → 한계의 연결이다.
PDF의 번들/이미지 크기와 경로별 로딩 지표 기록 방식을 참고한다. 해당 프로젝트의 점수·개선율을 이 프로젝트 목표나 실측으로 복사하지 않는다. PDF 보고 수치는 여기서 재현한 결과가 아니며 원시 로그는 확인하지 못했다.

## 근거와 기록
- 사용자 관점 lab/field 지표: https://web.dev/articles/user-centric-performance-metrics
- Lighthouse 점수와 변동: https://developer.chrome.com/docs/lighthouse/performance/performance-scoring
- 서버 부하 단계 참고: https://grafana.com/docs/k6/latest/testing-guides/test-types/
- 전후 기록 양식: performance-record-template.md
- 테스트 자료·규모: testing-strategy.md
# 2026-11-08 설정 표시 데이터 캐시

[검증](verification/settings-display-cache/README.md): 실제 Next Data Cache와 기본 메모리 backend에 합성 인증·DB를 연결해 초기 준비와 다음 요청의 표시 getter 재사용을 확인했다. 실제 PostgreSQL SQL 수, 사용자 로그인 상태의 설정 대기 시간·서버 비용은 미측정이다. production 산출물 전후 JS/CSS는 1,700,147 bytes/42파일로 동일하다. 전체 1,059개와 production guest/샘플 브라우저 10개 검사를 사용자별 실제 성능 측정으로 확대하지 않는다. 초기 준비를 기다리는 비용과 다음 방문의 cache hit 이점을 함께 비교하며, 개발 컴파일 시간은 운영 지연과 분리한다.

## 2026-11-08 검색·작업 흐름 마감

[원자료](verification/completion-five/performance/routes-assets.json): production 6경로 각3회 lab 측정, 보호 경로는 guest redirect다. JS/CSS 총합 1,703,941 → 1,718,378 bytes, 43파일 유지, +14,437 bytes. 경로별 초기 전송량이나 이전 대비 속도 향상률로 해석하지 않는다. 검색/정리/파일 동작은 합성 OPFS이며 실제 Windows 체감·field INP·인증 경로 비용은 별도다. 로컬 단계 URL에는 기존 SettingsTabs와 같은 Next native History 통합을 사용하고, 진행 상태마다 서버 route 전환을 만들지 않는다. [검증/한계](verification/completion-five/README.md).

## 2026-11-09 후속 검증

단일 대화 통합의 최신 자료는 [통합 검증](verification/unified-conversation/README.md)이다. 실제 production 6경로 각3회·guest/history, 전체 JS/CSS49파일 3,564,851bytes와 직전 대비+7,398bytes를 기록했다. 100/500개 로컬 대화의 표시와390px 공통 입력/대화 공간도 별도로 확인했으며 인증 경로/실모델/field 성능으로 확대하지 않는다.

[원자료와 한계](verification/follow-through/README.md): production 6경로 각3회는 guest redirect/공개 샘플이며 인증 후 INP가 아니다. 실제 런타임 SELECT-only 왕복과 두 독립 트랜잭션의 병행을 진단했고 실모델 체감 개선으로 환산하지 않았다. 100/500개 저장 대화는 이미 읽어 둔 상태에서 세 번씩 화면 복원을 측정했다. 전체 JS/CSS 합계와 초기 채팅 전송량, lab 두 frame 대기와 field INP를 구분한다.

## 2026-11-09 — 1~5 후속 측정

현재 자료 답변과 저장 답변은 동일한 근거 목록·검증된 원문 미리보기를 사용한다. 390px에서230자 파일명/200자 공백 없는 인용문 넘침을 재현해 공통 목록에서 수정했다. 검증과 조건은 docs/verification/first-five/README.md를 따른다.

최종100/500회 대화 복원3회는79.9/37.7/36.1ms와198.1/138.8/132.5ms(이미 읽힌 기록의 두 frame까지, Vite Chromium lab). JS heap 시작19.8/마지막19.9/6표본최대46.6MiB, GC 비통제·장기누수증명아님. DOM은현재turn에맞고과거열기가누적되지않음. production6개 경로 각3회/history9통과, JS/CSS49파일3,568,324bytes로 직전 대비3,473bytes 증가했다. 보호 경로는 게스트 리다이렉트이며 인증된 화면의 성능이나 초기 다운로드 측정이 아니다.

실제 OpenAI 합성 질문1회+격리DB 직접handler: 첫 본문3074ms/완료3184ms/두 본문 묶음 간109ms, 최종138토큰과원장일치. 운영DB SELECT1 warm224ms/읽기전용transaction894~898ms는 별도진단이다. 사용자12초 사례와 동일 조건 전후 비교가 아니며, 실사용 계정/원격DB/브라우저를 합친 개선율·현장INP/p75·사이트전체점수는 산출하지 않았다. 실제Windows/물리IME도미검증이다.

## 2026-11-09 — 제공 로딩·인증 애니메이션 교체

사용자 제공 회오리3600ms/접기3000ms/꺼내기1100ms의 키프레임을 유지하고 사이트 토큰에 맞췄다. 추가 최소 대기나 가짜 진행률은 없으며 서버 지연 감소를 주장하지 않는다. docs/verification/animation-replacement/README.md.

production 게스트 보호경로3개와 demo3개 각각3회/history9, 실제 demo 이동 대기를 포함한 설정/로딩26검사 통과. 최종 빌드 QtvGPEbLNkupxaVlguVdw, 전체 JS/CSS49파일3,598,694bytes, 직전 대비30,370bytes 증가. 초기 다운로드·인증된 화면 속도·GPU·현장INP/메모리 지표가 아니다. 390/768/1440/1920px에서 실제 입력 크기·읽기와 장식 무대 축소를 분리해 확인했다. 장식 CSS 모션의 프레임 궤적은 원본과 대조했고 reduced motion은 정적으로 표시한다.

별도 인증169검사의 빌드hm3T_vcz95qFMvz7l_Jje에서 합성 계정·임시 로컬DB/TLS·빈OPFS·캐시끔·2폭/각3회·350ms관측의36표본을 남겼다. CLS 최대0.04273. 모든 경로/작업 공간을 확인했으나 동일조건 변경전값이없어개선율없음,운영/현장성능아님. 이후글자가독성CSS보완은최종브라우저30/빌드/게스트경로에서재확인했다.
