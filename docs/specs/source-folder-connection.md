# 첫 제품 기능: 자료 폴더 연결

상태(2026-10-28): localhost 개발용 연결·목록·원문 미리보기와 설정/파일 화면 공유를 구현했다. 사용자 연결·재연결 성공 후 /files로 이동한다. 실제 로그인과 네이티브 OS 권한 창 검증은 남아 있다. 최신 이동 계약은 [연결 후 이동 명세](connection-navigation.md), 코드 위치는 [코드 지도](../code-map.md)를 따른다. 아래 단계별 기록은 당시의 구현 경과다.
진행 방식: 작은 변경 → 검증 → 코드 읽는 순서 설명 → 사용자 검토. 검토 후 다음 단위를 진행한다.

## 1. 사용자가 할 수 있게 만들 동작

설정의 연결 탭에서 자료 폴더 1개를 읽기 전용으로 연결하고 이름과 상태를 확인한다. 이후 파일 화면의 연결 버튼도 같은 상태와 동작을 사용한다.

| 행동/상황 | 화면 결과 |
| --- | --- |
| 폴더 선택·권한 확인·연결 정보 저장 성공 | 선택한 폴더 이름과 연결됨 표시, /files로 이동해 직계 목록 표시 |
| 폴더 선택이 완료되지 않음 | 기존 폴더와 상태 유지, 완료되지 않았음을 안내 |
| 필요한 권한이 없음 | 다시 연결하는 행동과 권한 필요 상태 표시 |
| 연결 정보 저장 실패 | 저장 실패 안내, 기존 연결 유지 |
| 새로고침 후 저장된 연결 발견 | 폴더 이름과 다시 연결 필요 표시, 권한 자동 요청 없음 |
| 연결 해제 | 연결 정보 제거, 원본 폴더·파일 보존 |
| 계정 전환 | 이전 계정 연결을 즉시 비우고 늦은 결과 무시 |

연결 과정에서는 전체 파일을 재귀 탐색하거나 본문을 읽지 않는다. 파일 수는 아직 측정하지 않으므로 임의 숫자를 표시하지 않는다. 파일 목록·미리보기·AI 기록 저장·다중 폴더는 별도 기능이다. 실제 로그인 전에는 개발용 계정 검증임을 구분한다.

## 2. 현재 코드 읽는 순서

| 순서 | 파일 | 읽으면서 확인할 것 |
| --- | --- | --- |
| 1 | [types.ts](../../apps/web/src/features/local-folders/types.ts) | 연결 소유자는 누구인가? 자료와 AI 기록 폴더를 어떻게 구분하는가? |
| 2 | [connection-session.ts](../../apps/web/src/features/local-folders/services/connection-session.ts) | 선택·재연결·해제·계정 전환 때 상태가 어떻게 바뀌는가? |
| 3 | [handle-repository.ts](../../apps/web/src/features/local-folders/services/handle-repository.ts) | 폴더 핸들을 어디에 저장하고 어느 참조만 삭제하는가? |
| 4 | [connection-session.test.ts](../../apps/web/tests/local-folders/services/connection-session.test.ts) | 취소·저장 실패·늦은 계정 응답에서 무엇을 보존하는가? |
| 5 | [SourceFolderSettings.tsx](../../apps/web/src/features/local-folders/components/connection/SourceFolderSettings.tsx) | 연결 결과와 성공 후 이동은 어디에서 조합하는가? |

폴더 핸들은 브라우저가 제공하는 접근 객체다. 파일 내용 자체가 아니다. IndexedDB는 그 핸들을 이 브라우저에 보관한다. `FolderConnectionSession`은 연결 상태와 요청 순서를 관리한다. 이번에 `view(kind)`로 폴더 이름과 연결 상태를 조회하는 계약을 추가했다. 처리 중 표시·오류 안내·React 화면 갱신은 후속 통합에서 연결한다.

완성 시 흐름: 화면의 클릭 → 연결 동작 → 브라우저 권한/저장소 처리 → 표시용 상태 갱신 → 화면에 결과 표시. 화면 컴포넌트에는 직접 IndexedDB를 열거나 계정 키를 조합하는 코드를 넣지 않는다.

## 3. 검토 단위

