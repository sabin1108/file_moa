# 경로 중복·전환·길게 누르기·상위 이동 — 2026-11-02

요구사항 원장18~23과 [ACTION-012~017](../../specs/file-actions-ux.md)을 구현/확인했다. 덮어쓰기 상태 질문은 답변 대상으로 처리했으며 복구 보관함을 구현했다고 표시하지 않는다.

## 원인과 변경

목적지의 `DestinationPathForm`과 `NewEntryForm`은 같은 형제 위치에서 동일한 JSON 경로를 key로 썼다. 실제 Chromium에서 첫 하위 폴더 진입만으로 입력 개수 검사가 [실패](red/checks.json)했다. key에 path/creation 접두어를 붙여 서로 다른 영역임을 보장하고, 현재 요청 경로가 바뀔 때 입력 초안을 갱신하도록 유지했다. 최종 검사는20회 왕복의40개 위치에서 입력/생성 폼 개수와 경로를 확인한다.

단계는180ms 내용 등장과 dialog 높이 보간으로 이어진다. `useDialogStepTransition`은 DOM 표시만 다루며 실행/검사 상태나 권한 요청을 지연하지 않는다. 폴더 목록에도 짧은 전환을 적용하며 reduced-motion에서는 없앤다. `FolderPathTree`는 각 폴더와 파일을 별도 줄·깊이·연결선으로 표현하고 긴 경로의 들여쓰기 폭을 제한한다.

길게 누르기는650ms다. `useLongPressSelection`이 누르는 동안에만 취소 리스너를 등록하고10px 초과 이동·스크롤·blur·pointercancel·언마운트에 취소한다. 진행선과 기존 체크박스/선택 버튼을 함께 제공한다. 지원하지 않는 파일 형식도 선택할 수 있다. 폴더는 선택 표시가 가능하지만 재귀 복사/이동을 지원하지 않으므로 폴더가 포함되면 작업 버튼을 막고 이유를 보여준다. controller에도 같은 진입 제한을 둬 폴더를 조용히 제외하고 파일만 처리하지 않는다. 표시된 파일 전체 선택은 기존 파일 범위를 유지한다.

실제 합성 터치에서 선택 도구가 생기며 행이 움직이고 release 후 click이 다른 파일을 여는 문제를 추가로 발견했다. 한 번의 후속 포인터 click을 전역 capture에서 차단하고 다음 주 포인터 입력/정해진 정리 시점에 해제했다. 키보드 click은 차단하지 않는다. 독립 읽기 검토의 비주 포인터 간섭도 보완했다. 방문 기록에는 선택 당시 kind를 메모리로 보관하고 새로고침/뒤로 가기에서 종류가 바뀐 항목은 선택에서 제외한다.

상위 폴더 버튼은 현재 목록 제목 앞에 위쪽 화살표와 실제 부모 이름을 보여준다. 목적지에서도 같은 의미로 표시하고 각 상위 경로를 직접 누를 수 있다. 모바일에서도 중간 경로를 숨기지 않는다. 기존 열린 폴더 재클릭 동작은 유지한다.

## 검증

- 최종 `pnpm check`: **341개/32파일**, 타입·lint·서버 경계21·구조25web/6domain/3layout·production43페이지 통과. 폴더 선택/혼합 계획 차단/종류 변경/방문 복원6개를 추가했다. 초기 폴더 선택 테스트2개 RED를 확인한 뒤 구현했다. 기존 ‘폴더 선택 불가’ 기대값은 최신 요청에 맞춰 명시적으로 변경했다.
- [새 실제 브라우저66개](browser/checks.json):20회 목적지 왕복, 조상 이동, 폴더 깊이,390/768/1440/1920px, 단계/reduced-motion, mouse/touch hold, 진행선, 이동/blur 취소, release 후 열기/메뉴 차단, 다음 우클릭 허용, 비주 포인터, 지원하지 않는 미리보기 형식의 선택, 키보드 체크박스, 폴더 선택의 실행 차단, 원본 보호.
- [기존 화면69개](actions/checks.json), [복사25개](copy/checks.json), [폴더 작업57개](workspace/result.json), [계획30개](plan/checks.json) 통과. 깊이별 하위 ol을 추가했으므로 계획 행 검사 selector는 직접 자식 ol로 한정했고 경로는 트리의 접근성 이름으로 검증한다.

위 기존 회귀는 마지막 contextmenu 정리 보완 직전 실행이다. 그 보완 후 전체341개와 새 브라우저66개를 다시 통과했고 최종 성능은 같은 최종 빌드의 두 폭을 측정했다.
- [390px 깊은 트리](browser/deep-tree-390.png), [1440px](browser/deep-tree-1440.png), [상위 이동](browser/parent-390.png), [선택](browser/selected-390.png)를 직접 확인했다. 정적 taste 검사12파일 FAIL0/WARN1(실제 dialog 그림자). 계획 DOM probe FAIL0, 데스크톱 unused-canvas2건은 중앙 modal과 배경 작업면을 함께 측정한 기존 경고다.
- [성능](performance.md): 이전 파일 작업 단계 UI를 기준선으로6경로×2폭×3회 비교. 브라우저 기능 검사에 포함된 계획 시간/heap은 별도 합성 관측이며 field INP나 메모리 누수 없음의 증거가 아니다.

독립 native architect 읽기 검토에서 다중 포인터와 방문 종류 변경을 발견해 보완했다. executor 역할은 설치 모델 미지원으로 시작하지 못했으며 구현은 주 에이전트가 수행했다. 공식 워크플로 승인 영수증으로 취급하지 않는다.

## 읽을 순서와 재현

명세 → `DestinationFolderPicker` key → `FolderPathTree` → `useDialogStepTransition` → `useLongPressSelection` → `SourceFileRow`/`SourceFolderRow` → `FolderListingView`/`FileSelectionToolbar` → listing/plan/navigation controller → 회귀 테스트 순서다. 파일 접근 서비스와 충돌/복구 계약은 바꾸지 않았고 의존성을 추가하지 않았다.

`pnpm check`, `pnpm --filter @personal-ai/web start --port 3011` 후 `pnpm exec node tests/browser/check-folder-navigation-ux.mjs http://127.0.0.1:3011 <출력폴더>`로 재현한다. 격리 Chromium에만 --no-sandbox/--disable-gpu를 적용한다. 기존 스크립트 wrapper 조건은 [이전 보고](../file-actions-ux/README.md)를 따른다.

OS 권한창/실제 외부 디스크/물리 터치·펜·휠/실제 IME/스크린리더 전체 인증은 미검증이다. CDP 합성 터치와 다중 포인터 회귀를 실물 모바일 인증으로 확대하지 않는다. 복구 보관함·백업 검증·덮어쓰기·실제 이동·폴더 재귀 작업은 미구현이다.
