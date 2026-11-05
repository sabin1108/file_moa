# 상위 이동·선택·팝업 안정성 검증 — 2026-11-03

사용자는 위치/부모 이름 설명이 아니라 상위 이동 조작의 시각적 형태를 바꾸라고 정정했다. 이동·복사 팝업의 깜빡임과 뻑뻑함을 우선 해결하고 기록된 다음 작업을 이어가라고 했다.

## 변경과 원인

- `DestinationPickerController.show()`가 close→open을 게시하며 이전 목록을 비웠다. 열림/마지막 목록을 유지하는 loading 전이로 변경했다. 오류는 이전 목록과 실패한 요청 경로를 구별하고 확정/생성은 차단한다.
- 경로별 key로 입력과 목록을 교체하고180ms opacity(.45→1)/translate 효과를 다시 실행했다. 경로 입력/목록 DOM을 보존하며 값만 동기화한다. 생성 폼의 위치별 수명과 취소는 유지한다.
- 단계 key·height 애니메이션을 제거하고 dialog 상단 위치를16px로 고정했다. 검사/복사 진행 표시와 키보드 초점 계약은 유지한다. 쓸모없어진 `use-dialog-step-transition.ts`를 삭제했다.
- `FolderUpButton`을 주 목록과 목적지 경로 아래에 재사용한다. 넓은 이동 행과 꺾인 위쪽 화살표로 조작을 드러낸다. 부모 이름 안내만 늘리는 수정과 구분한다.
- 선택 문구가 새 줄을 만들던 파일/폴더 행은 오른쪽 종류 칸에 상태를 표시한다. 행 높이와 아래 항목의 좌표를 유지하고 선택 배경은 즉시 반영한다.

## 실행한 검증

1. controller 신규 회귀는 이전 코드에서1개 실패(열림/목록 보존), 수정 후10개 통과. 전체 `pnpm check`: **355개/33파일**, 타입·lint·서버 경계21개·구조 검사·43페이지 빌드 통과.
2. [최종 상호작용52개](after/checks.json):20회 checkbox 전환의 모든 행 좌표 유지, 입력 DOM 유지, 느린 읽기/실패/재시도, 복사·이동 팝업, Escape 초점 복귀,390/768/1440/1920px, 원본 무변경.14개350ms 프레임 관측도 함께 저장했다.
3. [기존 탐색66개](navigation/checks.json), [파일 작업69개](actions/checks.json), [실제 복사25개](copy/checks.json) 통과. 합계212개 브라우저 확인이며 독립 업무 시나리오212종이라는 뜻은 아니다. copy는 OPFS 합성 대상에 실제 쓰기를 실행했고 원본 보존을 검사했다.
4. [이전 프레임](before/checks.json)은 opacity 최저.45, 입력 DOM 교체, 검사 단계의 dialog 상단 최대76.27px 이동을 기록했다. 최종14개 관측은 전체 영역 opacity1, 입력 제거0, 관측 중 dialog 상단 이동0이다. 이를 전체 체감/field INP 개선율로 확대하지 않는다.
5. [성능](performance.md):6경로×2폭×3회 전후 원자료. 수정 전 소스 hash와 실행 중 이전 빌드의 차이, 병렬 브라우저 간섭이 있던 첫 after 측정과 후속 단독 조건을 구분한다.

## 화면 판단

기존 `achromatic-ledger`/시스템 서체/팔레트를 유지했다. 새 스타일 추첨이나 이미지 자산은 없다. 화면의 질문은 ‘위 폴더로 어떻게 돌아가고 어느 폴더를 선택하는가’다. 두 탐색 면의 동일한 이동 행이 제품의 폴더 계층과 연결된다.

최종 picker4폭·주 목록4폭 캡처를 직접 확인했다. 이동 행은 좌우 경계에 맞고390px에서도 부모 이름과 행동을 함께 읽을 수 있다. 첫 시각 점검 후 목적지 이동 행을 새로 만들기 아래에서 경로 바로 아래로 올렸다. 샘플은 격리 OPFS fixture에만 있으며 제품에 추가하지 않았다. 주 목록의 빈 미리보기 공간은 기존 미선택 상태이며 이번 요청으로 재설계하지 않았다.

