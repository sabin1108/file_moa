# 설정 표시 데이터 cache 검증

구현 명세: [SC-001~006](../../specs/settings-display-cache.md)
문제·선택·호출 흐름: [구현 설명](../../reports/settings-display-cache-reading.md)

후속 실제 사용자 측정(2026-11-08): [이전 조회 방식 복원과 현재 캐시의 로컬 production 비교](../settings-cache-timing/measurement-20261108-v2/report.md). 반복 설정 56.2% 감소, 초기 진입 합계는 거의 동일했다. 아래 내용은 캐시 구현 당시의 검증 범위이며 후속 측정과 구분한다.

## 이번에 실행한 검증

- 최초 TDD: settings-display.test.ts가 미구현 module import에서 실패한 뒤 구현.
- pnpm exec vitest run --maxWorkers=4: 109파일, 1,059개 통과. 기존 1,040개 대비 신규 19개. 다른 환경·이전 세션의 통과를 합산하지 않았다.
- pnpm typecheck / pnpm lint / pnpm build: 통과.
- pnpm test:boundaries: 21개 synthetic lint fixture 통과.
- pnpm test:structure: web 25/domain 6/layout 3 및 실제 domain import 통과.
- node tests/browser/check-settings-display-cache.mjs: production 3035의 격리 guest/샘플 10개 통과. 실제 사용자 cookie를 읽거나 사용자 Chrome 세션에 연결하지 않았다.

## 주요 증거

| 조건 | 검사 |
| --- | --- |
| 인증 실패 시 cache 접근 0, 사용자별 key, 토큰 없는 DTO, 준비 실패와 조회 실패 구분 | settings-display.test.ts 7개 |
| 실제 Next API와 기본 FileSystemCache 메모리 backend의 요청 간 hit, 사용자 분리, tag 갱신, 폐기, 새 로그인 | settings-display-runtime.test.ts 5개 |
| Better Auth option의 session/account/user hook 배치 | settings-display-hooks.test.ts 1개, SDK는 mock |
| 프로필·methods·연결 DTO의 select와 성공한 소셜 해제 후 갱신 | settings-display-data.test.ts 3개 |
| 기본 owner 선택과 연결 해제 commit 후 양쪽 갱신/실패 시 비갱신 | 기존 auth-account-connection.test.ts에 3개 추가 |
| 기존 AI 세 번 인증과 입력·사용량·결과 재검증 | 전체 회귀의 기존 live-organization 검사 |

runtime 검사에서 초기 준비 후 다른 Headers의 다음 읽기는 인증 함수 2회, account/connection getter는 각각 1회였다. 추가 요청에서 표시 getter가 재실행되지 않는 증거이며 실제 DB round-trip 횟수와 지연으로 표현하지 않는다.

## 산출물과 한계

- 최종 production build: 6KuNxfx08cg8eEG7iOsHH.
- 기준 build: lpCxf_CNfziJk7VhXxTME.
- before-assets.json / after-assets.json: JS/CSS 각 1,700,147 bytes, 42파일. 변화 0 bytes.
- browser-checks.json: 최종 browser 검사. sample route의 공유 SettingsTabs와 localStorage를 검사한다. 인증된 설정 data cache의 브라우저 성능 검사가 아니다.
- 기존 dirty 변경은 보존했다. commit/push/배포, DB 스키마 변경, 개인 자료 전송, 유료 모델 호출은 하지 않았다.

## 실패 시도와 수정

- 초기 타입 검사에서 transaction 결과를 변수로 분리하며 status literal이 string으로 넓어졌다. transaction callback의 반환형을 AuthFormState로 명시해 수정했고 이후 타입·빌드 통과.
- 첫 전체 병렬 검사에서는 Next tag의 고해상도 시간과 entry 밀리초 시간이 같은 tick에 걸린 fixture 실패 1개와 기존 auth-config의 cold import 5초 초과가 있었다. cache fixture의 변경 사건을 다음 시점으로 분리하고 4 workers로 전체 실행해 1,059개 통과. timeout 값을 늘리거나 cache 함수를 가짜로 대체하지 않았다.
- 초기 브라우저 검사는 샘플 편집 탭에 실제 편집 select가 있다고 잘못 가정했다. 두 번째는 퀵메뉴에 없는 checkbox를 가정했다. 실제 샘플의 호출 방식 select를 사용하도록 harness만 수정해 최종 10개 통과. browser-initial-attempt.json과 browser-second-attempt.json에 부분 기록을 보존했다. 이 실패를 제품 결함으로 보고하지 않는다.
- browser helper가 완료 출력 뒤 남기는 handle은 close 뒤 process 종료를 명시해 정리했다. 사용자 브라우저는 종료하지 않았다.

## 미검증

실제 Better Auth와 DB mutation을 끝까지 통과하는 SDK hook 검증, 사용자 로그인 상태의 설정 진입 전후 시간·인프라 비용, 분산 서버 tag 전파, 실제 Windows 디스크·물리 IME는 이번 근거에 포함되지 않는다. 60초 revalidate는 강제 최대 신선도 보장이 아니다. 캐시 삭제/서버 재시작/서로 다른 인스턴스에서는 miss와 재조회가 가능하다.
