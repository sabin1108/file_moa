# 설정·내 폴더 연결 상태 공유 — 2026-10-27

설정 화면이 사라지면 연결 수명도 끝나던 구조를 공통 작업 영역으로 옮겼다. 같은 탭의 `/settings`, `/files`, `/` 이동에서는 연결·진행·오류가 유지된다. 양쪽 연결 UI는 동일한 state와 함수를 사용한다. 시안·로그인·가입은 이 영역 밖이고, 재진입/새로고침은 저장된 핸들을 명시적 재연결 상태로 복원한다.

## 직접 확인

1. http://127.0.0.1:3001/settings 에서 테스트 자료 폴더를 연결한다.
2. 메뉴의 **내 폴더**로 이동한다. 같은 이름과 연결됨을 확인한다. 대화를 거쳐 설정으로 돌아와도 유지된다.
3. 내 폴더에서 해제한 뒤 설정으로 이동한다. 미연결이어야 한다. 원본은 삭제되지 않는다.
4. 다시 연결하고 내 폴더에서 새로고침한다. 이름은 복원되지만 다시 연결 필요다. 버튼을 눌러야 읽기 권한을 요청한다.
5. 시안 보관함으로 나갔다 돌아와도 명시적 재연결이 필요하다. 시안 자체는 연결 저장소를 사용하지 않는다.

localhost 개발용 고정 소유자와 별도 DB이며 실제 로그인은 아직 아니다. 같은 origin을 사용해야 한다. 파일 목록·본문 읽기·정리·외부 전송은 구현하지 않았다. UI의 합성 성공이나 파일 수는 없다.

## 코드 읽는 순서와 연결

1. [작업 layout](<../../../apps/web/src/app/(workspace)/layout.tsx>) 5–6줄: `SourceFolderProvider`가 세 작업 화면을 감싼다. 괄호 폴더는 URL을 바꾸지 않는다. 공통 layout은 client navigation에 남아 있으므로 페이지가 바뀌어도 연결을 소유한 컴포넌트가 유지된다. root layout은 서버 컴포넌트 그대로다.
2. [SourceFolderProvider](../../../apps/web/src/features/local-folders/SourceFolderProvider.tsx) 9줄: 고정 개발 소유자와 배포 전 교체 조건. 11줄 `createContext<... | null>(null)`은 같은 연결 값을 자식에게 전달할 자리를 만든다. `ReturnType`은 기존 hook의 반환 자료형을 재사용한다. 별도 상태 모델을 복제하지 않는다.
3. 같은 파일 14–16줄:

```tsx
const connection = useSourceFolderConnection(developmentOwner);
return <SourceFolderContext.Provider value={connection}>{children}</SourceFolderContext.Provider>;
```

`children`은 현재 작업 화면이다. provider에서 hook을 한 번 호출해 기존 controller/session을 소유한다. 19줄의 `useSharedSourceFolderConnection()`은 `useContext`로 그 값을 받는다. provider 밖에서 잘못 사용하면 명시적 오류를 내며 새 연결 인스턴스를 몰래 만들지 않는다.

4. [SourceFolderSettings](../../../apps/web/src/features/local-folders/SourceFolderSettings.tsx) 17줄: 이제 공유 hook에서 `state`, 연결/재연결/해제/재시도 함수를 받는다. 기존 표시·오류·초점 복귀 코드는 재사용한다. 이 컴포넌트는 이름 그대로 연결 설정 UI이며 내 폴더에서도 같은 조작을 제공한다.
5. [내 폴더 page](<../../../apps/web/src/app/(workspace)/files/page.tsx>) 18줄과 [설정 page](<../../../apps/web/src/app/(workspace)/settings/page.tsx>) 15줄이 같은 `SourceFolderSettings`를 배치한다. 별도 가짜 상태나 `useSourceFolderConnection` 호출은 없다. 파일 화면은 미구현 목록을 0건으로 표시하지 않는다.
6. [기존 hook](../../../apps/web/src/features/local-folders/use-source-folder-connection.ts) → controller → session → repository의 구현은 변경하지 않았다. provider가 실제로 unmount되면 hook cleanup의 `controller.stop()`이 실행된다. 기존 generation 비교가 뒤늦은 picker/저장 결과의 게시를 막는다. 설정→파일 이동은 이제 stop 대상이 아니므로 같은 작업을 이어간다.

