# 설정 폴더 연결 검증 — 2026-10-26

구현 범위와 코드 해설: [첫 기능 명세 §6](../../specs/source-folder-connection.md#6-설정-화면-실제-연결--이번-단위의-수용-기준).

## 동작 검증

- 새 화면 상태 테스트 11개를 구현 전에 작성했고 모듈 미구현으로 실패하는 것을 확인했다. 구현 후 11개 및 전체 61개 통과.
- web/domain/S0 TypeScript, web ESLint, production build 38페이지 통과. 설치된 도구 실행 파일을 사용했으며 의존성·lockfile 변경 없음.
- [브라우저 원자료](browser-checks.json): 30개 확인 기록(검사 29개+반복 측정 1개), 실패 0. `http://127.0.0.1:3001`의 production 빌드, 격리 Chrome 155, 실제 IndexedDB/OPFS/Web Locks. picker·권한·저장 실패는 주입했다. 데이터는 고정 이름의 합성 폴더와 sentinel TXT 한 개. 난수 seed/외부 데이터/holdout 없음.
- 원본 보존은 합성 TXT 내용의 전후 동일성으로 확인했다. 개인 노트에는 접근하지 않았다. 외부 주소/변경 HTTP 요청이 없고 React hydration·console 오류가 없음을 확인했다.
- 초기 dev 실행의 CSS module HMR 캐시에서 서버·클라이언트 클래스 불일치가 발견돼 서버를 재시작했다. fresh dev와 production에서 사라졌다. 검사 도구에 console 오류 수집을 추가했다. 디자인 계측 도구의 로컬 변수명 충돌도 수정 후 재실행했다.
- 현재 실제 네이티브 picker/권한 창·철회·완전 재시작, 실제 로그인, 물리 키보드 OS IME, 다른 탭 계정 전환은 미검증. 이 기록을 그 증거로 사용하지 않는다.
- 가독성·임시 코드 주석 보강 후 2026-10-26 15:55–15:57 KST에 전체 61개 테스트, web/domain/S0 타입 검사, web lint, 38페이지 production build와 브라우저 29개 검사+반복 측정을 다시 통과했다. 아래 경로별 성능 전후 표는 가독성 정리 직전 빌드의 측정이며 원자료의 source fingerprint를 유지한다. 최신 빌드의 성능을 재측정했다고 주장하지 않는다.

### 이번 변경의 AI 리뷰 근거

- 버전: `package.json`, `apps/web/package.json`, `pnpm-lock.yaml`의 두 번째 YAML 문서와 설치된 package.json을 비교했다. Next 16.4.2, React 19.3.1, TypeScript 5.9.3, Vitest 5.0.5가 일치한다. Node v24.16.0은 프로젝트의 `>=24.0.0 <25` 범위다. pnpm 실행은 PATH/Corepack 문제로 확인하지 못해 설치된 검사 도구를 직접 실행했다. 모든 전이 의존성을 전수 감사한 것은 아니다.
- API: 실제 설치된 타입·빌드와 명세 §6의 MDN/Chrome 공식 자료를 대조했다. `showDirectoryPicker`와 `requestPermission`은 사용자 조작에 이어 호출하며, 지원 여부·보안 컨텍스트를 먼저 확인한다. 실제 OS 권한 창의 성공까지 검증한 것으로 확대하지 않는다.
- 테스트 실효성: 새 단위 테스트는 실제 `SourceConnectionController`와 `FolderConnectionSession`을 실행하고 외부 저장소/picker/권한만 대체한다. 취소·저장 실패 후 기존 연결 보존, 해제 실패 중 재선택 차단, 지연 응답의 저장 금지를 검사한다. 브라우저 검사에서는 실제 IndexedDB·Web Locks·OPFS를 사용한다. 모든 조건에 대한 mutation test를 수행한 것은 아니며, 호출 횟수만으로 기능 완성을 판정하지 않는다.

| 화면 | 데스크톱 | 좁은 화면 |
| --- | --- | --- |
| 연결됨·긴 이름 | [1440](connected-1440.png), [1920](connected-1920.png), [768](connected-768.png) | [390](connected-390.png) |
| 읽기 권한 거절 | [1440](denied-1440.png) | [390](denied-390.png) |
| 해제 저장 실패·재시도 | — | [390](remove-failed-390.png) |
| 미지원 환경 | — | [390](unsupported-390.png) |

시각 검토: 승인된 achromatic-ledger/한국어 시스템 서체/기존 팔레트 유지, 새 방향 추첨 없음. 화면의 질문은 ‘어떤 자료 폴더가 연결됐고 무엇을 할 수 있는가’다. 이름·상태·조작이 같은 행에 있고 실제 연결과 자료 전송 시안을 구분한다. 모바일은 행을 쌓고 전체 이름을 줄바꿈한다. 새 장식 카드·임의 파일 수·파일 목록을 추가하지 않았다. 변경 후 포인터 클릭에는 전체 영역 초점 테두리를 표시하지 않고 키보드 focus-visible은 유지한다. 8개 캡처를 모두 읽었다. 연결 상태 네 화면 폭의 앱 probe/judge는 0 FAIL/0 WARN이며 화면 취향·전체 접근성 인증을 의미하지 않는다.

## 첫 실제 기능의 성능 기준선

[이전 원자료](performance-before.json) / [이후 원자료](performance-after.json). 각 경로 3회씩 총 18회/18회. 아래는 중앙값, 괄호는 최솟값–최댓값이다. 마지막 이후 측정은 동작 검증과 겹치지 않게 실행했다.

조건: Windows, Node 24.16.0, Chrome 155.0.8059.85, Next production, localhost:3001, 1440×900, CPU/네트워크 제한 없음. HTTP cache disabled, 같은 실행 내 브라우저 profile에서 매번 새 탭, load 후 1.2초 관찰. 자동 prefetch 포함. 실제 로그인/모델/API 호출 없음. 이후 설정의 첫 방문은 빈 IDB 생성, 다음 방문은 빈 저장소 재사용. source SHA-256은 각 raw JSON에 기록한 당시 src 파일의 지문이며 Git 커밋은 아니다.

| 경로 | LCP ms 이전 → 이후 (범위) | 초기 전송 KiB 이전 → 이후 | JS 전송 KiB 이전 → 이후 | 요청 수 이전 → 이후 |
| --- | --- | --- | --- | --- |
| / | 84 (80–268) → 248 (224–508) | 189.7 → 181.6 | 161.3 → 153.2 | 18 → 17 |
| /files | 116 (112–132) → 120 (116–548) | 195.3 → 198.3 | 161.3 → 164.2 | 20 → 20 |
| /settings | 60 (60–64) → 68 (68–108) | 199.6 → 202.9 | 164.9 → 167.7 | 23 → 23 |
| /login | 64 (48–96) → 88 (52–92) | 202.8 → 202.9 | 169.3 → 169.4 | 24 → 24 |
| /welcome | 60 (60–64) → 60 (60–60) | 194.8 → 194.9 | 163.0 → 163.1 | 21 → 21 |
| /preview | 76 (72–84) → 72 (60–72) | 240.8 → 243.8 | 177.5 → 180.4 | 44 → 44 |

전체 경로의 CLS 중앙값 0→0. 이후 관찰 구간의 long task 0, 브라우저 예외 0. LCP/CLS는 PerformanceObserver 측정이며 Lighthouse 보고서가 아니다. TBT와 field INP는 미측정. 네트워크 수치는 Resource Timing transferSize로 응답 헤더와 prefetch를 포함하며 전체 배포 자산 크기와 다르다.

- 전체 정적 배포 자산의 비압축 합계: 747,135 → 756,561 bytes, +9,426 bytes(+9.21KiB). 공유 chunk 중복을 제거한 경로 공통 비용은 별도 산출하지 않았다.
- 신규 연결 작업(최신 브라우저 재검증, 합성 picker 즉시 응답·실제 IDB): 10회, 관찰 시작부터 성공 DOM까지 중앙값 약 13.35ms, 범위 10.9–37.8ms. 브라우저 자동 클릭 왕복과 fixture 핸들 조회 비용 포함. OS 선택창에서 사용자가 기다린 시간은 포함하지 않으며 네이티브 연결 시간으로 일반화하지 않는다.
- 같은 10회 반복 전후 JS heap: 6,522,792 → 7,207,228 bytes(강제 GC 없음). 브라우저 총 메모리나 메모리 누수 판정이 아니다. 경로별 heap 원자료도 남겼다.
- 측정 범위: 대표 6개 경로. 개별 28개 preview 상태·모바일 성능·필드 사용자·서버 자원·실제 AI 비용은 제외했다.
- 판정: 설정 기능의 새 비용은 기록했지만 채팅 LCP 중앙값 상승과 파일 경로의 큰 범위를 추가 조사 없이 회귀 없음으로 분류할 수 없다. 관찰 시간이 짧아 prefetch 완료 시점에 따라 요청 수/전송량도 달라진다. 이 작은 표본을 최적화 성과나 안정적인 p95로 보고하지 않는다. 이번 단위는 기능 구현이며 전역 성능 최적화는 하지 않았다.

## 재현

프로젝트 루트에서:

```powershell
node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p packages/domain/tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p scripts/s0/tsconfig.json
```

web 폴더에서 lint/build/start:

```powershell
node node_modules/eslint/bin/eslint.js .
node node_modules/next/dist/bin/next build
node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3001
```

서버 실행 후 루트에서 `node scripts/check-settings-folder-connection.mjs http://127.0.0.1:3001`.
성능 재측정은 `node scripts/measure-settings-performance.mjs after`이며 현재 after JSON을 덮어쓴다. 이전 버전의 빌드 없이 before를 재실행해 비교 근거를 덮어쓰지 않는다. 브라우저 검증을 동시에 실행하지 않는다.
