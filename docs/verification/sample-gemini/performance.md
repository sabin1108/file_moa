# Gemini 샘플 연결 성능 — 2026-11-07

새 기능 비용과 기존 guest 흐름 회귀를 구분한다. 최종 빌드 `NsUv5uM2RMWWZsXvCJRuo`, 로컬 Windows/Next production/Chromium headless, CPU/네트워크 제한 없음. guest 6경로와 `/demo` 각390/1440px ×3회=42표본, 별도 `/demo` 캐시 비활성6표본이다. `/files`는 로그인으로 이동하며 실제 로그인 작업 성능이 아니다.

| 대상 | 기존 샘플 빌드 | Gemini 최종 빌드 |
| --- | ---: | ---: |
| 전체 정적 JS/CSS | 1,497,788 bytes | 1,502,359 bytes (+4,571) |
| cold `/demo` 390 LCP 중앙값 | 112ms | 80ms |
| cold `/demo` 1440 LCP 중앙값 | 108ms | 112ms |
| cold `/demo` CLS | 0 | 0 |
| cold `/demo` 자원 / JS 전송 | 약251.9 / 231.7KiB | 253.1 / 232.8KiB |

이전은 sample-workspace의 최종 빌드이며 이번에는 DB 네트워크가 허용된 서버를 사용해 인증200을 회복했다. 시간 경과/서버 실행 조건과 소표본 변동이 있으므로 속도 개선의 인과 증거로 해석하지 않는다. 코드/정적 자산 증가량과 초기 로딩 규모를 판단하기 위한 참고 비교다.

| 최종 guest 경로 | 390 LCP 중앙값 | 1440 LCP 중앙값 | CLS 최대 |
| --- | ---: | ---: | ---: |
| /login | 60ms | 56ms | 0 |
| /welcome | 68ms | 68ms | 0 |
| /forgot-password | 52ms | 52ms | 0 |
| /reset-password | 56ms | 72ms | 0 |
| /verify-email | 72ms | 80ms | 0 |
| /files→login | 60ms | 68ms | 0 |
| /demo | 72ms | 80ms | 0 |

위 표는 공유 HTTP 캐시 조건이므로 JS 전송0을 신규 자원비용0으로 해석하지 않는다. 별도 cold는 각표본 캐시를 비활성화하고 JS 전송이0보다 큼을 확인했다.

실제 AI는 첫 클릭→검토4283ms/610토큰, 최종3251ms/617토큰의 두 표본이다. 각각 provider countTokens와 생성, 서버 DB 예약, 클라이언트 갱신을 포함하며 API만의 시간이나 p95가 아니다. 새 기능을 사용하기 전 모델 요청은0이며 새로고침도 재호출0이다. 4096 사전입력·1600 출력·25초·원자 전역/세션 한도는 구현 상한이며 무료 계정의 실제 한도/비용 보장이 아니다.

재현: `node tests/performance/measure-sample-workspace.mjs http://127.0.0.1:3034 after docs/verification/sample-gemini`, phase=`cold` 별도 실행. [42표본](performance-after.json), [cold6표본](performance-cold.json), [실제 AI](live-result.json).

실사용 INP/field p75·실제 계정/파일 작업·서버 CPU/RSS/장시간 heap·부하 p95는 미측정이다. 이번 추가는 가상10개 자료의 짧은 요청이며 해당 지표의 개선을 주장하지 않는다.
