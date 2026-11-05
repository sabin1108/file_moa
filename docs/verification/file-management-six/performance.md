# 파일 관리1~6 성능 — 2026-11-04

Windows/Chrome156, production localhost3030,6경로×2폭×3회=36표본. 캐시 비활성·CPU/네트워크 제한 없음·로드 뒤1.2초 관측. 두 폭을 병렬 측정했고 다른 UI 테스트는 종료한 상태였다. LCP/CLS는 PerformanceObserver, Lighthouse TBT/실사용 INP가 아니다. source SHA-256 `82f47c84cc5ae07567ac42685c602ca86432b6327ba58df15b8a96d834af9bc4`.

직전 **측정된** [새 파일 복원 빌드](../recovery-restore/performance.md)의 정적 자산1119082→1173114bytes(+54032). files 초기 JS234.90→246.59KiB(+11.69), 전송266.57→278.37KiB(+11.80). 중간 복원 기록 조회는 테스트/측정 보류였으므로 그 코드와 이번1~6 기능 비용이 함께 포함된다. 순수 최적화 이득으로 해석하지 않는다.

전송/JS는3회 중앙값, 요청은 범위다. 이상치도 원자료와 표에 포함했다.

| 폭 | 경로 | LCP 중앙값 ms | 범위 ms | 전송 KiB | JS KiB | 요청 | CLS 최대 |
| --- | --- | ---: | --- | ---: | ---: | --- | ---: |
|1440|/|112|72–252|300.15|262.80|26–27|0|
|1440|/files|60|52–132|278.37|246.59|22|0|
|1440|/settings|80|64–116|300.65|262.80|26|0.007923|
|1440|/login|52|52–72|299.71|262.80|26|0|
|1440|/welcome|52|48–124|299.74|262.80|26|0|
|1440|/preview|92|76–124|353.99|272.64|50|0|
|390|/|132|92–1936|300.15|262.80|18–26|0|
|390|/files|52|52–92|278.37|246.59|22|0|
|390|/settings|64|52–92|300.65|262.80|26|0.046490|
|390|/login|52|44–112|299.71|262.80|26|0|
|390|/welcome|64|52–76|299.74|262.80|26|0|
|390|/preview|68|68–80|337.71|272.64|42–44|0|

files LCP는 직전 두 폭 중앙값68ms에서60/52ms로 관측됐으나 표본 범위가 겹치므로 개선율을 주장하지 않는다. settings CLS는 직전0.007923/0.046490과 같았다.36표본 long task0·콘솔 예외0. JS heap1440px2.98–26.97MiB/390px2.98–34.16MiB는 페이지 로딩 시점의 값이며 총 메모리나64MiB 작업 peak를 뜻하지 않는다.

첫 root 표본에서 load 약4초와 heap 급증이 있었고 mobile root 한 표본은 LCP1936ms였다. 원인을 제품 코드로 확정하지 않았다. 같은 source hash의 최종 build 서버3031에서 두 폭을 **순차**로 root만3회씩 추가 관측했다. 추가 LCP는1440px60/112/128ms(중앙값112),390px56/92/128ms(중앙값92), load 최대183ms·heap4.55–4.59MiB·콘솔 예외0이었다. 최초36표본을 대체하거나 좋은 표본만 고르지 않는다. [전체1440](performance-final/performance-after.json), [전체390](performance-mobile-final/performance-after-mobile.json), [추가root1440](performance-root-followup/performance-after.json), [추가root390](performance-root-mobile-followup/performance-after-mobile.json). 초기 cold-start/공유 자원 조건의 변동은 원인 미확정으로 별도 남긴다.

실제 OPFS 작업은16MiB 폴더 copy/move에서 각각256×64KiB 쓰기와 SHA-256·빈 폴더·원본 처리/보존본을 검증했다. [결과](browser-edges/checks.json). 이번에는 새 작업의 안정적인 p50/p95 latency/peak memory를 측정하지 않았다. 로딩 자료를 파일 작업 속도로 일반화하지 않는다. 외부 네이티브 디스크/권한창·물리 IME·외부 동시 생성·실사용 INP는 미검증이다.
