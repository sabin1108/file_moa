# 과거 정적 시안 Lighthouse 기록

현재 폴더/메뉴 개정 이전 기록이다. 기능 구현 전 측정값이며 현재 화면이나 사이트 전체 성능을 증명하지 않는다. 최신 사용자 요청에 따라 정적 시안의 추가 성능 테스트는 진행하지 않는다. 기능 단계의 기준은 ../performance-policy.md.

2026-10-23 · Lighthouse 13.5.0 · Chrome 155 · production localhost. 각 프로파일 1회 측정, 실제 파일/AI 기능 없음.

| 페이지/프로파일 | 성능 | 접근성 | 모범 사례 | LCP(ms) | CLS | TBT(ms) | 보고서 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| chat-desktop | 100 | 100 | 100 | 485 | 0 | 0 | [HTML](chat-desktop.report.html) |
| files-desktop | 100 | 100 | 100 | 475 | 0 | 0 | [HTML](files-desktop.report.html) |
| chat-mobile | 99 | 100 | 100 | 2073 | 0 | 65 | [HTML](chat-mobile.report.html) |
| files-mobile | 99 | 100 | 100 | 2058 | 0 | 52 | [HTML](files-mobile.report.html) |

점수는 실제 파일 정합성·사용자 편안함·전체 접근성 준수나 현장 INP를 보장하지 않는다. 같은 조건 3회 중앙값/현장 측정은 후속 비교 기준이다.

재현: scripts/audit-ui.ps1 -Page chat|files -Profile desktop|mobile. 서버 실행 후 프로젝트 루트에서 실행.