1. **동작·구조 확인: 완료.** 사용자 진행 지시에 따라 2번을 구현했다.
2. **표시할 데이터와 상태: 완료.** 기존 연결 서비스에서 폴더 이름·연결 상태를 안전하게 읽는 최소 계약과 테스트를 추가했다. 브라우저 핸들을 표시 컴포넌트에 전달하지 않는다.
3. **연결 표시 컴포넌트: 완료.** `SourceFolderConnection`은 기존 행·버튼 스타일·상태 표시를 재사용한다. `/preview/folder-connection`에서 합성 입력과 콜백 기록으로 확인한다. 실제 연결 완료와 구분한다.
4. **설정 화면에서 실제 연결: 구현·자동 검증 완료, 검토 대기.** localhost의 개발용 소유자와 별도 저장소로 선택·처리 중·오류·재연결·해제를 연결했다. 실제 권한 창과 로그인 검증은 아직이다. 확인 방법은 §6.
5. **파일 화면과 상태 공유.** 같은 UI와 동작을 사용하고 화면 이동 시 상태 보존을 확인한다. 이후 첫 기능 전체의 실제 브라우저 검증과 성능 기준선을 기록한다.

각 단위에서 필요해진 파일만 수정한다. 먼저 제안한 Panel/Dialog/hook 이름을 모두 만들 필요는 없다. 기존 dialog의 접근성 동작과 시안의 샘플 전환 로직은 구분해 재사용 여부를 판단한다. 사용자 검토 후 다음 코드 단위는 5번이다.

### 이번 변경 읽기: 코드 파일 3개

1. `types.ts`의 `FolderConnectionView`: 화면에 전달할 값의 모양이다. 미연결이면 이름은 null, 연결 정보가 있으면 이름은 문자열이다. `Readonly`는 TypeScript에서 이 값을 직접 바꾸지 않도록 한다.
2. `connection-session.ts`의 `view(kind)`: 이미 메모리에 있는 핸들의 이름과 연결 여부로 표시값을 계산한다. 이름을 별도 상태에 중복 저장하지 않는다. 기존 `state(kind)`는 같은 결과의 status를 반환하므로 두 조회의 판정이 어긋나지 않는다.
3. `connection-session.test.ts`의 마지막 테스트 3개와 기존 사례의 추가 검증: 표시값에 접근 핸들이 포함되지 않는지, 조회가 I/O를 일으키지 않는지, 저장 성공 전 새 이름이 나타나지 않는지 확인한다. 계정 전환/실패/해제의 이름 보존·제거도 확인한다.

```ts
const view = session.view("source");
// 연결됐을 때: { status: "connected", folderName: "학습 노트" }
// 권한 확인 필요: { status: "needs-permission", folderName: "학습 노트" }
// 연결 없음: { status: "disconnected", folderName: null }
```

매 호출은 그 시점의 새 값 객체를 반환한다. 실제 핸들이 없으므로 표시 컴포넌트는 이 객체로 파일을 읽거나 삭제할 수 없다. JavaScript에서 반환값을 바꾸더라도 서비스 내부 상태에는 영향을 주지 않는다. 이 메서드는 자동 구독/화면 갱신 기능이 아니며, 향후 React 연결에서는 동작 결과에 맞춰 갱신해야 한다.

2026-10-25 이번 실행: 관련 테스트 19개, 전체 50개 통과. web 타입·린트·Next production build(37페이지) 통과. 브라우저 화면·네이티브 권한 검증은 이번 단위에서 실행하지 않았다. UI 및 저장 I/O 동작을 변경한 단위가 아니며 이전 브라우저 결과와 구분한다.

## 4. 검증·성능·완료 판단

- 상태/저장 규칙은 실패 테스트부터 시작한다. 실제 코드 변경 후 관련 테스트·타입·린트·빌드를 실행한다.
- 제품 흐름은 실제 폴더 선택·거절·재허용·재시작, 키보드 초점과 좁은 화면으로 확인한다. 자동 테스트의 주입된 권한 응답과 구분한다.
- 연결 시 전체 탐색을 피하고, 연결 변경 시에만 저장하며, 관련 화면이 필요한 상태만 구독하도록 구성한다. 추가 캐시나 메모이제이션은 측정 후 결정한다.
- 첫 제품 통합에서 [성능 정책](../performance-policy.md)에 따라 기존 경로 비용과 신규 연결 흐름을 구분해 측정한다. 사용자가 선택창에서 고민한 시간과 앱 내부 처리 시간도 구분한다.
- 기존 저장·복구·계정 분리 테스트는 기반 증거다. 실제 인증과 화면 연결까지 완료한 증거는 아니다. 실제 권한 창 검증은 현재 미완료다.

관련 규칙: [파일 스킬](../../.agents/skills/personal-ai-files/SKILL.md), [UI 스킬](../../.agents/skills/personal-ai-ui/SKILL.md), [개발 지침](../guidelines.md), [계정 연결 계약](account-folder-connections.md).

## 5. 이번 단위를 직접 확인하기 — 2026-10-26

