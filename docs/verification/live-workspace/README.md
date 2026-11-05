# 실제 작업 화면과 시안 분리 검증 — 2026-10-26

목표·직접 확인·코드 읽는 순서: [명세](../../specs/live-workspace.md). 기본 경로는 실제 구현 상태만 표시하며, 기존 전체 화면 시안은 `/preview/screens/*`에 보관했다.

## 실행한 검증

- 변경 전 [경계 검사](screen-checks-before.json)는 `/`에서 실패했다. 원자료에 실제 경로의 예시 대화·시안 dialog가 남아 있었음을 기록했다. 새로운 `data-workspace` 표시 부재도 함께 검사하므로 이 실패 하나만으로 모든 이후 부정 조건이 독립 검증됐다고 주장하지 않는다.
- 최종 [화면 검사](screen-checks.json): 69개 통과. 실제 경로 5개, 보관 화면 5개/목록/폴더 시안, 1440/1920/768/390px 넘침, 모바일 Tab→Enter 이동, 시안의 명시적 안내와 실제 IDB/picker 접근 부재. 시안 설정의 폴더 버튼도 눌러 호출 기록만 바뀌는지 확인했다.
- [연결 회귀 검사](folder-connection/browser-checks.json): 검사 28개+반복 측정 1개, 실패 0. 실제 화면·IndexedDB·Web Locks·OPFS와 주입한 picker/권한 응답을 사용했다. 선택·취소·거절·저장 실패·해제 실패/재시도·키보드·복원·화면 이탈·원본 sentinel 보존을 검사했다. 제품에서 사라진 기본 탭과 가짜 이름 입력의 검사는 제거했다.
- 전체 Vitest 61개, web/domain/S0 TypeScript, web lint, Next production build 43페이지 통과. pnpm PATH/Corepack 제한으로 설치된 도구의 실행 파일을 직접 사용했다. Next 16.4.2/React 19.3.1/TypeScript 5.9.3/Vitest 5.0.5, Node 24.16.0 유지. 의존성·lockfile 변경 없음.
- 첫 타입 검사는 dev/prod 생성 라우트 타입의 갱신 시점이 어긋나 `/preview` layout 타입 오류가 났다. 소스를 우회하거나 타입 검사를 끄지 않고 소유한 dev 서버를 종료한 뒤 production build로 타입을 갱신했고 이후 검사 통과했다.
- 추가한 시안 로그인 링크 검사 첫 실행은 연결 탭을 연 뒤 unmount된 기본 탭 링크를 찾는 도구 순서 오류였다. 링크를 기본 탭에서 먼저 확인하도록 수정해 통과했다. 제품 로그인 기능을 검증한 것은 아니다.
- 읽기 전용 별도 검토에서 시안 설정의 로그인 링크가 실제 `/login`으로 빠지는 문제를 찾아 `/preview/screens/login`으로 수정했다. 이것을 전체 독립 품질 인증으로 확대하지 않는다.

실제 OS 폴더 선택창·권한 철회·완전 브라우저 재시작·인증·파일 탐색은 미검증/미구현이다. 이번 실제 화면에는 편집 가능한 텍스트 입력이 없으므로 IME/초안 보존 검사를 통과한 것으로 세지 않는다.

## 화면 근거와 시각 검사 한계

| 화면 | 데스크톱 | 좁은 화면 |
| --- | --- | --- |
| 실제 대화의 미구현 상태 | [1440](chat-1440.png) | [390](chat-390.png) |
| 실제 파일 탐색의 미구현 상태 | [1920](files-1920.png) | [390](files-390.png) |
| 실제 폴더 연결 | [1440](settings-1440.png) | [390](settings-390.png) |
| 보관한 설정 시안 | [1440](preview-settings-1440.png) | [390](preview-settings-390.png) |
| 시안 목록 | [1440](preview-catalog-1440.png) | [390](preview-catalog-390.png) |

