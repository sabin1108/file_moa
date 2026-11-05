# 미리보기 성능 기록 — 2026-10-28

최종 제목/초점 수정까지 포함한 기능 추가 비용과 기존 경로 관측이다. 최적화 성공률로 해석하지 않는다. 이전 목록 완성 기준선은 원위치에 보존했다. 최종 원자료는 final/이며 루트의 performance-after*.json은 제목 수정 전 중간 측정이다.

## 1440px 데스크톱

이전 2026-10-28T00:10:22.340Z / 이후 2026-10-28T05:15:40.153Z. Chrome/156.0.8078.48 → Chrome/156.0.8078.48, localhost:3002 → 3004. 최종 소스 SHA-256: ac1f49dfb3cd5addcab45bbccf796d0f70ce4bcdcf2c5a3a79dd6abb513cca0b.

| 경로 | 이전 LCP ms | 이후 LCP ms | 이전 전송 KiB | 이후 전송 KiB | 이후 JS KiB | 요청 수 중앙값 | CLS 최대 | long task 수(3회) | 이후 heap MiB |
|---|---:|---:|---:|---:|---:|---:|---:|---|---:|
| / | 1136.0 (128.0–2376.0) | 68.0 (60.0–272.0) | 204.5 (163.4–204.5) | 206.8 (206.8–207.4) | 175.2 (175.2–175.2) | 23 | 0.0000 | 0/0/0 | 3.1 (3.1–3.1) |
| /files | 64.0 (60.0–72.0) | 64.0 (56.0–356.0) | 204.8 (204.8–204.8) | 180.6 (170.0–207.0) | 148.8 (148.8–175.2) | 19 | 0.0063 | 0/0/0 | 9.7 (3.3–37.1) |
| /settings | 56.0 (56.0–60.0) | 452.0 (56.0–848.0) | 204.6 (204.6–204.6) | 206.8 (163.8–206.8) | 175.2 (145.9–175.2) | 23 | 0.0017 | 0/0/0 | 3.2 (3.1–41.3) |
| /login | 120.0 (96.0–136.0) | 56.0 (48.0–60.0) | 204.1 (204.1–204.1) | 206.4 (206.4–206.4) | 175.2 (175.2–175.2) | 23 | 0.0000 | 0/0/0 | 2.9 (2.9–3.0) |
| /welcome | 60.0 (52.0–64.0) | 56.0 (48.0–60.0) | 204.2 (204.2–204.2) | 206.4 (206.4–206.4) | 175.2 (175.2–175.2) | 23 | 0.0000 | 0/0/0 | 2.9 (2.9–3.0) |
| /preview | 84.0 (80.0–84.0) | 76.0 (76.0–84.0) | 258.3 (258.3–258.8) | 260.6 (260.6–261.1) | 185.3 (185.3–185.3) | 47 | 0.0000 | 0/0/0 | 3.9 (3.9–3.9) |

조건: production; Windows; 1440x900; no CPU/network throttling; HTTP cache disabled; same browser profile with new tab per run; 1.2s observation after load; no auth/model/API; three runs per route; LCP/CLS from PerformanceObserver, not Lighthouse; no field INP/TBT measurement.

## 390px 좁은 화면

이전 2026-10-28T00:11:24.872Z / 이후 2026-10-28T05:16:32.556Z. Chrome/156.0.8078.48 → Chrome/156.0.8078.48, localhost:3002 → 3004. 최종 소스 SHA-256: ac1f49dfb3cd5addcab45bbccf796d0f70ce4bcdcf2c5a3a79dd6abb513cca0b.

| 경로 | 이전 LCP ms | 이후 LCP ms | 이전 전송 KiB | 이후 전송 KiB | 이후 JS KiB | 요청 수 중앙값 | CLS 최대 | long task 수(3회) | 이후 heap MiB |
|---|---:|---:|---:|---:|---:|---:|---:|---|---:|
| / | 132.0 (104.0–248.0) | 84.0 (52.0–252.0) | 204.5 (204.5–205.2) | 206.8 (206.8–207.4) | 175.2 (175.2–175.2) | 23 | 0.0000 | 0/0/0 | 3.1 (3.0–3.1) |
| /files | 48.0 (48.0–124.0) | 60.0 (56.0–100.0) | 204.8 (204.8–204.8) | 207.0 (207.0–207.0) | 175.2 (175.2–175.2) | 23 | 0.0635 | 0/0/0 | 3.2 (3.2–3.2) |
| /settings | 56.0 (52.0–60.0) | 52.0 (48.0–52.0) | 204.6 (204.6–204.6) | 206.8 (206.8–206.8) | 175.2 (175.2–175.2) | 23 | 0.0107 | 0/0/0 | 3.2 (3.2–3.2) |
| /login | 56.0 (48.0–72.0) | 80.0 (52.0–912.0) | 204.1 (204.1–204.1) | 168.7 (155.1–206.4) | 137.5 (137.5–175.2) | 18 | 0.0000 | 0/0/0 | 2.9 (2.6–3.0) |
| /welcome | 76.0 (48.0–84.0) | 176.0 (48.0–292.0) | 204.2 (204.2–204.2) | 206.4 (160.0–206.4) | 175.2 (137.5–175.2) | 23 | 0.0000 | 0/0/0 | 2.9 (2.7–2.9) |
| /preview | 68.0 (64.0–68.0) | 76.0 (64.0–76.0) | 242.7 (242.7–242.7) | 244.9 (244.4–244.9) | 185.3 (185.3–185.3) | 41 | 0.0000 | 0/0/0 | 3.5 (3.5–3.6) |