새 제품 파일은 provider와 공통 layout 두 개다. 세 page 이동은 수명 공유에 필요한 경계 변경이다. 별도 상태 저장 라이브러리·전역 singleton·새 CSS·의존성을 추가하지 않았다. 새 provider로 옮긴 `TEMPORARY(local-folder-dev)` 소유자는 인증 세션/계정 전환 격리 검증 후 교체하며, hook의 개발 DB·localhost 제한도 함께 전환해야 한다. 개발 핸들을 자동 이관하지 않는다.

## 명세 → 실패 → 구현 → 검증

- [명세 §7](../../specs/source-folder-connection.md#7-작업-화면의-연결-상태-공유--2026-10-27)을 먼저 작성했다.
- 구현 전 [브라우저 실패 기록](before/browser-checks.json): 설정에서 실제 OPFS 핸들을 저장한 뒤 `/files`로 이동했을 때 연결 상태가 없어 실패했다. UI에 연결 표시를 가짜로 주입한 검사가 아니다.
- 구현 후 [연결 공유/회귀](browser-checks.json): **49개 확인 항목 + 2개 반복 측정 기록**, 실패0. 처리 중 이동, 상태/오류 공유, 추가 권한·저장소 재조회 부재, 10회 대화 경유 왕복, 뒤로/앞으로, 파일 화면 새로고침·키보드 재연결, 해제 실패/재시도, 시안 이탈 후 늦은 선택 차단, 다시 진입, 초기 읽기 실패·미지원, 원본 sentinel 보존을 확인했다. 반복10회는 서로 다른 10개 사용자 시나리오가 아니다.
- [실제/시안 경계](screens/screen-checks.json): 69개 통과. 미구현 상태, 가짜 계정/대화 부재, preview의 picker/IDB 미접근, 모바일 Tab/Enter, 네 너비 넘침을 재확인했다.
- 기존 단위 **61개** 통과. 기존 controller/session의 계정 변경·중복·늦은 완료/실패 차단을 다시 실행했다. 새 업무 규칙을 만들지 않고 React 수명을 연결했으므로 구현 복제 단위 테스트 대신 위 실제 라우트 브라우저 검사를 추가했다.
- web/domain/S0 TypeScript, web 전체 ESLint, production build43페이지 통과. Node24.16.0, Next16.4.2, React19.3.1, TypeScript5.9.3, Vitest5.0.5 유지. 설치 도구를 직접 실행했고 lockfile/의존성 변경 없음.
- 경로 이동 후 오래된 `.next/dev/types`가 옛 page 경로를 참조해 첫 build 타입 검사가 실패했다. 실제 소스 대신 생성된 dev 타입 경로만 workspace 안인지 확인하고 제거한 뒤 build로 재생성하여 통과했다. 타입 검사를 끄거나 stub page를 남기지 않았다.
- 별도 읽기 검토에서 route group과 provider 수명, 지원 범위, cleanup/generation 연결을 확인했다. StrictMode 안전성은 코드와 기존 재시작 단위 검사 근거이며 별도 dev 브라우저 StrictMode 실행 증거는 아니다.

외부 경계: 실제 IndexedDB/Web Locks/OPFS 사용, picker·권한 응답·저장 실패는 검사 프로필에서만 주입. 네이티브 OS 권한창·실제 계정/다른 탭 동기화·브라우저 완전 재시작·스크린리더 직접 검증은 미완료다. 입력 기능이 없어 IME 검증은 해당 없음. 개인 노트는 사용하지 않았다.

## 화면과 시각 제한

기존 `achromatic-ledger` 방향, 팔레트, 시스템 서체, 960px 작업 면과 연결 행/버튼 토큰을 유지했다. 새 방향 추첨이나 채팅 재설계는 없다. 파일 연결 네 폭 캡처를 모두 열어 이름 줄바꿈·40/44px 버튼·미구현 안내를 확인했다.

| 폭 | 실제 내 폴더의 연결 상태 |
| --- | --- |
| 1440 | [화면](connected-1440.png) |
| 1920 | [화면](connected-1920.png) |
| 768 | [화면](connected-768.png) |
| 390 | [화면](connected-390.png) |

taste 소스 검사0 FAIL/0 WARN. 연결 화면은0 FAIL/2 WARN(두 desktop의 화면 아래 빈 공간). 실제 제공하는 기능만 보여주고 파일 목록을 만들지 않았으므로 여백을 가짜 자료로 채우지 않는다. 전체 경로 자동 시각 검사는 미구현 화면의 빈 공간4 FAIL/18 WARN을 계속 보고한다. 전체 시각 인증 통과로 주장하지 않는다.

## 성능: 전후 조건과 한계

[before](performance-before.json) / [after](performance-after.json): production, Windows Chrome155.0.8059.85,1440×900, CPU/네트워크 제한 없음, HTTP cache 비활성화, 같은 프로필에서 매회 새 탭, load 후1.2초 관찰, 경로별3회·전후 각18회. 코드 SHA와 자산 bytes는 원자료에 있다. 성능 실행과 다른 브라우저 검사를 겹치지 않았다.

| 경로 | LCP 중앙값 ms 전→후 (후 범위) | 전송 KiB 전→후 | JS KiB 전→후 | 요청 수 전→후 |
| --- | ---: | ---: | ---: | ---: |
| / | 56→124 (116–244) | 193.4→195.1 | 163.0→163.9 | 21→22 |
| /files | 120→64 (60–92) | 193.2→195.2 | 163.0→163.9 | 21→22 |
| /settings | 48→64 (52–76) | 193.4→195.1 | 163.0→163.9 | 21→22 |
| /login | 56→100 (60–140) | 193.1→194.7 | 163.0→163.9 | 21→22 |
| /welcome | 64→108 (52–704) | 193.2→194.7 | 163.0→163.9 | 21→22 |
| /preview | 80→76 (76–84) | 247.3→248.9 | 173.1→174.0 | 45→46 |

전체 비압축 static 자산743,063→743,594 bytes(+531 bytes). 경로별 전송은 manifest/chunk와 prefetch를 포함하므로 전체 자산 차이와 같지 않다. 로그인/시안의 전송 증가가 provider 실행을 뜻하지 않으며 실제 preview IDB 미접근은 별도 검사로 확인했다. 일부 LCP 상승과 큰 변동이 있어 회귀 없음이나 순수 최적화 성과로 주장하지 않는다. 원인별 성능 최적화는 이 기능 단위 밖이다.

새 연결 유지 여정10회(파일→대화→설정→파일)는28.4–46.9ms, 중앙값 약35.8ms. 자동화 호출/상태 확인 시간 포함이며 네이티브 권한 대기·field INP가 아니다. 같은 반복 전후 JS heap7,452,900→7,485,372 bytes(+32,472), 강제GC 없음. 단일 짧은 실행이므로 메모리 누수 없음의 증거로 확대하지 않는다. 별도 반복 폴더 선택 측정은 원자료에 있다. TBT/field INP/전체 브라우저 메모리/서버·AI 비용은 미측정이다.

## 재현

web에서 `node node_modules/next/dist/bin/next build` 후 `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3001`.

루트에서:

```powershell
node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p packages/domain/tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p scripts/s0/tsconfig.json
node scripts/check-settings-folder-connection.mjs http://127.0.0.1:3001 docs/verification/shared-folder-connection
node scripts/check-live-screens.mjs http://127.0.0.1:3001 docs/verification/shared-folder-connection/screens
node scripts/measure-settings-performance.mjs after http://127.0.0.1:3001 docs/verification/shared-folder-connection
```

ESLint는 web에서 `node node_modules/eslint/bin/eslint.js .`. before 기록은 현재 코드로 덮어쓰지 않는다. 다음 기능 단위는 연결한 폴더의 실제 목록 읽기이며, 권한/누락/크기·개수 제한/중단 조건부터 명세·실패 테스트를 준비한다.
