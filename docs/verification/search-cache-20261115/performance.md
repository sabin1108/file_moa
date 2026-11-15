# 검색 캐시 처리 비용 — 2026-11-15

기준 소스는 `184b090`이다. 기능 수정 전에 저장한 before/cost.json을 유지하고 같은 합성 파일의 after/cost.json과 비교했다. 새 Worker를 표본마다 만들고, 같은 IndexedDB의 본문 캐시만 warm으로 만든다. 파일마다 cold1회/warm3회이며 아래는 warm3회 중앙값이다. MD는700,013바이트, 텍스트 PDF는596바이트다.

| 비용 | MD 이전 | MD 이후 | PDF 이전 | PDF 이후 |
| --- | ---: | ---: | ---: | ---: |
| IDB 조회 ms | 1.1 | 1.1 | 0.3 | 0.2 |
| Worker 왕복 ms | 15.1 | 14.4 | 245.9 | 11.8 |
| 바이트 읽기 ms | 0.9 | 0.7 | 0.3 | 0.2 |
| source+발췌 hash ms | 0.6 | 0.6 | 0.2 | <0.1 |
| 디코딩 ms/횟수 | 0.4 / 1 | 0 / 0 | 0 / 0 | 0 / 0 |
| PDF 추출 ms/횟수 | 0 / 0 | 0 / 0 | 232.1 / 1 | 0 / 0 |
| IDB 쓰기 ms | 2.1 | 2.1 | 1.6 | 0.8 |
| 전체 ms | 18.3 | 17.6 | 247.6 | 12.7 |

세부 항목의 중앙값 합계가 전체 중앙값과 반드시 같지는 않다. hash가0으로 기록된 표본은 브라우저 타이머 해상도보다 짧은 관측이며 연산 생략을 뜻하지 않는다. 모든 표본에서 원본 읽기1회와 digest2회를 확인했다. 원본 바이트 읽기는 줄지 않았다.

이 측정은 비교를 위해 hit에서도 `put()`을 호출한다. 실제 snapshot은 hit 본문 쓰기를 건너뛴다. 그 생략은 별도 snapshot 회귀로 검증했고 위 수치에 추가 개선율로 합산하지 않았다. Worker 왕복에는 Worker 시작·메시지 복사·발췌·검색 규칙 등이 포함되므로 추출 시간과 더하지 않는다. cold PDF는 이전1,337.1ms/이후310ms 안팎이지만 모듈·HTTP cache 준비 상태가 달라 cold 개선율로 보고하지 않는다.

이 작은 표본에서 확인한 핵심은 warm PDF 추출 자체가 없어졌다는 것이다. MD는 원래 디코딩 비용이 작아 눈에 띄는 속도 개선을 주장하지 않는다. 실제 디스크·대용량 폴더·OCR 모델 실행·field INP·p95의 근거는 아니다. 합성 File·실제 Chromium157 Worker/PDF.js/IDB이며 Worker 계측은 검사 서버에서만 삽입한다. 제품에 본문 로그나 원격 telemetry를 추가하지 않았다.

## 사이트 전체 비용과 경로

production 전체47JS/CSS 원본 합계는3,562,977→3,567,910바이트(+4,933)다. 전체 산출물 합계이며 경로별 최초 압축 다운로드와 다르다.

최종 production build `mnvcMNxCGzpPfD5ZzuUz3`에서11경로×390/1440px×3회=66표본을 수집했다. 새 target을 쓰고 HTTP cache를 공유한다. 아래 LCP는 각3회 중앙값이며 무제한 네트워크의 로컬 guest 관측이다.

| 요청 경로 | 실제 도착 | LCP390 ms | LCP1440 ms | 최대 CLS |
| --- | --- | ---: | ---: | ---: |
| /login | /login | 336 | 68 | 0 |
| /welcome | /welcome | 64 | 64 | 0 |
| /forgot-password | 동일 | 52 | 84 | 0.0781 |
| /reset-password | 동일 | 68 | 84 | 0.0837 |
| /verify-email | 동일 | 56 | 84 | 0.0837 |
| /files | /start | 120 | 120 | 0 |
| /demo | /demo/intro | 132 | 136 | 0 |
| /demo/files | /demo/intro | 112 | 136 | 0 |
| /demo/settings | /demo/intro | 104 | 116 | 0 |
| /start | /start | 100 | 116 | 0 |
| / | /start | 116 | 116 | 0 |

66표본의 브라우저 오류는0개다. 일부 인증 경로의 CLS를 숨기거나 이 캐시 변경의 원인으로 단정하지 않는다. 이전 소스의 경로 표본을 같은 조건으로 다시 만들지 않아 경로별 개선율/회귀율은 없다. guest redirect를 인증된 검색·설정 성능으로 보고하지 않는다. 개인 폴더 디스크 비용, heap/CPU 전체, 실제 INP와 운영 모델 지연은 미측정이다.

재현 명령과 안전 경계는 [검증 보고서](README.md)를 따른다. 원자료: `.omx/verification/search-cache-20261115/{before/cost.json,after/cost.json,routes-after.json,routes.mjs}`. 소스 버전과 이 조건을 함께 보관한다.