검토 주소: `http://127.0.0.1:3000/preview/folder-connection`. `/preview`의 **파일 연결 → 자료 폴더 연결 검토**에서도 들어갈 수 있다.
서버가 꺼졌다면 프로젝트 루트에서 `node apps/web/node_modules/next/dist/bin/next dev apps/web --hostname 127.0.0.1 --port 3000`으로 연다.

아래쪽 **시안 상태 전환** 버튼으로 상태를 고른 뒤, 위쪽 **자료 폴더 연결** 영역의 조작을 누른다.

| 선택한 상태 | 표시되어야 하는 내용 | 눌러서 확인할 결과 |
| --- | --- | --- |
| 미연결 | 연결한 폴더 없음 / 미연결 / 폴더 연결 버튼만 | 폴더 연결 → `마지막 호출: 폴더 연결 · 누른 횟수: 1회` |
| 다시 연결 필요 | 학습 노트 / 다시 연결 필요 / 다시 연결·연결 해제 | 다시 연결 → 1회, 이어서 연결 해제 → 마지막 호출이 연결 해제·2회 |
| 연결됨 | 학습 노트 / 연결됨 / 연결 해제 버튼만 | 연결 해제 → 해당 호출·1회 |
| 긴 이름 | 전체 이름이 잘리지 않고 줄바꿈 / 연결됨 | 좁은 화면에서도 가로 스크롤 없이 버튼 사용 |

- 같은 버튼을 다시 누르면 횟수가 1씩 늘어난다. 상태 선택을 바꾸면 호출 기록은 초기화된다.
- 실제 저장·권한을 처리하지 않으므로 버튼을 눌러도 선택한 연결 상태는 그대로다. 상태는 아래 예시 선택으로만 바뀐다.
- Tab으로 버튼에 이동하면 테두리가 보인다. Enter와 Space로도 호출 기록을 확인할 수 있다.
- 새로고침하면 미연결 예시와 빈 호출 기록으로 돌아간다. 서버·IndexedDB에 예시 상태를 저장하지 않는다.

### 코드 읽는 순서와 연결

아래 줄 번호는 표시 단위 구현 당시 기준이다. 이후 4번 단위에서 `disabled` 입력과 버튼 비활성화가 추가되어 `SourceFolderConnection.tsx`의 16줄 이후는 한 줄씩 내려갔다. 최신 연결 설명은 §6을 따른다.

1. [types.ts](../../apps/web/src/features/local-folders/types.ts) 3–6줄: 기존 `FolderConnectionView` 계약. `status`와 `folderName`만 전달한다. 이번 단위에서 변경하지 않았다.
2. [SourceFolderConnection.tsx](../../apps/web/src/features/local-folders/components/connection/SourceFolderConnection.tsx) 3–14줄: `import type`은 타입 검사에만 사용하는 가져오기다. `Props`는 컴포넌트의 입력이며 `view`와 조작 함수 3개를 받는다. `() => void`는 인자 없이 호출하고 반환값을 사용하지 않는 함수라는 뜻이다. 이 컴포넌트는 저장소나 연결 세션을 만들지 않는다.
3. 같은 파일 16–20줄: 내부 상태 이름을 화면 문구로 바꾸는 표다. 22줄의 함수 인자는 전달받은 `Props`를 이름별로 꺼낸다. 23줄의 `return`은 표시할 React 화면을 반환한다.

```tsx
title={view.folderName ?? "연결한 폴더 없음"}
<StatusLabel>{statusLabels[view.status]}</StatusLabel>
```

25줄의 `??`는 이름이 `null` 또는 `undefined`일 때 오른쪽 문구를 사용한다. 29줄은 현재 상태를 표에서 찾아 보여준다. 폴더 이름을 별도 상태로 복사하지 않으므로 입력값이 바뀌면 새 입력대로 표시한다.

```tsx
{view.status === "needs-permission" && <button type="button" className={actionClasses("primary")} onClick={onReconnect}>다시 연결</button>}
```

32줄의 `&&`는 조건이 맞을 때만 오른쪽 버튼을 표시한다. `onClick={onReconnect}`는 화면을 그릴 때 함수를 실행하는 것이 아니라 클릭할 때 호출하도록 넘긴다. 31줄은 연결, 33줄은 해제를 같은 방식으로 처리한다. 비동기 작업이 없으므로 이번 컴포넌트에는 `await`가 없다.