taste 소스6파일 검사0 FAIL/1 WARN(실제 dialog 그림자). DOM 측정의 raw 결과는 `after/checks.json` visual에 보존한다. 페이지 기준 `no-title`4건과 `off-centre`3건은 h2로 이름 붙인 native modal 뒤의 기존 작업면을 페이지로 측정한 결과다. 이 컴포넌트 작업에서는 modal의 aria-labelledby·좌우 여백·가로 넘침을 직접 확인했다. `unused-canvas`2건도 기존 modal/배경 복합 측정 경고다. 전체 페이지 inspector 통과로 보고하지 않는다. 실제 첫 사용자 이해도와 물리 입력은 별도 확인이 필요하다.

## 코드 읽기 순서

프로젝트 루트 기준:

1. `docs/specs/folder-interaction-stability.md`: 정정과 수용 기준.
2. `apps/web/src/features/local-folders/components/listing/FolderUpButton.tsx` 및 CSS → `FolderListingView.tsx`: 공통 이동 형태와 목록 배치.
3. `components/plan/DestinationFolderPicker.tsx`, `DestinationPathForm.tsx` → `store/destination-picker-controller.ts`: 보존된 DOM/값/지연 안내와 읽기 수명.
4. `components/plan/SourcePlanDialog.tsx`, 관련 CSS → `SourceFileRow.tsx`, `SourceFolderRow.tsx`, 선택 CSS: 팝업/선택 좌표 안정화.
5. `apps/web/tests/local-folders/store/destination-picker.test.ts`, `tests/browser/check-folder-interaction-stability.mjs`: 전이·프레임·입력·지연 실패·좌표 근거.

서비스 본문/실제 copy 알고리즘은 변경하지 않았다. 의존성 추가0. 저장소는 전체 untracked 상태이며 이 문서를 commit/PR/배포 근거로 삼지 않는다.

## 이어서 구현한 복구 보관함 기반

[명세](../../specs/recovery-vault-foundation.md), `lib/recovery-vault.ts`, `services/recovery-vault.ts`와12개 테스트를 추가했다. 미구현 import 실패를 확인한 뒤 구현하고 전체355개에 포함해 검증했다.8KiB·엄격 UTF-8·owner/schema·재조회 identity/metadata/bytes·권한/취소 경계를 검사한다. 실제 서비스를 실행하고 파일 시스템 경계는 합성했다. native explore의 읽기 검토에서도 변경/취소 경계 결함이 발견되지 않았다. executor는 설치 모델 미지원으로 시작하지 못해 주 에이전트가 구현했다.

이 결과는 **식별 기록 검증·읽기 기반**이며, 보관함 선택/생성/IndexedDB/UI·위치 포함 관계 검사·실제 백업/덮어쓰기·복원/삭제는 미구현이다. 보존 기간/자동 삭제 기본값을 정하지 않았다. 다음 단위는 위치 검증과 명시적 최초 생성/연결이며 이후 백업 검증을 연결한다.

## 재현·한계

`pnpm check` → `pnpm --filter @personal-ai/web start --port 3011` → `pnpm exec node tests/browser/check-folder-interaction-stability.mjs http://127.0.0.1:3011 <out>`.

나머지는 `check-folder-navigation-ux.mjs`, `check-file-actions.mjs`, `check-copy-execution.mjs`. 격리 Chromium만 `--no-sandbox --disable-gpu`; 사용자 브라우저/skill 설치를 수정하지 않는다. 성능은 `tests/performance/measure-isolated-settings.mjs before|after <base> <out> 1440|390`.

OS 권한창·실제 외부 디스크 경쟁·물리 IME/키보드/휠/터치·실물 모바일·전체 스크린리더 인증·field INP는 미검증이다. 현재 실파일 이동과 덮어쓰기 실행은 계속 제공하지 않는다.
