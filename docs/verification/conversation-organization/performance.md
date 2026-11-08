# 대화·내용 정리 통합 성능

최종 빌드 `0ybMAmLCjLIo2IzSyeUAT`, 로컬 Windows/Next production/Chromium headless, CPU·네트워크 제한 없음. guest6경로와 샘플 대화/파일/설정의 경로별 표본, 별도 캐시 비활성 대화6표본을 기록한다. 정식 `/files`는 로그인으로 이동하며 실제 사용자 파일 처리 성능이 아니다.

최종 공유 캐시 측정은9경로×390/1440px×3회=54표본이다. 샘플 대화 LCP 중앙값390/1440=88/116ms, 샘플 파일76/64ms, 샘플 설정56/68ms이며 CLS 최대0이다. cold 표본은 아래처럼 별도이며 공유 캐시 수치와 혼합하지 않는다.

| 대상 | 직전 Gemini 샘플 | 현재 공통 대화·정리 |
| --- | ---: | ---: |
| 전체 정적 JS/CSS | 1,502,359 bytes | 1,506,532 bytes (+4,173) |
| cold 대화390 LCP 중앙값 | 80ms | 76ms |
| cold 대화1440 LCP 중앙값 | 112ms | 84ms |
| cold 대화 CLS | 0 | 0 |
| cold 대화 자원/JS 전송 | 253.1/232.8KiB | 266.5/241.3KiB |

기존 파일 중심 화면에서 대화/자료 패널과34개 샘플을 공급하는 신규 기능 비용이다. 서로 다른 화면/시간대의 로컬 소표본이므로 속도 개선으로 해석하지 않는다. 공유 캐시 측정의 JS전송0은 초기 비용0이 아니다.

실제 현재 두 요청은34개 발췌의 countTokens·DB 예약·Gemini 생성·UI 갱신을 포함해5459ms(4117토큰),5607ms(3728토큰)다. 실제 모델/네트워크 표본2개로 p95/처리량/전체 정확도를 주장하지 않는다. 중간 스키마/의도 오류는 최종 통과 표본에 포함하지 않았고 검증 README에 별도 기록했다.

대화/입력 DOM을 유지하고 자료 패널만 전환한다. 브라우저에서10회 토글의 초안/DOM 보존, 실제 단계의260ms 공통 animation 호출과 reduced-motion 시 호출0을 확인했다. 이는 물리 입력/실사용 INP 측정이 아니다.

원자료: [경로별 측정](performance-after.json), [cold6](performance-cold.json), [실제 보고서](reports-result.json), [실제 성능 자료](performance-result.json). 반복 UI replay는 별도 계획 렌더링 확인이며 모델 재호출/성능 표본으로 합산하지 않는다. 실제 계정·대규모 폴더·장기 heap/서버RSS·Lighthouse/field p75는 미측정이다.