실제 경로 20개+시안 4개 캡처를 저장했고 대화 1440, 파일 1920, 설정 1440/390, 시안 설정 390을 열어 확인했다. 승인 팔레트·서체·채팅 입력창 위치·기존 버튼/행 스타일을 유지했다. 모든 캡처를 사람이 검토한 것으로 세지 않는다.

자동 디자인 결과: 실제 경로 검사에 4 FAIL/18 WARN. 모두 빈 미구현 화면의 `blank-gap`/`hero-void`이며, 실제 연결 회귀 캡처에는 desktop 빈 하단에 대한 2 WARN이 있다. 화면 높이보다 실제 제공할 데이터와 행동이 적다. 사용자 최신 요구인 ‘임의 값으로 동작하는 것처럼 만들지 말 것’을 우선해 가짜 대화·파일·숫자나 장식으로 공간을 채우지 않았다. 따라서 시각 검사 전체 통과를 주장하지 않는다. 연결 화면의 내용 면은 내용 높이를 따르고 빈 카드나 모형 작업 목록은 만들지 않았다.

## 성능 기록

원자료: [before](performance-before.json), [after](performance-after.json). production, Windows/Chrome 155, 1440×900, CPU/네트워크 제한 없음, HTTP cache 비활성화, 같은 프로필의 새 탭, 경로당 3회·양쪽 18회, load 후 1.2초 관찰. 파일에 소스 SHA와 실행시각을 기록했다. 가독성 정리 이전의 지난 연결 기능 기록을 덮어쓰지 않았다.

| 경로 | LCP 중앙값 ms 전→후 (후 범위) | 전송 KiB 전→후 | JS KiB 전→후 | 요청 수 전→후 |
| --- | ---: | ---: | ---: | ---: |
| / | 120→52 (52–196) | 192.6→193.3 | 164.2→162.9 | 18→21 |
| /files | 80→52 (48–60) | 198.3→193.1 | 164.2→162.9 | 20→21 |
| /settings | 68→100 (56–124) | 202.9→193.3 | 167.7→162.9 | 23→21 |
| /login | 64→64 (56–108) | 202.9→193.1 | 169.4→162.9 | 24→21 |
| /welcome | 80→60 (52–64) | 194.9→193.1 | 163.1→162.9 | 21→21 |
| /preview | 76→84 (76–88) | 243.8→247.3 | 180.4→173.0 | 44→45 |

전체 비압축 static 자산 756,584→743,136 bytes(-13,448 bytes, 약 -13.13KiB). 경로 전송과 전체 자산은 다른 값이다. 설정 CLS 중앙값 0→0.00171, 나머지 경로 중앙값 0. 관찰 구간 long task/브라우저 예외는 전후 0. JS heap 원자료는 각 측정 파일에 있다. 전체 브라우저 메모리·GC 후 누수·field INP·TBT·서버/AI 비용은 미측정이다.

이번 전후는 기능 집합이 다르다. 기본 화면의 합성 자료를 제거하고 보관 경로를 추가했으므로 수치를 순수 최적화 성과로 해석하지 않는다. 설정 LCP는 작은 표본에서 상승했고 배치도 달라져 ‘회귀 없음’으로 단정하지 않는다. native 폴더 선택 대기 시간은 측정하지 않았다. 새 5개 시안의 개별 성능은 미측정이며 기존 대표 6개 경로 비교만 수행했다.

## 재현

루트: `node node_modules/vitest/vitest.mjs run`, `node node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json` (domain/S0는 해당 tsconfig 경로).

`apps/web`에서 `node node_modules/eslint/bin/eslint.js .`, `node node_modules/next/dist/bin/next build`, `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3001`.

서버 실행 후 루트에서:

```powershell
node scripts/check-live-screens.mjs http://127.0.0.1:3001
node scripts/check-settings-folder-connection.mjs http://127.0.0.1:3001
node scripts/measure-settings-performance.mjs after http://127.0.0.1:3001 docs/verification/live-workspace
```

브라우저 성능 측정과 다른 브라우저 검사는 동시에 돌리지 않는다. 현재 빌드로 before를 덮어쓰지 않는다.
