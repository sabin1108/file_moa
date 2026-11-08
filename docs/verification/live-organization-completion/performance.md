# 정리 질문·계획 연결과 빈 상태 높이 수정의 관측

2026-11-08. 사전 `K0pIR9TcwuM-X5KNqcRgc` → 최종 `A8UUyGVs7Odfss2_iK1gR`. localhost3035 production, guest 새 탭/shared HTTP cache/무제한 네트워크. 9경로×2폭×3회로 전후54+54표본. `/files`는 로그인 redirect이며 실제 로그인 파일 관리/샘플 전체 작업의 성능으로 일반화하지 않는다.

배포 정적 JS/CSS 합계 **1,598,940 → 1,641,015 bytes(+42,075, 약41.1KiB)**. 질문/참고/답변/실행 연결 전체의 변경량이며 CSS 높이 수정만의 비용이나 경로별 다운로드 증가가 아니다. 새 패키지는 없다. [전](before/performance-after.json), [후](after/performance-after.json), [집계](performance-summary.json).

| 요청 경로 | 390 LCP 전→후 ms | 1440 LCP 전→후 ms | 후 CLS 최대 |
| --- | ---: | ---: | ---: |
| /login | 60→84 | 80→72 | 0 |
| /welcome | 48→64 | 72→72 | 0 |
| /forgot-password | 44→64 | 52→72 | 0 |
| /reset-password | 68→76 | 108→92 | 0 |
| /verify-email | 108→92 | 104→92 | 0 |
| /files (실제 /login) | 76→76 | 80→80 | 0 |
| /demo | 80→136 | 72→96 | 0 |
| /demo/files | 72→80 | 76→76 | 0 |
| /demo/settings | 64→60 | 44→68 | 0 |

각3표본의 중앙값이다. shared cache로 JS 전송0도 관측된다. 첫 요청/캐시/동시 개발 서버 영향과 소표본 변동이 있어 개선율·단일 변경의 회귀 원인을 확정하지 않는다. 인증된 실제 파일 경로, field INP, 장기 메모리, 실디스크 대규모 자료는 미측정이다.

새 흐름은 [완성24](browser-checks.json)의 실제 OPFS/Worker·copy/move/보존/복구로 검증했다. 기존 준비 회귀4표본은 92/81/79/86ms이다. 실제 공급자 최초/답변 후 합성 요청은 각각 **5,807/6,293ms**(실DB 예약·countTokens·generation·검증 전체)였다. 인증 사용자 HTTP 전체 여정이나 스트리밍 TTFT가 아니다. 토큰/횟수는 [전체 보고](README.md)에 기록했다.

빈 상태 화면은 [25 geometry 검사](../folder-workspace-height/README.md)로 상태줄까지의 높이/가로 넘침을 확인했다. 점수나 물리 모니터 사용 편안함의 근거는 아니다. 재현: `node tests/performance/measure-sample-workspace.mjs http://127.0.0.1:3035 after <새 결과 폴더>`.
