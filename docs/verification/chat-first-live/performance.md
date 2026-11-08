# 정리 화면 변경의 성능 관측

2026-11-08. production 9ekZvaPo7bZS0QrYDy-a4 → CydLoWSShzQgTYL4jWE3b. localhost3035, 비로그인9경로×390/1440px×3회, 전후54+54표본이다. 새 탭/shared HTTP cache, CPU·네트워크 제한 없음, 기존 개발 서버와 같은 Windows 장치다. /files는 /login으로 이동하므로 실제 인증 정리 작업의 속도가 아니다.

정적 JS/CSS 합계 1,656,861 → 1,667,791 bytes, 차이 +10,930 bytes다. 해당 단위의 표시·상태·로컬 처리 전체의 배포 자산 비용이며 단일 화면 다운로드 증가가 아니다. 새 의존성은 없다. [전](before/performance-after.json), [후](after/performance-after.json), [집계](performance-summary.json).

| 요청 경로 | 390 LCP 전→후 ms | 1440 LCP 전→후 ms | 후 CLS 최대 |
| --- | ---: | ---: | ---: |
| /login | 116→100 | 68→92 | 0 |
| /welcome | 120→80 | 88→84 | 0 |
| /forgot-password | 76→72 | 80→84 | 0 |
| /reset-password | 104→112 | 108→124 | 0 |
| /verify-email | 108→84 | 104→104 | 0 |
| /files | 88→92 | 88→88 | 0 |
| /demo | 68→88 | 68→80 | 0 |
| /demo/files | 92→88 | 84→140 | 0 |
| /demo/settings | 76→72 | 72→72 | 0 |

각3회 중앙값이다. 캐시/로컬 부하/소표본 영향이 있어 개선율이나 특정 변경의 속도 저하를 확정하지 않는다. 인증 정리, 실디스크, field INP, 장기 메모리, 물리 IME는 미측정이다. 기능 검증과 준비 상호작용은 [전체 보고](README.md)를 따른다. 실제 모델 생성 시간이나 답변 해석의 의미 정확도를 로딩 수치로 설명하지 않는다.

재현: node tests/performance/measure-sample-workspace.mjs http://127.0.0.1:3035 after <새 결과 폴더>.
