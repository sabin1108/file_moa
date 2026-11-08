# 최종 로컬 성능

빌드 `zTqIHw1ImSr-2r0-WJ0Ep`. Windows/Next production/Chromium headless/loopback, CPU·네트워크 제한 없음. 기능 검사 종료 후 별도 측정했다. 공유캐시9경로×2폭×3회=54표본과 캐시를 끈 대화2폭×3회=6표본을 performance-after.json/performance-cold.json에 보존한다. 실제 인증 디스크/사용자 방문 성능이 아니며 `/files` guest는 로그인으로 이동한다.

| 측정 | 직전 디테일 수정 | 자료 창/퀵메뉴 범위 수정 |
| --- | ---: | ---: |
| 전체 정적 JS/CSS | 1,557,627 bytes | 1,557,816 bytes (+189) |
| cold 대화390 LCP 중앙값 | 124ms | 68ms |
| cold 대화1440 LCP 중앙값 | 80ms | 80ms |
| cold 대화 JS 전송 | 246.9KiB | 247.1KiB |
| cold/공유캐시 CLS 최대 | 0 | 0 |

공유캐시 대화390/1440 LCP 중앙값은80/72ms다. 시간대/소표본 변동을 보존했으며 모바일 LCP 감소를 최적화 효과로 단정하지 않는다. 전체 정적 파일 합계와 실제 방문의 자원 전송량, navigation 문서 전송은 각각 다르다.

자료 창은260ms transform/opacity만 보간한다. layout 읽기는 열기/취소 시점이고 매 animation frame에 JS로 높이를 변경하지 않는다. 취소·빠른 반전·4폭·reduced-motion·초점·초안 보존은 scope/drawer33·탐색42·대화17개의 동작 검사로 분리했다. 인위적인 기다림이나 API 호출은 추가하지 않았다. 실사용 INP·메모리/CPU 장기 추세·물리 IME/실디스크는 미검증이다.