4. [source-folder-connection.module.css](../../apps/web/src/features/local-folders/components/connection/source-folder-connection.module.css) 1–6줄: 긴 이름 줄바꿈과 상태·버튼 정렬만 담당한다. 간격은 기존 토큰을 사용하고, 좁은 화면에서 왼쪽으로 정렬한다. 기존 `SettingRow`가 화면 폭에 따라 행을 세로로 쌓는다.
5. [FolderConnectionDemo.tsx](../../apps/web/src/prototypes/demo/scenes/FolderConnectionDemo.tsx) 9–21줄: 검토 전용 예시 4개와 선택 버튼. `satisfies`는 예시 데이터가 기존 표시 계약에 맞는지 TypeScript가 검사하게 한다. 24–26줄의 React 상태는 선택한 예시와 호출 기록만 보관한다.

```tsx
<SourceFolderConnection
  view={examples[example]}
  onConnect={() => record("폴더 연결")}
  onReconnect={() => record("다시 연결")}
  onDisconnect={() => record("연결 해제")}
/>
```

30–35줄에서 표시값과 함수를 실제 컴포넌트에 전달한다. **다시 연결 클릭 → SourceFolderConnection 32줄 → Demo 33줄의 함수 → 26줄 record → 36–37줄 호출 기록 갱신** 순서다. `previous => ...`는 직전 기록의 횟수에 1을 더하므로 반복 클릭도 누적된다. 실제 폴더 연결 성공을 만드는 코드가 아니다.

6. 기존 [scene-data.ts](../../apps/web/src/prototypes/demo/scene-data.ts)와 [SceneBody.tsx](../../apps/web/src/prototypes/demo/SceneBody.tsx)에 검토 화면을 등록했다. [SceneSurface.tsx](../../apps/web/src/prototypes/demo/SceneSurface.tsx)는 이 화면 전체를 읽는 live region을 제외하여 호출 기록만 안내하도록 했다.

재사용: `SettingRow`는 제목·설명·조작 자리, `StatusLabel`은 상태 표시, `actionClasses`는 버튼 스타일, `ScenarioControls`는 검토용 상태 전환을 담당한다. `PreviewButton` 자체는 비활성 시안 버튼이므로 가져오지 않고 그 파일이 내보내는 스타일 함수만 사용했다. `DemoButton`이나 scene 탐색·예시 데이터는 제품 표시 컴포넌트에 들어가지 않는다. 공통 요소가 현재 prototype 폴더에 있는 구조는 유지했으며 이번에 전체 공통 계층 이동을 하지 않았다.

### 실행한 검증과 한계

- web/domain/S0 TypeScript, web ESLint, 기존 Vitest 50개 모두 통과. Next production build 38페이지 통과.
- [브라우저 검증 스크립트](../../tests/browser/check-folder-connection-ui.mjs): 1440/1920/768/390px × 4개 입력 상태, 콜백 1회 전달·입력 유지·기록 초기화·가로 넘침·40/44px 버튼·Tab 순서/초점·Enter/Space·브라우저 예외를 **88개 확인 항목**으로 검사해 모두 통과했다. 88개의 서로 다른 사용자 시나리오라는 뜻은 아니다.
- [브라우저 실행 결과](../verification/source-folder-connection/checks.json), [데스크톱 재연결](../verification/source-folder-connection/1440-permission.png), [데스크톱 긴 이름](../verification/source-folder-connection/1440-long-name.png), [좁은 화면 재연결](../verification/source-folder-connection/390-permission.png), [좁은 화면 긴 이름](../verification/source-folder-connection/390-long-name.png).
- taste 소스 검사: 0 FAIL/0 WARN. 화면 검사: 0 FAIL/2 WARN. 승인된 `achromatic-ledger` 방향과 시스템 서체·기존 토큰을 유지했고 새 추첨은 하지 않았다. 시스템 서체 로딩 감지 경고는 외부 폰트를 도입하지 않고 기록했다. desktop의 43px 빈 간격 경고는 안내와 조작 행 사이의 기존 24px 간격+행 여백이며, 고정 높이로 비어 있는 패널은 아니다.
- 화면 관찰: 상태와 행동이 한 행에 있고 데이터와 호출 기록이 구분된다. 기존 880px 검토 면과 좌우 정렬을 유지했다. 임의 파일 수·진행률·성공 결과는 없다. 모바일은 행을 세로로 쌓고 긴 이름 전체를 줄바꿈한다. inspector가 생성한 3개 폭의 모든 스크린샷 및 상태 캡처 4개를 열어 확인했다. 글자 크기·여백의 편안함은 사용자 검토 대상이다.
- pnpm 실행은 현재 PATH에 없고 Corepack이 요청 버전을 캐시에서 찾지 못했다. 의존성을 설치하거나 바꾸지 않고 설치된 동일 검사 도구의 실행 파일로 검증했다. 제한 환경의 첫 browser 실행은 `Page.enable` timeout이었으며 격리 headless 브라우저의 확장 실행으로 검사했다. Enter 검증의 첫 실패는 CDP 입력에 Enter 문자 이벤트가 빠진 도구 문제였고, 실제 문자 이벤트를 보완한 뒤 통과했다.
- 독립 verifier 실행은 계정의 `gpt-5.5` 미지원으로 시작 실패했다. 독립 검증 완료로 주장하지 않으며 위 증거는 주 에이전트가 실행·확인했다.
- 실제 picker/권한/IndexedDB/계정/설정·파일 화면 통합은 이번 범위 밖이다. 텍스트 입력란이 없는 표시 단위이므로 한국어 IME 입력과 채팅 패널 보존 검증은 해당되지 않는다. 새로고침 초기화는 코드상 동작이며 별도 브라우저 자동 확인 항목에 포함하지 않았다. 정적 검토 화면에 Lighthouse를 실행하지 않았다.

