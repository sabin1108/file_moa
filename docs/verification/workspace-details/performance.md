# 최종 로컬 성능과 설정 탭 비용

빌드 `p6B4iUiX49Y1FbWaVQAlM`, Windows/Next production/Chromium headless/loopback, CPU·네트워크 제한 없음. 기능 검사 후 별도로 측정했다. 이전 기준은 `../workspace-navigation/performance.md`의 빌드다.

| 측정 | 직전 공통 탐색 | 현재 디테일 수정 |
| --- | ---: | ---: |
| 전체 정적 JS/CSS | 1,554,082 bytes | 1,557,627 bytes (+3,545) |
| cold 대화390 LCP 중앙값 | 64ms | 124ms |
| cold 대화1440 LCP 중앙값 | 72ms | 80ms |
| cold 대화 JS 전송 | 245.7KiB | 246.9KiB |
| cold/공유캐시 CLS 최대 | 0 | 0 |

공유캐시9경로×2폭×3회=54표본은 performance-after.json, HTTP캐시를 끈 대화2폭×3회=6표본은 performance-cold.json이다. `/files`는 비로그인 상태에서 로그인으로 이동한다. 전체 정적 chunk 합계와 한 번의 방문 전송량을 혼합하지 않는다. 서로 다른 시간대의 소표본이며 모바일 cold LCP 증가를 보존했다. 원인을 번들/CPU/네트워크 중 하나로 단정하거나 실사용 회귀율로 환산하지 않는다. 공유캐시 대화 중앙값은390/1440=56/72ms, CLS0이었다.

실제 Next 샘플 route에서 공통 SettingsTabs를12번 전환했다. 클릭부터2회 rAF 후 화면 확인까지 중앙31.7ms,최대33.7ms이며 탭 전환으로 인한 RSC/POST는0건이다. 이는2프레임 대기를 포함한 로컬 표시 확인 시간이고 실사용 INP가 아니다. back/forward/F5·DOM 보존과 요청 부재도 별도 검사했다. 정식 계정의 초기 인증/DB 조회는 측정하지 않았고 첫 진입에는 여전히 서버 작업이 필요하다.

중앙 로딩은 로컬 RSC 응답을 의도적으로 멈춘 실제 Link 탐색에서 상태 표시/중앙 좌표/dim/완료 제거를 검사했다. 그 강제 지연을 실제 앱의 느린 시간으로 보고하지 않는다. 단위801,관련브라우저78,기존대화17/파일39의 동작 검증과 로딩 성능 표본은 분모가 다르다. 물리 Windows·IME·OS 키 충돌·실사용 메모리/INP는 미검증이다.
