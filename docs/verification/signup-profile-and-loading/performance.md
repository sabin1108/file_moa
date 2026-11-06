# 인증 후 작업 경로 성능 확인

조건과36개 원자료는 [JSON](browser/performance-authenticated.json)을 따른다. Windows 격리 Chromium/합성 계정/production build/로컬 PostgreSQL TLS/HTTP 캐시 끔/무제한 네트워크·CPU/폭별 경로당3회다. 직전 인증 기능 기록과 비교하며, 이름 흐름과 문서 바탕을 함께 바꿨으므로 순수 성능 최적화율로 해석하지 않는다. 실제 사용자 INP·운영 네트워크·실제 디스크는 측정하지 않았다.

| 폭px | 경로 | 이전 LCP 중앙값ms | 이번 LCP 중앙값ms | 이번 최대 CLS |
| --- | --- | ---: | ---: | ---: |
| 390 | / | 60 | 48 | 0 |
| 390 | /files | 52 | 52 | 0.032487871953149734 |
| 390 | /settings?tab=account | 56 | 56 | 0 |
| 390 | /settings?tab=folders | 60 | 52 | 0.034986426282051286 |
| 390 | /settings?tab=editor | 56 | 52 | 0 |
| 390 | /account | 48 | 48 | 0 |
| 1440 | / | 52 | 48 | 0 |
| 1440 | /files | 64 | 48 | 0.0015678583676268863 |
| 1440 | /settings?tab=account | 52 | 52 | 0 |
| 1440 | /settings?tab=folders | 56 | 52 | 0.019169339654867543 |
| 1440 | /settings?tab=editor | 56 | 48 | 0 |
| 1440 | /account | 48 | 40 | 0 |

이번36개 모두 요청 경로에 도착했고 차단 세션 확인 문구가 없었다. 신규 이름 설정은 별도 기능 검증 대상이며 이 표는 기존 인증 후 경로의 로딩 표본이다. 검은 바탕 수정은 LCP 점수 대신 canvas 재현/초기 computed style/실제 차단 로딩 검사로 판단했다.