검증 재현(프로젝트 루트, 서버 실행 중):

```powershell
node tests/browser/check-folder-connection-ui.mjs
node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p packages/domain/tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p tests/s0/tsconfig.json
```

web 폴더에서: `node node_modules/eslint/bin/eslint.js .`, `node node_modules/next/dist/bin/next build`.

이 절은 표시 단위 당시 기록이다. 후속 설정 연결은 아래 §6에 구현했다.

## 6. 설정 화면 실제 연결 — 이번 단위의 수용 기준

최신 개정: 실제 작업 경로와 시안을 분리했다. `/settings`에서 연결 기능을 바로 확인하며 기본/연결/데이터 시안 탭은 `/preview/screens/settings`에만 남겼다. [화면 경계·최신 검증](live-workspace.md)을 우선한다. 아래 최초 구현 검증의 탭/입력 보존 기록은 당시 화면의 이력이다.

- `/settings` 연결 탭에서 자료 폴더 한 개를 실제 브라우저 picker의 읽기 모드로 선택한다. 기존 `FolderConnectionSession`과 `IndexedDbHandleRepository`를 사용하며 본문 읽기·목록 탐색·서버 전송은 하지 않는다.
- 로그인 미구현 상태이므로 localhost에서만 개발용 고정 소유자와 별도 `moa-settings-development-v1` DB를 사용한다. 실제 사용자 계정 격리 완료로 보고하지 않는다. 원격 호스트에서는 기능을 비활성화한다.
- 준비 중은 미연결과 구분하고 버튼을 제공하지 않는다. 저장 핸들 복원 후 자동 권한 요청 없이 다시 연결 필요를 표시한다.
- 처리 중 중복 요청을 막는다. picker/권한 요청은 클릭 호출 안에서 첫 await 전에 실행한다. 취소·권한 거절·저장 실패 후 이전 표시를 보존하고 실패 원인을 확정할 수 없으면 단정하지 않는다.
- 해제 시작 시 메모리 연결을 즉시 비운다. 저장소 제거 실패 시 재선택을 막고 해제 재시도를 제공한다. 원본 파일과 브라우저 권한은 삭제하지 않는다.
- 설정 탭을 10회 전환해도 현재 연결·입력·진행 상태를 보존한다. 설정 화면 이탈 후 늦은 응답은 새 화면 상태에 반영하지 않는다.
- 표시 UI / React 수명주기 / 비동기 화면 상태 / 저장소 책임을 분리한다. 실패 테스트 → 구현 → 브라우저 검증 순서로 확인한다.
- 실제 저장소+OPFS와 주입한 picker/권한 응답으로 자동 검증한다. 실제 네이티브 선택창·권한 철회·완전 브라우저 재시작은 별도 검증이며 통과를 추정하지 않는다.
- production 기준으로 기존 6개 대표 경로의 전후 로딩·전송량·JS heap·long task를 3회씩 기록한다. 첫 실제 기능의 기준선이며 미구현 AI/서버 비용·field INP와 혼동하지 않는다.

### 직접 확인할 순서

이번 검증 서버는 `http://127.0.0.1:3001/settings`다. **연결** 탭을 연다. 다음 세션에 서버가 없다면 web 폴더에서 `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3001`로 빌드 결과를 연다. 개발 서버 3000과 3001은 서로 다른 origin이므로 연결 정보를 공유하지 않는다.

| 행동 | 기대 결과 |
| --- | --- |
| 처음 연결 탭 열기 | 저장 정보 확인 후 미연결. 폴더 선택창이 저절로 열리지 않음 |
| 폴더 연결 → 테스트 폴더 선택 | 실제 이름과 연결됨 표시. 원본 내용 읽기·변경·전송 없음 |
| 다른 폴더 선택 → 취소 | 기존 이름·상태 유지, 연결 미완료 안내 |
| 기본 탭과 연결 탭 오가기 | 연결 유지. 기본 탭의 입력도 보존 |
| 같은 주소에서 새로고침 → 연결 탭 | 이름은 복원되지만 다시 연결 필요. 자동 권한 요청 없음 |
| 다시 연결 → 읽기 권한 허용 | 연결됨 표시. 거절하면 다시 연결 필요 유지 |
| 연결 해제 | 미연결 표시. 새로고침 후에도 참조 없음, 원본은 그대로 |

