# 성능·상호작용 측정 — 2026-11-03

Windows, Chrome156.0.8078.80, production localhost3011, 캐시 비활성, CPU/네트워크 제한 없음. 경로당3회이며 LCP/CLS는 PerformanceObserver 값이다. field INP/TBT/API 비용은 미측정이다.1440/390px 측정기는 서로 병렬이며 최종 after는 기능 테스트가 끝난 뒤 실행했다.

| Width | Route | LCP median ms before / after | LCP range before / after | Transfer KiB before / after | JS KiB before / after | Requests | Max CLS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1440 | / | 56 / 108 | 52-108 / 96-112 | 232.7 / 232.7 | 196.2 / 196.2 | 25 / 25 | 0 / 0 |
| 1440 | /files | 76 / 84 | 56-80 / 80-88 | 210.9 / 210.9 | 180.1 / 180.1 | 21 / 21 | 0 / 0 |
| 1440 | /settings | 88 / 104 | 48-88 / 68-112 | 232.7 / 232.7 | 196.2 / 196.2 | 25 / 25 | 0.0017084686321159124 / 0.0017084686321159124 |
| 1440 | /login | 88 / 88 | 64-144 / 68-112 | 232.2 / 232.2 | 196.2 / 196.2 | 25 / 25 | 0 / 0 |
| 1440 | /welcome | 64 / 56 | 64-152 / 52-76 | 232.3 / 232.3 | 196.2 / 196.2 | 25 / 25 | 0 / 0 |
| 1440 | /preview | 88 / 76 | 76-100 / 76-80 | 286.4 / 286.4 | 206.0 / 205.9 | 49 / 49 | 0 / 0 |

Raw 1440: [before](performance/performance-before.json) / [after](performance-final/performance-after.json). Heap median 3.21 / 3.21 MiB; long task max 0.0 / 0.0 ms.

| Width | Route | LCP median ms before / after | LCP range before / after | Transfer KiB before / after | JS KiB before / after | Requests | Max CLS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 390 | / | 64 / 60 | 60-104 / 52-64 | 232.7 / 232.7 | 196.2 / 196.2 | 25 / 25 | 0 / 0 |
| 390 | /files | 72 / 76 | 60-108 / 44-88 | 210.9 / 210.9 | 180.1 / 180.1 | 21 / 21 | 0 / 0 |
| 390 | /settings | 56 / 72 | 48-108 / 48-72 | 232.7 / 232.7 | 196.2 / 196.2 | 25 / 25 | 0.010678397435897435 / 0.010678397435897435 |
| 390 | /login | 40 / 76 | 40-80 / 44-84 | 232.2 / 232.2 | 196.2 / 196.2 | 25 / 25 | 0 / 0 |
| 390 | /welcome | 72 / 76 | 44-80 / 52-88 | 232.3 / 232.3 | 196.2 / 196.2 | 25 / 25 | 0 / 0 |
| 390 | /preview | 60 / 72 | 60-76 / 72-88 | 270.7 / 270.7 | 206.0 / 205.9 | 43 / 43 | 0 / 0 |

Raw 390: [before](performance-mobile/performance-before-mobile.json) / [after](performance-mobile-final/performance-after-mobile.json). Heap median 3.21 / 3.19 MiB; long task max 0.0 / 0.0 ms.

Final source SHA-256: 2667835bbc829dbcf6ad73adfabc56e6f8867d301ad042a1416065fccb20a3a2

## 해석과 한계

- 정적 자산901824→901181bytes(−643bytes). 전체 배포 자산과 경로 초기 다운로드를 구분한다. 복구 기반은 UI에 import하지 않아 client bundle에 포함하지 않는다.
- before는 변경 전부터 실행 중이던 이전 `.next` 빌드로 측정했다. JSON의 sourceSha256은 수정 중인 작업 디렉터리를 읽었으므로 before 실행 빌드 식별자로 사용할 수 없다. 이전 자산901824bytes와 프레임 baseline을 함께 보존한다.
- 첫 after(`performance/performance-after.json`, `performance-mobile/performance-after-mobile.json`)는 복사·탐색 검사와 동시에 실행됐다. 원자료를 남기고 표에는 기능 테스트 종료 뒤 final 측정을 사용했다. 두 폭의 병렬 조건은 before/final 모두 같다.
- 데스크톱 홈 LCP 중앙값56→108ms 등 상승한 경로도 있다. 파일 LCP76→84ms/72→76ms와 전송량 거의 동일은 소규모 lab 관측이며 전체 무회귀/속도 개선을 확정하지 않는다. 장기 heap 누수/field INP는 이 측정으로 판단할 수 없다.
- 기본 Chromium 실행은 Page.enable timeout이었다. 격리 프로필에만 no-sandbox/disable-gpu를 적용한 wrapper로 실행했다. skill 설치/사용자 브라우저 설정은 변경하지 않았다.

## 상호작용 프레임

350ms×14개 관측: 목적지 열기, 하위/상위 왕복, 검사 단계, 이동 팝업. 이전 목록 최소 opacity0.45·경로별 입력 DOM 교체·검사 단계 상단 이동76.27px → 최종 전체 영역 opacity1·입력 제거0·관측 중 상단 이동0. 이전 finite-animation 수에는 버튼 색 전환도 포함돼 이후와 직접 비교하지 않는다. opacity/identity/top은 같은 기준이다.

20회 선택/해제에서 모든 목록 행 top/height가 동일했다. 지연 read 안내·선택 차단, 실패 시 이전 목록 보존, 재시도를 확인했다. 프레임 프로브는 DOM click이고 별도 회귀는 CDP 포인터/키보드다. 물리 입력 지연이나 실기기 p75가 아니다.

[이전 프레임](before/checks.json) / [최종 프레임과 동작](after/checks.json). 대상6경로에는 미연결/미구현 안내 및 보관 시안이 포함되며 실제 AI/로그인 성능이 아니다.
