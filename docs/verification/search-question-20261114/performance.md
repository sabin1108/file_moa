# 비용과 경로 관측

2026-11-14 기능 커밋 `024a209`. 로컬 production 최종 빌드의 전체47JS/CSS 원본 합계는3,547,771→3,557,749bytes(+9,978)다. 최초 전송/압축 전송과 다르며 새 모델·의존성·서버 API·검색 index는 추가하지 않았다.

`tests/performance/measure-sample-workspace.mjs`로11경로×390/1440px×3회,66개 표본을 관측했다. 인증하지 않은 새 browser target, 같은 브라우저 HTTP cache, throttling 없음이다. 보호 경로와 체험 경로는 아래 실제 도착 경로를 측정한 것이며 인증된 파일/채팅/설정 성능으로 해석하지 않는다. 첫 login 최대1,604ms와 이후 warm 표본을 같은 표에 남겼다.

| 요청 경로 | 실제 도착 | 표본 | LCP 중앙 ms | LCP 최대 ms | CLS 최대 |
| --- | --- | ---: | ---: | ---: | ---: |
| /login | /login |6|68|1604|0|
| /welcome | /welcome |6|88|100|0|
| /forgot-password | /forgot-password |6|76|132|0.063245|
| /reset-password | /reset-password |6|76|84|0.067795|
| /verify-email | /verify-email |6|84|96|0.067795|
| /files | /start |6|116|132|0|
| /demo | /demo/intro |6|132|180|0|
| /demo/files | /demo/intro |6|116|128|0|
| /demo/settings | /demo/intro |6|128|144|0|
| /start | /start |6|108|132|0.009487|
| / | /start |6|128|144|0|

중앙은6개를 정렬한 위쪽 중앙값이다. 원자료는 `.omx/verification/search-question-20261114/routes-after/performance-after.json`이며 buildId, 경로/폭/반복, 요청/전송 bytes를 포함한다. 이번에는 동일 이전 빌드의 경로 표본을 다시 만들지 않았으므로 속도 개선율을 주장하지 않는다. 인증 페이지에서 관측한 CLS가 이번 검색 변경 때문에 생겼다고 단정하지 않는다.

합성 OPFS/Worker의 자료 질문33개와 사용성136개 검사는 [동작 검증](README.md)에 기록했다. 원본 파일을 읽는 작업은 기존 상한과 hash 재검사를 사용하며 질문별 재읽기 비용이 존재한다. 전체 폴더 업로드나 숨은 background 색인은 없다. 실제 대규모 파일 검색 시간, heap/CPU, field INP, 실제 모바일, 물리 IME, 유료 모델 지연은 미측정이다. 새 범용 검색 도구의 정확도와 속도는 [후속 평가 계획](../../planning/local-search-improvement.md)이며 현재 수치로 대체하지 않는다.