테스트 폴더 예: `.taste-skill/s0-fixtures/source-a`. 실제 선택창·권한 동작은 사용자가 확인할 항목이며 아래 자동 검사에 포함하지 않았다. `D:/sabin/note`로 실패·쓰기 검증을 하지 않는다. 미지원 브라우저나 원격 주소는 이유를 표시하고 연결 버튼을 제공하지 않는다.

### 코드 읽는 순서 — 현재 책임별 위치

1. [settings/page.tsx](<../../apps/web/src/app/(workspace)/settings/page.tsx>)는 실제 연결 화면을 조합한다. 공통 layout의 Provider가 설정과 파일 화면 사이에서 연결 상태를 보존한다.
2. [SourceFolderSettings.tsx](../../apps/web/src/features/local-folders/components/connection/SourceFolderSettings.tsx)는 표시·이벤트·초점·라우팅을 담당한다. connect/reconnect의 성공 결과를 받은 뒤, 시작 화면이 아직 살아 있고 /files가 아닐 때만 이동한다. 복원·취소·실패·늦은 완료로 이동하지 않는다.
3. [use-source-folder-connection.ts](../../apps/web/src/features/local-folders/hooks/use-source-folder-connection.ts)는 controller 생성과 React 구독을 연결한다. useSyncExternalStore에는 상태 변경 때만 갱신하는 안정된 snapshot을 제공한다. localhost·브라우저 지원 확인과 소유자별 수명 정리도 이 경계에 있다.
4. [source-connection-controller.ts](../../apps/web/src/features/local-folders/store/source-connection-controller.ts)는 phase/view/pending/notice와 작업 성공 여부를 제공한다. action을 await보다 먼저 시작해 사용자 활성화를 유지하고, 중복·취소·실패·무효화된 완료는 false를 반환한다. 연결된 과거 view만 보고 이번 작업의 성공을 추측하지 않는다. controller는 URL이나 Next 라우터를 모른다.
5. [connection-session.ts](../../apps/web/src/features/local-folders/services/connection-session.ts)와 [handle-repository.ts](../../apps/web/src/features/local-folders/services/handle-repository.ts)는 읽기 권한·연결 세대·저장 결과와 IndexedDB/Web Locks를 담당한다. UI에서 이 구현을 복제하지 않는다.
6. [controller 테스트](../../apps/web/tests/local-folders/store/source-connection-controller.test.ts), [연결 브라우저 검사](../../tests/browser/check-settings-folder-connection.mjs), [이동 브라우저 검사](../../tests/browser/check-connection-navigation.mjs)를 함께 읽는다. 실패·취소·화면 이탈과 성공 이동을 각각 검증한다.

호출 흐름: **설정 클릭 → UI → controller → session → picker/권한 → repository → controller 성공 결과 → UI router.push('/files') → 목록 화면**. 연결 자체는 본문을 읽지 않으며 이동한 파일 화면이 직계 목록을 읽는다.

### 중요: 개발 전용 코드와 배포 전 교체

지금 보이는 ‘개발 검증용 로컬 연결’은 실제 로그인 구현 전의 임시 안내다. 해당 주석은 `rg -n 'TEMPORARY\(local-folder-dev\)' apps/web/src/features`로 찾는다. 안내만 지워서 제품 인증이 완료된 것처럼 보이게 하지 않는다.

| 위치·역할 | 지금 필요한 이유 | 교체·제거 완료 조건 |
| --- | --- | --- |
| `providers/SourceFolderProvider.tsx`의 `developmentOwner` | 로그인 없이 연결 동작을 검토하기 위한 고정 소유자 | 실제 인증 세션의 사용자·workspace로 교체. 로그아웃·계정 전환·늦은 응답의 격리 검증 |
| 같은 파일의 개발 안내 문구 | 현재 연결이 실제 로그인과 연결되지 않았음을 알림 | 위 인증 전환과 저장소 전환을 검증한 뒤 제거 |
| `SettingsPrototype.tsx` 하단 안내 | 연결 기능과 아직 남은 시안의 범위를 구분 | 실제 인증 연결 후 개발 문구를 교체. 다른 기능의 시안 표시는 해당 기능 구현까지 유지 |
| hook의 `moa-settings-development-v1` | 개발 핸들을 향후 제품 데이터와 구분 | 제품 소유자별 저장소 정책으로 교체. 개발 핸들을 자동 이관하지 않고 새 연결을 받음 |
| hook의 localhost 제한 | 고정 개발 소유자가 원격 서비스에서 쓰이는 것을 차단 | 실제 인증·소유자 격리를 검증한 뒤 교체. 이 조건만 먼저 삭제하지 않음 |
| hook의 secure context/API 지원 검사 | 브라우저가 제공하지 않는 기능의 실행 방지 | **제품에도 유지**. localhost로 열라는 임시 문구만 실제 배포 환경에 맞게 변경 |
| 권한 거절·저장 실패·재시도 안내 | 실제 브라우저에서도 발생하는 실패 대응 | **제품에도 유지**. 개발 안내와 함께 삭제하지 않음 |

