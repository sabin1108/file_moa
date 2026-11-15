# 검색·RAG 비용과 경로 관측

2026-11-15 Windows·Chromium157·로컬 production 서버. CPU/네트워크 제한 없음. 로그인 없는11경로×390/1440px×3회=66표본, 새 target마다 같은 브라우저 HTTP cache를 공유한다. redirect와 console 오류를 기록했다. 로그인한 채팅·설정의 현장 INP나 사용자 p75 측정이 아니다.

## 자산과 경로

직전3d251c0의 JS/CSS47파일3,567,910bytes→현재47파일3,603,981bytes, **+36,071bytes(약35.2KiB)**. 전체 build 자산의 원본 합계이며 최초 방문 다운로드가 아니다. MiniSearch와 embedding 모델은 제품 자산에 포함하지 않았다. build ID·66개 원자료는 evidence.json의 routes에 보관한다.

| 요청 경로 | 최종 경로 | LCP 중앙값390/1440(ms) | CLS 최대390/1440 |
| --- | --- | ---: | ---: |
| /login | /login | 68 / 96 | 0 / 0 |
| /welcome | /welcome | 84 / 76 | 0 / 0 |
| /forgot-password | 동일 | 60 / 84 | 0.0781 / 0.0128 |
| /reset-password | 동일 | 80 / 100 | 0.0837 / 0.0186 |
| /verify-email | 동일 | 76 / 88 | 0.0837 / 0.0186 |
| /files | /start | 84 / 116 | 0 / 0 |
| /demo | /demo/intro | 116 / 128 | 0 / 0 |
| /demo/files | /demo/intro | 120 / 124 | 0 / 0 |
| /demo/settings | /demo/intro | 100 / 120 | 0 / 0 |
| /start | /start | 104 / 108 | 0 / 0 |
| / | /start | 104 / 112 | 0 / 0 |

각 경로·폭3개뿐인 lab 관측이다. 경로마다500ms settle 뒤 기록하므로 이후 지연 이동은 포함하지 않는다. 일부 인증 페이지의 layout shift는 실제 관측값으로 남겼다. 같은 조건의 변경 전 replay가 없어 속도 개선율·회귀 원인으로 단정하지 않는다. cache 공유 때문에 JS transfer 중앙값0인 항목을 JS 다운로드가 없다는 뜻으로 해석하지 않는다. console 오류는0이다.

## 로컬 작업 비용

실제 Worker/PDF.js/IDB의 합성700,013byte MD는 cold59.6ms, warm3회19.9/17.5/16.3ms였다. 매 hit에서 원본 읽기1회·source/발췌hash2회를 유지하고 warm decode0/PDF 추출0을 확인했다. 새 Worker와 메모리 File 조건이므로 실제 디스크/개인 폴더 지연이 아니다. catalog 저장과20,000행 상한 검사는 별도 경계 검사이며 전체 폴더 초기 색인 시간을 측정한 것으로 보지 않는다.

metadata 갱신은9파일 OPFS fixture에서 Worker 호출0이었다. partial 보존, 갱신/clear 순서, 다른 탭 해제 경계는 실제 Web Locks·IDB로 확인했다. 갱신은 파일별 관측 쓰기를 하며 본문을 읽을 때 상태를 다시 쓴다. 대규모 초기 스캔의 쓰기 비용과 장기 메모리 추세는 아직 측정하지 않았다.

MiniSearch 실험은 index생성1.4ms/index7,390bytes/ESM78,025bytes였다. heap차1,884,448bytes는 GC 비통제 관측이다. 같은 holdout의 품질 이득이 없어 추가 엔진을 배포하지 않았다.

Node CPU E5 실험은 다운로드135,138,424bytes·초기화4,476.8ms·RSS증가448,999,424bytes·21본문색인142.1ms·vector32,256bytes였다. 짧은 합성 자료의 Node 결과이며 브라우저 WASM/휴대폰 예산이 아니다. 조건을 지킨 hybrid 품질이 현재 lexical과 같아 제품에 넣지 않았다. 모델 크기만으로 모든 embedding 방식이 부적합하다고 일반화하지 않는다.

유료 합성 질문6회 누적 토큰 추정$0.0003125. 캡처한 후반3회 응답 지연과 토큰은 evidence.json의 liveQuery에 보관한다. 세 표본을 안정적p95나 로그인 사용자의 응답 시간으로 부르지 않는다. 추가 비용 없이 응답을 재생해 schema/원문 검증을 확인했다.

경로 측정은 `.omx/verification/local-rag-20261115/routes.mjs`, 검색/모델 비용은 동일 디렉터리 index-final/evaluation/live-query로 재현 근거를 남겼다. 설치된 프레임워크·lockfile은 바꾸지 않았다.
