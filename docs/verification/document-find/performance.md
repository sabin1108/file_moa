# 로컬 자료 찾기의 성능 관측

2026-11-08. production a99THEDyzCzprOFx2JapB → lpCxf_CNfziJk7VhXxTME. localhost3035, 비로그인9경로×390/1440px×3회, 전후54+54표본이다. 새 탭/shared HTTP cache, CPU·네트워크 제한 없음, 기존 개발 서버와 같은 Windows 장치다. /files는 /login으로 이동하므로 실제 인증 검색이나 정리의 속도가 아니다. 일부 검사와 같은 장치 자원을 공유했다.

정적 JS/CSS 합계 1,672,358 → 1,700,147 bytes, 차이 +27,789 bytes다. 검색 UI/상태/Worker 전체의 배포 자산 비용이며 단일 경로 다운로드 증가가 아니다. 새 의존성은 없다. [전](before/performance-after.json), [후](after/performance-after.json), [집계](performance-summary.json).

| 요청 경로 | 390 LCP 전→후 ms | 1440 LCP 전→후 ms | 후 CLS 최대 |
| --- | ---: | ---: | ---: |
| /login | 116→108 | 72→68 | 0 |
| /welcome | 68→124 | 72→72 | 0 |
| /forgot-password | 48→72 | 72→76 | 0 |
| /reset-password | 84→76 | 80→88 | 0 |
| /verify-email | 80→108 | 104→88 | 0 |
| /files | 76→76 | 84→64 | 0 |
| /demo | 68→76 | 108→88 | 0 |
| /demo/files | 84→60 | 80→76 | 0 |
| /demo/settings | 64→56 | 60→68 | 0 |

각3회 중앙값이다. 캐시/로컬 부하/소표본 영향이 있어 개선율이나 특정 변경의 회귀 원인을 확정하지 않는다. 인증 검색, 대규모 실디스크, field INP, 장기 메모리, 물리 IME는 미측정이다. 기존 준비 OPFS/Worker 회귀4회는84/87/47/48ms였다. 새 검색의 실제 Worker/OPFS 기능은 [31검사](browser/browser-checks.json), production bootstrap은 [별도 결과](production-worker.json)로 확인했다. 이번에 실제 모델 생성은 호출하지 않았다.

재현: node tests/performance/measure-sample-workspace.mjs http://127.0.0.1:3035 after <새 결과 폴더>.