2026-10-28 제품 연결 UI가 사용하는 SettingRow·StatusLabel·actionClasses를 components/ui로 분리했다. 제품은 prototypes를 import하지 않으며 시안과 /preview는 승인된 디자인 검토 기록으로 보존한다. 지속 규칙은 [개발 지침](../guidelines.md)을 따른다.

### `.test.ts`를 읽는 방법

`source-connection-controller.ts`는 앱에서 실행하는 코드이고, `source-connection-controller.test.ts`는 그 코드가 약속을 지키는지 자동으로 확인하는 TypeScript 파일이다. `.test`는 테스트 실행기 Vitest가 찾는 이름 규칙이다. 테스트를 돌릴 때 실행되며 앱의 화면 기능으로 가져오지 않는다.

| 표기 | 읽는 뜻 |
| --- | --- |
| `describe(...)` | 관련 검사들의 묶음 |
| `it("...", ...)` | 이름에 적힌 동작 하나를 검사 |
| `expect(실제값).toBe(기대값)` | 실제값과 기대값이 같은지 확인 |
| `toMatchObject(...)` | 큰 객체에서 이번 주장에 필요한 항목만 비교 |
| `vi.fn(...)` / `mockRejectedValueOnce(...)` | 외부 응답을 대신하고, 다음 호출에 실패 등을 재현 |
| `await` | 비동기 작업이 끝난 뒤 다음 확인으로 진행 |
| `deferred()` | 응답을 보류했다가 원하는 시점에 성공·실패시켜 순서 문제를 재현하는 이 파일의 보조 함수 |

가장 먼저 **취소 시 기존 연결 유지** 테스트를 읽으면 된다. 준비 단계에서 실제 controller와 session에 가짜 폴더를 연결한다. 실행 단계에서 다음 picker 호출만 취소로 응답하게 한다. 확인 단계에서 기존 이름·연결 상태가 유지되고 원시 오류의 개인 경로가 노출되지 않는지 비교한다.

```ts
// 실행: 다음 폴더 선택을 취소한 상황을 만든다.
picker.mockRejectedValueOnce(new DOMException("private path", "AbortError"));
await controller.connect();

// 확인: 실제 controller가 만든 상태를 검사한다.
expect(controller.getSnapshot()).toMatchObject({
  view: { status: "connected", folderName: "자료" },
  notice: { state: "attention" },
});
expect(JSON.stringify(controller.getSnapshot())).not.toContain("private path");
```

가짜인 것은 picker·권한 응답·저장소이며, 성공 화면을 반환하는 controller 자체를 가짜로 바꾸지는 않는다. 이 테스트는 **취소 처리 규칙**을 검증한다. 실제 OS 선택창이나 브라우저 권한이 정상이라는 증거는 아니다. 실제 IndexedDB·Web Locks의 연결은 별도 브라우저 검사로 확인했으며, 그 검사도 picker/권한 응답은 주입한다. 테스트 개수와 외부 동작 검증 범위를 혼동하지 않는다.

### 최초 연결 단위의 검증 기록과 경계

