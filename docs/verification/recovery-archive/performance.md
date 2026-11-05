# 보관함 조회·권한 안내 성능 — 2026-11-04

Windows/Chrome156, 최종 production localhost3025.6경로×2폭×3회=36표본, 캐시 비활성·CPU/네트워크 제한 없음·로드 후1.2초 관측. 두 폭은 병렬 실행해 공유 자원 경쟁이 있다. LCP/CLS는 PerformanceObserver이며 Lighthouse TBT/실사용 INP가 아니다. source SHA-256: `f5a968db85ba0d6f00b34c02cf25ae53853bc51c78ebc7609f4d353cdeb0e0b8`.

[직전 덮어쓰기 빌드](../recovery-overwrite/performance.md)의 정적 자산1078892→1097193bytes(+18301). files 초기 JS225.38→230.13KiB(+4.75), 전송256.92→261.69KiB. 목록·상세 reader/controller/UI와 앱 안내의 신규 기능 비용이며 최적화 이득으로 해석하지 않는다.

| 폭 | 경로 | LCP 중앙값 ms | 범위 ms | 전송 KiB | JS KiB | 요청 | CLS 최대 |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| 1440 | / | 68 | 64–72 | 283.52 | 246.33 | 25 | 0 |
| 1440 | /files | 64 | 48–68 | 261.69 | 230.13 | 21 | 0 |
| 1440 | /settings | 80 | 60–96 | 283.92 | 246.33 | 25 | 0.007240 |
| 1440 | /login | 72 | 48–76 | 283.08 | 246.33 | 25 | 0 |
| 1440 | /welcome | 48 | 48–72 | 283.12 | 246.33 | 25 | 0 |
| 1440 | /preview | 72 | 64–76 | 337.34 | 256.17 | 49 | 0 |
| 390 | / | 60 | 60–88 | 283.52 | 246.33 | 25 | 0 |
| 390 | /files | 44 | 44–56 | 261.69 | 230.13 | 21 | 0 |
| 390 | /settings | 132 | 120–152 | 283.92 | 246.33 | 25 | 0.046490 |
| 390 | /login | 80 | 68–84 | 283.08 | 246.33 | 25 | 0 |
| 390 | /welcome | 44 | 40–52 | 283.12 | 246.33 | 25 | 0 |
| 390 | /preview | 60 | 60–68 | 321.62 | 256.17 | 43 | 0 |

초기3024 빌드에서는 권한 안내가 연결 정보 로딩 뒤 삽입되어 settings CLS 최대가1440px0.036688/390px0.155152였다. 안내를 처음부터 렌더링한 최종 빌드에서는0.007240/0.046490으로 관측됐다. 초기36표본은 [1440](performance/performance-after.json)/[390](performance-mobile/performance-after-mobile.json)에 보존했다. 초기 files LCP/heap의 큰 변동도 보존하지만 원인을 코드로 확정하거나 그 차이를 순수 개선율로 보고하지 않는다.

최종 폴더 미연결 페이지 로딩 JS heap은1440px2.98–4.72MiB/390px2.97–4.71MiB,36표본 long task0/콘솔 예외0. 이는 수백 작업 조회의 peak memory나 총 브라우저 메모리·누수 검증이 아니다. [최종1440](performance-final/performance-after.json)/[최종390](performance-mobile-final/performance-after-mobile.json).

[작업 시간 원자료](ui-verified/timing.json): 백업 작업1개/파일1개 metadata 목록45ms(payload 읽기0),36bytes payload/양쪽 기록 상세229ms. 각각1회이며 CDP 폴링/실제 OPFS/Worker를 포함한다. 대표 latency/p95나 네이티브 디스크 성능으로 일반화하지 않는다. 대규모 목록/16MiB 상세의 peak memory·실사용 INP·실물 모바일/OS 권한창은 미측정이다.
