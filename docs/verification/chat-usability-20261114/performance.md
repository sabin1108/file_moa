# 첫 사용·채팅 사용성 변경의 로딩 비용

2026-11-14. 이전 기준은 커밋6a1f7e7을 별도 디렉터리에서 빌드했고, 이후는 이번 수정의 production build다. 두 빌드 모두 Next16.4.3·Node24.22.1, Windows10.0.26200·Chrome157.0.8103.51 환경이다. 드라이버는 pnpm exec node를 사용했다.

- 이전 build: YhgFvvO0Y0UGi2xhK-0BK
- 이후 build: rjZlGlM4h3ft8gSnrQzoO
- 경로11개 × 화면390/1440px × 각각3회 = 이전66/이후66표본. 높이1000px, CPU·네트워크 제한 없음. 각 표본은 새 탭이며 한 실행 안의 HTTP 캐시는 공유한다.
- 전체 빌드의 JS/CSS 원본 합계: 3444.6 → 3457.2 KiB, 변화 12.6 KiB. 최초 다운로드·gzip 수치와 구분한다.
- 비로그인 요청이며 /와/files의 도착 화면이 바뀌었다. 기능 집합과 여정이 달라 순수한 최적화 개선율을 계산하지 않는다. /demo는 유효한 샘플 cookie가 없는 소개 진입이다.
- 아래는 중앙값이다. 전송0은 공유 캐시의 재사용 결과일 수 있으며 원자료를 함께 확인한다. n=3으로 안정적인 p95나 실사용 INP를 주장하지 않는다. LCP 관측 시간은 기존 스크립트의 짧은 lab 구간이다.
- 로그인된 실제 채팅의 초기 로딩, 개인 디스크/DB 지연, 유료 모델 응답, 서버 부하, field INP는 미측정이다. 실제 컴포넌트+OPFS의100/500턴 표시 검증은 별도 기록함 검사에 포함하며 이 표를 대체하지 않는다.

| 요청 | 폭 | 최종 경로 전/후 | LCP ms 전/후 | CLS 전/후 | 문서+자원 전송 B 전/후 |
| --- | ---: | --- | ---: | ---: | ---: |
| /login | 390 | /login → /login | 60 / 48 | 0.000 / 0.000 | 17099 / 17097 |
| /login | 1440 | /login → /login | 88 / 68 | 0.000 / 0.000 | 17099 / 17095 |
| /welcome | 390 | /welcome → /welcome | 68 / 48 | 0.000 / 0.000 | 16345 / 16337 |
| /welcome | 1440 | /welcome → /welcome | 72 / 60 | 0.000 / 0.000 | 16343 / 16333 |
| /forgot-password | 390 | /forgot-password → /forgot-password | 56 / 52 | 0.063 / 0.063 | 14851 / 14850 |
| /forgot-password | 1440 | /forgot-password → /forgot-password | 72 / 80 | 0.012 / 0.012 | 14852 / 14851 |
| /reset-password | 390 | /reset-password → /reset-password | 80 / 64 | 0.068 / 0.068 | 16279 / 16272 |
| /reset-password | 1440 | /reset-password → /reset-password | 124 / 84 | 0.012 / 0.012 | 16279 / 16271 |
| /verify-email | 390 | /verify-email → /verify-email | 84 / 76 | 0.068 / 0.068 | 16799 / 16791 |
| /verify-email | 1440 | /verify-email → /verify-email | 132 / 88 | 0.012 / 0.012 | 16798 / 16790 |
| /files | 390 | /login → /start | 60 / 124 | 0.000 / 0.000 | 17099 / 21815 |
| /files | 1440 | /login → /start | 80 / 108 | 0.000 / 0.000 | 17097 / 21814 |
| /demo | 390 | /demo/intro → /demo/intro | 156 / 140 | 0.000 / 0.000 | 13016 / 13012 |
| /demo | 1440 | /demo/intro → /demo/intro | 140 / 124 | 0.000 / 0.000 | 13016 / 13012 |
| /demo/files | 390 | /demo/intro → /demo/intro | 128 / 116 | 0.000 / 0.000 | 14186 / 14180 |
| /demo/files | 1440 | /demo/intro → /demo/intro | 148 / 132 | 0.000 / 0.000 | 14185 / 14181 |
| /demo/settings | 390 | /demo/intro → /demo/intro | 132 / 112 | 0.000 / 0.000 | 13016 / 13012 |
| /demo/settings | 1440 | /demo/intro → /demo/intro | 136 / 116 | 0.000 / 0.000 | 13016 / 13012 |
| /start | 390 | /start → /start | 104 / 96 | 0.000 / 0.000 | 21826 / 21813 |
| /start | 1440 | /start → /start | 132 / 140 | 0.000 / 0.000 | 21823 / 21815 |
| / | 390 | /login → /start | 56 / 92 | 0.000 / 0.000 | 17097 / 21815 |
| / | 1440 | /login → /start | 60 / 108 | 0.000 / 0.000 | 17099 / 21814 |

원자료: [이전](performance-before.json), [이후](performance-after.json). 측정 도구: tests/performance/measure-sample-workspace.mjs. 이전 스냅샷의 복제 테스트는 단위 테스트 실행 대상에서 제거했으며 최종 결과는 제품 테스트155파일1415개다.