- 단위 테스트 61개(신규 11), web/domain/S0 타입 검사, web lint, production build 38페이지 통과.
- 실제 IndexedDB·Web Locks·OPFS와 합성 picker/권한을 사용한 브라우저 확인 기록 30개(반복 동작 측정 1개 포함), 최종 production에서 실패 0. 1440/1920/768/390px, 키보드 재연결, 10회 탭 왕복과 합성 한국어 조합 이벤트, 로딩 실패/권한 거절/저장 실패/해제 재시도를 확인했다.
- 기존 행·버튼·상태·알림·토큰을 재사용했다. 최종 연결 화면에 taste 앱 probe/judge를 실행한 네 폭 모두 0 FAIL/0 WARN. 긴 이름·실패·미지원 화면 캡처 8개를 열어 확인했다. 네이티브 OS IME와 전체 스크린 리더 인증은 아니다.
- [실행 증거·캡처·성능 전후 표](../verification/settings-folder-connection/README.md). 설정 초기 전송은 199.6→202.9KiB, 전체 배포 정적 자산은 +9.21KiB. 채팅 LCP는 84→248ms로 변동이 커 원인 분리 전 회귀 없음으로 판정하지 않았다. 성능 최적화 완료를 주장하지 않는다.
- 실제 네이티브 선택창·권한 철회·완전 브라우저 재시작, 실제 로그인, 다른 탭 계정 동기화, 파일 화면 상태 공유는 미완료다. 이번 개발용 연결을 서비스 인증으로 사용하지 않는다.
- 공식 API 확인: [MDN picker](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker), [MDN requestPermission](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemHandle/requestPermission), [Chrome의 핸들 저장·권한 설명](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access). 문서의 권한 유지 가능성과 무관하게 이 제품은 복원 후 명시적 재연결을 요구한다.

위 내용은 최초 설정 연결 당시 기록이다. 후속 공유 단위는 아래 §7을 따른다.

## 7. 작업 화면의 연결 상태 공유 — 2026-10-27

2026-10-28 후속: 아래는 연결 공유를 완료한 당시 범위다. 현재 내 폴더의 목록 미구현 안내는 실제 탐색 화면으로 바뀌었다. 연결 조작은 설정 아이콘의 dialog에서 재사용하고, 최초 목록 읽기는 read 권한 조회를 수행한다. 권한 요청/picker/저장소 재복원과 구분한다. 최신 동작과 검증은 [목록 명세](source-folder-listing.md)와 [검증 기록](../verification/source-folder-browser/README.md)을 따른다.

사용자 진행 지시로 이번 단위를 시작한다. §6의 ‘설정 화면 이탈 시 중지’는 **공통 작업 영역 이탈 시 중지**로 바뀐다. 실제 계정·파일 목록·다른 브라우저 탭의 상태 동기화는 이번 범위가 아니다.

- `/`, `/files`, `/settings`의 공통 layout에서 기존 연결 hook을 한 번만 실행한다. `/files`와 `/settings`는 같은 표시값·진행·오류·행동을 공유한다. 화면별 controller 복제나 전역 singleton은 만들지 않는다.
- 설정에서 연결한 뒤 내 폴더로 이동하면 이름과 연결됨이 유지된다. 대화 화면 경유/뒤로·앞으로 이동도 유지하고 자동 picker/권한 요청·저장소 재복원은 하지 않는다.
- 내 폴더에서도 연결·재연결·해제·실패 재시도가 가능하다. 조회하지 않은 파일 목록·개수·성공 데이터를 만들지 않고 파일 탐색 미구현을 표시한다.
- 연결/해제 처리 중 화면 이동해도 같은 작업을 계속 표시하고 중복 요청은 막는다. 취소·저장 실패 시 이전 연결 보존, 해제 실패 시 재선택 금지와 재시도 상태를 양쪽에서 유지한다.
- 새로고침은 별도 수명이다. 핸들은 저장소에서 복원하지만 자동 권한 요청 없이 다시 연결 필요로 표시한다.
- 시안·로그인·가입 화면은 provider 밖이다. 이 경계를 떠날 때 기존 stop/늦은 결과 차단을 적용하고 시안 진입은 실제 저장소를 읽지 않는다. 로그인 구현 전 localhost 고정 개발 소유자·별도 DB와 교체 주석을 유지한다.
- 실패 확인: 공유 전 브라우저 검사에서 `/files` 연결 표시 부재 확인 → 최소 구현 → 실제 IndexedDB/Web Locks/OPFS와 주입 picker/권한으로 회귀·경로 이동 검사. 기본 단위 테스트의 계정 변경/늦은 결과 차단도 재실행한다.
- 검증: 타입(web/domain/S0)·린트·build, 키보드·1440/1920/768/390px, 10회 화면 왕복, 미지원/저장 실패·취소·복원. 텍스트 입력이 없으므로 IME는 해당 없음. 사이트 대표 6개 경로는 production 전후 각3회, 새 공유 이동 시간과 JS heap은 별도 기록한다.

성공 기준은 실제 두 화면에서 위 동작을 직접 확인할 수 있는 것이다. 구현과 검증을 완료했으며 [완료 근거와 코드 해설](../verification/shared-folder-connection/README.md)에 기록했다. 새 `SourceFolderProvider`로 개발 소유자 위치가 옮겨졌고 기존 hook/controller/session/repository는 변경하지 않았다. 위 §6의 옛 위치·화면 이탈 설명보다 §7을 우선한다.
