# 필드 결합 검색의 비용과 경로 관측

2026-11-14. 기능 `ba3810b`. 전체47JS/CSS 원본 합계3,557,749→3,562,977bytes(+5,228). 새 모델·라이브러리·서버 API는 없다. metadata 이름 비교와 상위500 유지가 추가됐고 본문 추출/hash/최종 읽기 확인은 기존 Worker를 사용한다.

합성13파일의 실제 Worker/OPFS/IndexedDB 검색에서 cold140.5ms, warm107.3ms 각1회가 관측됐다. 이는 시작 예시이며 통계적 개선율이나 실디스크 지연, 캐시 효율의 일반 수치가 아니다. [동작과 품질 범위](README.md)를 함께 본다.

기존 `measure-sample-workspace.mjs`로 guest11경로×390/1440px×3회66표본을 관측했다. 새 target, 같은 browser HTTP cache, throttling 없음이다. 중앙값은6개 정렬 후 위쪽 중앙값이며 이전 동일 경로 표본을 다시 만들지 않아 전후 개선율을 계산하지 않는다.

| 요청 경로 | 실제 도착 | 표본 | LCP 중앙 ms | LCP 최대 ms | CLS 최대 |
| --- | --- | ---: | ---: | ---: | ---: |
| /login | /login |6|76|308|0|
| /welcome | /welcome |6|56|64|0|
| /forgot-password | /forgot-password |6|64|120|0.063245|
| /reset-password | /reset-password |6|76|84|0.067795|
| /verify-email | /verify-email |6|68|80|0.067795|
| /files | /start |6|112|124|0|
| /demo | /demo/intro |6|132|140|0|
| /demo/files | /demo/intro |6|124|152|0|
| /demo/settings | /demo/intro |6|124|148|0|
| /start | /start |6|116|116|0|
| / | /start |6|116|132|0|

보호/체험 경로의 redirect 뒤 화면이며 인증된 검색/설정 성능을 뜻하지 않는다. 인증 페이지에서 관측한 CLS를 이번 검색 변경의 결과라고 단정하지 않는다. 원자료 `.omx/verification/search-fields-20261114/routes-after/performance-after.json`에 buildId/경로/폭/반복/요청·전송 bytes가 있다.

field 결합은 원래 읽던 본문에 이름과 경로를 추가한 기능이다. hash/본문 읽기를 생략하는 최적화는 구현하지 않았다. 이름이 맞는 많은 파일에서는 metadata `getFile()` 호출이 늘 수 있으며 기존 탐색 한도 내에서 처리한다. 지속 metadata catalog와 실제 cache 비용 측정은 다음 단계다. 대규모 실디스크, CPU/heap, field INP, 실제 모바일과 유료 모델은 미측정이다.
