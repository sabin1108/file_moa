# 정식 발췌 전송 경계 성능 관측

2026-11-08. 전후 같은 production 포트3035, guest 새 탭, shared HTTP cache, 무제한 로컬 네트워크. 9개 요청 경로 × 2폭 × 3회 = 전후54+54표본이다. /files는 /login, /demo 계열은 세션 없이 /demo/start로 이동한다. 인증된 정식 화면이나 실제 샘플 작업 화면의 성능이라고 주장하지 않는다.

사전 표본은 작업 시작 때 존재하던 `ezRMm0o4DVd0puRdXx7z3` 빌드를 실행했다. 이 세션에서 사전 소스를 새로 빌드한 것은 아니며 기존 미커밋 변경도 있으므로 모든 차이를 이번 기능 하나의 원인으로 확정하지 않는다.

정적 JS/CSS 1592204 → 1598940바이트(순증 6736바이트, 6.6KiB). 전체 배포 자산의 변화이며 경로별 다운로드 증가와 구분한다. 빌드 ezRMm0o4DVd0puRdXx7z3 → K0pIR9TcwuM-X5KNqcRgc. 첫 요청/캐시/동시 부하와 n=3 소표본의 변동이 있으므로 개선율이나 회귀 원인을 확정하지 않는다.

| 요청 경로 | 폭 | 실제 도착 | LCP 전/후 ms | 자원 전송 전/후 KiB | JS 전송 전/후 KiB | 요청 수 전/후 | 후 CLS 최대 |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| /login | 390 | /login | 92 / 60 | 3.6 / 3.6 | 0.0 / 0.0 | 18 / 18 | 0 |
| /login | 1440 | /login | 76 / 72 | 3.6 / 3.6 | 0.0 / 0.0 | 18 / 18 | 0 |
| /welcome | 390 | /welcome | 60 / 64 | 3.2 / 3.2 | 0.0 / 0.0 | 17 / 17 | 0 |
| /welcome | 1440 | /welcome | 76 / 76 | 3.2 / 3.2 | 0.0 / 0.0 | 17 / 17 | 0 |
| /forgot-password | 390 | /forgot-password | 48 / 52 | 1.5 / 1.5 | 0.0 / 0.0 | 14 / 14 | 0 |
| /forgot-password | 1440 | /forgot-password | 52 / 80 | 1.5 / 1.5 | 0.0 / 0.0 | 14 / 14 | 0 |
| /reset-password | 390 | /reset-password | 84 / 76 | 3.0 / 3.0 | 0.0 / 0.0 | 16 / 16 | 0 |
| /reset-password | 1440 | /reset-password | 100 / 84 | 3.0 / 3.0 | 0.0 / 0.0 | 16 / 16 | 0 |
| /verify-email | 390 | /verify-email | 64 / 76 | 3.5 / 3.5 | 0.0 / 0.0 | 17 / 17 | 0 |
| /verify-email | 1440 | /verify-email | 68 / 92 | 3.5 / 3.5 | 0.0 / 0.0 | 17 / 17 | 0 |
| /files | 390 | /login | 68 / 80 | 3.6 / 3.6 | 0.0 / 0.0 | 18 / 18 | 0 |
| /files | 1440 | /login | 56 / 88 | 3.6 / 3.6 | 0.0 / 0.0 | 18 / 18 | 0 |
| /demo | 390 | /demo | 72 / 112 | 4.6 / 4.6 | 0.0 / 0.0 | 20 / 20 | 0 |
| /demo | 1440 | /demo | 68 / 88 | 4.6 / 4.6 | 0.0 / 0.0 | 20 / 20 | 0 |
| /demo/files | 390 | /demo/files | 60 / 64 | 0.0 / 0.0 | 0.0 / 0.0 | 14 / 14 | 0 |
| /demo/files | 1440 | /demo/files | 72 / 72 | 3.1 / 3.1 | 0.0 / 0.0 | 18 / 18 | 0 |
| /demo/settings | 390 | /demo/settings | 40 / 44 | 4.6 / 4.6 | 0.0 / 0.0 | 16 / 16 | 0 |
| /demo/settings | 1440 | /demo/settings | 56 / 44 | 4.6 / 4.6 | 0.0 / 0.0 | 16 / 16 | 0 |

새 흐름 관측: [{"elapsedMs":102,"width":1440},{"operation":"recheck-and-mocked-action","elapsedMs":77.8445999999999},{"elapsedMs":383,"width":1440},{"elapsedMs":90,"width":1440},{"elapsedMs":93,"width":1440},{"elapsedMs":93,"width":1440}]. 준비 표본과 재검사+대체 Action 표본을 섞어 모델 응답 시간으로 보고하지 않는다. 본문/동의/결과를 Provider 메모리에만 두며 화면 이동 보존과 F5 초기화를 동작 검사했다. 장기 메모리 추세, 실제 DB 경합/한도, 인증된 전체 경로, field INP, 실제 디스크·대용량/물리 IME는 측정하지 않았다.

원자료 [전](before/performance-after.json), [후](after/performance-after.json), [집계](performance-summary.json), [브라우저 동작](browser-checks.json). 재현: pnpm exec node tests/performance/measure-sample-workspace.mjs http://127.0.0.1:3035 after <새 결과 경로>.