조건: production; Windows; 390x900; no CPU/network throttling; HTTP cache disabled; same browser profile with new tab per run; 1.2s observation after load; no auth/model/API; three runs per route; LCP/CLS from PerformanceObserver, not Lighthouse; no field INP/TBT measurement.

## 해석과 한계

값은 중앙값(최소–최대), 경로별 n=3. 전체 압축 전 정적 자산 771920 → 783304 bytes, +11384 bytes(+11.12 KiB). 전체 배포 자산과 개별 경로 초기 전송을 혼동하지 않는다.

같은 Chrome156이지만 시간·origin·기기 부하·캐시 조건의 잔여 변동이 있어 소폭 차이로 무회귀/최적화 성공을 단정하지 않는다. 이전 / LCP의 큰 변동도 보존했다. 390px는 데스크톱 viewport이며 모바일 CPU/네트워크 모사가 아니다. /login·/welcome·/preview는 공통 자원 비교용이고 기능 완료나 시안 최적화의 근거가 아니다. 초기 측정은 미연결 상태이며 실제 파일 열기는 아래 별도 비용이다. 공통 chunk별 귀속·field INP·서버 부하·전체 프로세스 메모리는 미측정이다. heap은 V8 관측값이고 누수 인증이 아니다.

## 실제 읽기/표시 비용

최종 desktop에서는 `/settings` LCP가 56–848ms로 흔들렸고 `/files` 초기 전송도 170.0–207.0KiB, heap도 3.3–37.1MiB로 달랐다. 중앙값만으로 다운로드 최적화 또는 성능 무회귀를 판정하지 않는다. 이 관측 창과 소규모 표본으로 변동 원인을 확정하지 못했으며, 성능 최적화 착수 시 고정된 완료 시점·추적 자료로 별도 조사할 항목이다.

- 2MiB, 1440px: 214.05 (170.06–214.22)ms, n=3.
- 2MiB, 390px: 189.95 (184.33–204.83)ms, n=3.

CDP 클릭 + File 읽기/UTF-8 해석 + React 반영/레이아웃 확인 + polling을 포함한다. 순수 디코딩 시간이나 현장 INP가 아니다. 같은 상한 파일을 3회 열고 닫았으며 원문 길이/가로 넘침을 검사했다. 10회 경로 왕복에 본문 재읽기 없이 상태가 유지되는지도 검증했다.

- 기존 목록 100항목: 73.74 (60.65–86.68)ms, n=3.
- 기존 목록 1000항목: 123.55 (116.19–149.35)ms, n=3.
- 기존 목록 1001항목: 129.20 (109.24–156.56)ms, n=3.

목록도 CDP 조작·열거·렌더·polling을 포함한다. 1001항목은 상한 확인용이며 1000개까지만 표시한다.

## Lighthouse 별도 기준선

/files 미연결 초기 화면, 각 n=1, Lighthouse13.5.0/HeadlessChrome156, localhost production. 실제 연결 후 미리보기는 포함하지 않는다. 시뮬레이션 값과 위 무제한 PerformanceObserver 값은 서로 다른 실험이다.

| 프로필 | 성능/접근성/모범사례 | LCP ms | CLS | TBT ms | 보고서 |
|---|---|---:|---:|---:|---|
| desktop | 100/100/100 | 475.3 | 0.0068 | 0 | [HTML](lighthouse-desktop.report.html), [JSON](lighthouse-desktop.report.json) |
| mobile | 98/100/100 | 1957.6 | 0.0764 | 44 | [HTML](lighthouse-mobile.report.html), [JSON](lighthouse-mobile.report.json) |

Desktop:1350×940/DPR1/CPU1×/RTT40ms/10240Kbps. Mobile:412×823/DPR1.75/CPU4×/RTT150ms/1638.4Kbps. throttlingMethod simulate. 정확한 설정과 시각은 lighthouse-summary.json 및 원본을 본다. 접근성 실패/실행 경고0이지만 인증이나 전체 제품 보증은 아니다. 수정 전 접근성98의 heading-order 오류는 lighthouse-before-*에 보존했다.

기존 audit-ui.ps1과 같은 Lighthouse 버전/옵션을 사용하되 출력 위치를 분리했다. npx는 시스템 Node24.16.0 때문에 devEngines에서 실패해 pnpm dlx로 실행했다. PowerShell 쉼표 옵션은 한 문자열로 전달했다. 프로젝트 의존성/lockfile은 바꾸지 않았다. 재현: `pnpm dlx lighthouse@13.5.0 http://127.0.0.1:3004/files --only-categories=performance,accessibility,best-practices --chrome-flags=--headless=new --output=html --output=json --output-path=<새 경로> --preset=desktop` (PowerShell에서는 --only-categories 전체 인자를 따옴표로 감싼다; mobile은 preset 생략).
