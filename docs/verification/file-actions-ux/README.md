# 파일 작업·목적지·단계 흐름 검증 — 2026-11-02

파일 선택에서 복사/이동을 바로 고르고, 목적지 경로 버튼 하나로 폴더 탐색과 직접 입력을 연다. 복사는 목적지·계획 → 검사 → 실행/결과로 진행하며 완료 확인 뒤 목적지 목록으로 이동한다. 수동 분류 메뉴는 제거했고 실제 이동은 계획 검토까지만 제공한다. [명세](../../specs/file-actions-ux.md), [복구 보관함 후속 계획](../../specs/recovery-vault.md).

## 변경과 읽을 순서

`FileSelectionToolbar` → `SourcePlanController` → `SourcePlanDialog` → `PlanDestinationInput`/`DestinationFolderPicker`/`DestinationPathForm` → `CopyInspectionView`/`FileChangePlanView`/`CopyExecutionView` → `SourceFolderBrowser` 순서다. `FolderWorkspaceFrame`은 열린 폴더 재클릭을 상위 목록 이동으로 연결한다. `usePlanDialogScroll`은 팝업 휠과 배경 잠금만 맡는다.

단계 상태는 기존 검사/실행 상태에서 계산한다. 완료 목적지는 controller가 성공·기록 확정을 확인하고 reset 전에 복사해 돌려주며, 탐색과 제목 초점은 listing이 맡는다. 경로 직접 입력은 후보 탐색이며 ‘이 폴더 선택’을 눌러야 계획 목적지로 확정한다. 새 의존성이나 범용 작업 실행기를 추가하지 않았다. 기존 copy 서비스의 충돌 차단은 유지한다.

검사는 실제 내용 읽기·용량·변경·이름 충돌을 보여주며 기술 정보는 접어 둔다. 예상 결과는 파일별 출발/도착 폴더 구조로 표시한다. 실행 중에만 CSS 애니메이션을 표시하고 reduced-motion에서는 정지한다. 완료 화면의 검토한 계획은 접힌 상태로 두어 확인 버튼에 쉽게 도달하게 한다.

## 실행 증거

- `pnpm check`: **335개 테스트/31파일**, web/domain 타입, lint, 서버 경계21개, 구조25web/6domain/3layout, production43페이지 통과. 이번 controller 추가4개는 직접 복사/이동 선택, 명시적 목적지 확정, 완료 경로의 일회성 소비와 성공 조건을 검증한다.
- [새 화면69개](final/browser/checks.json): 390/768/1440/1920px, 헤더/생성/목록/배경 휠, 목록 끝, 배경 잠금/복원, 직접 작업, 분류 부재, 단계 전환, 기술 정보, reduced-motion, Tab/Escape, 이전 목록 복귀. 추가390×500px 짧은 목록과 복사 진입 거절 후 계획 재검토를 포함한다.
- [실제 복사25개](final/copy/checks.json): 명시적 실행 제스처, 원본 유지, 기록/재연결/현재 내용 대조, 4×16MiB 복사와 hash 일치, 완료 시 입력 숨김, 검토한 계획 접힘, 확인 후 목적지 이동/제목 초점.
- [폴더 작업57개](final/workspace/result.json), [목적지29개](final/destination/checks.json), [검사27개](final/inspection/result.json), [계획30개](final/plan/checks.json). 이전 브라우저 스크립트도 통합 경로 선택과 단계 화면으로 갱신했다. 계획의 수동 분류 시나리오는 메뉴 부재와 파일/폴더 충돌 시나리오로 교체했고 순수 분류 규칙 테스트는 보존했다.
- 계획 검사는 잘못된 상대 경로, 합성 IME Enter, 취소 후 늦은 응답, 권한 상실, 100/1,000개 계획을 포함한다. 검사 검증은 실제 Worker hash와 독립 Node SHA-256 비교, 취소·오류·변경·충돌·100개/64MiB/한도 초과를 포함한다. 개인 파일은 사용하지 않았다.

명세→실패 테스트→구현 순서를 적용했다. 스크롤 추가 회귀의 [수정 전 실패](regression-red/checks.json)는48px짜리 단일 폴더 목록에서 휠을 가로채 팝업도 움직이지 않던 상태다. 이제 목록에 실제 넘침이 있고 화면에 보일 때만 폴더를 스크롤하며 나머지는 팝업 자체가 휠을 받는다. 배경으로 전달하지 않는다.

독립 native architect의 읽기 검토에서 위 짧은 목록 문제와 실행 진입 예외 뒤 재검사 경로 부재를 발견해 수정했다. 예외로 아직 실행 결과가 없는 경우에만 `계획·검사 다시 확인`을 제공해 승인을 폐기한다. 이미 항목 결과가 있는 부분 실패를 자동 재실행하지 않는다. 공식 Ralplan 합의나 OS 파일 시스템 안전성 인증으로 보고하지 않는다.

## 시각 확인

[목적지](final/browser/destination-1440.png), [폴더 구조](final/browser/expected-tree-1440.png), [390px 검사](final/browser/inspected-plan-390.png), [390px 완료](final/copy/copy-result-390.png)를 직접 확인했다. 자동 넘침 검사는 네 폭을 모두 포함한다. 검사 상세의 숨김 여부는 `checkVisibility()`로 검사한다. 닫힌 details 자식도 사각형을 반환할 수 있어 `getClientRects()`만으로 보임을 판정하던 테스트를 고쳤다.

taste 소스 검사10파일: **0 FAIL/1 WARN**. 경고는 실제 native dialog의 그림자이며 오버레이 구분 용도다. 실제 DOM probe/judge는 목적지/계획 화면에서 FAIL0, 1440/1920px `unused-canvas` 경고를 남겼다. 배경 작업면과 중앙 modal의 경계를 한 평면으로 계산한 결과이며 스크린샷에서 modal 좌우 간격이 같음을 확인했다. 이 경고를 없애려고 작업창을 가로로 늘리지 않았다. 최초 전환 중 색을 읽던 대비 경고는 유한 CSS 전환 종료 후 다시 측정해 해소됐으며 충돌/오류의 실제 글자·아이콘 대비도 검사했다.

## 재현과 한계

`pnpm check` 후 `pnpm --filter @personal-ai/web start --port 3011`. 새 검사는 `pnpm exec node tests/browser/check-file-actions.mjs http://127.0.0.1:3011 <출력폴더>`, 복사는 `check-copy-execution.mjs`에 같은 인자를 사용한다. 기존 세부 스크립트는 동일 base/out 인자를 받으며 폴더 작업만 out/base 순서다.

이 환경의 격리 Chromium에만 `--no-sandbox --disable-gpu`를 사용했다. 기존 스크립트는 로컬 `.omx/run-copy-browser.mjs <스크립트> <인자…>` wrapper로 해당 옵션을 전달한다. wrapper가 없는 환경은 기본 Chromium 실행을 먼저 사용한다. 설치된 skill이나 사용자의 브라우저 설정을 변경하지 않았다.

OPFS/Worker/실제 UI 실행 증거다. 네이티브 OS 폴더 선택·권한창, 외부 프로그램의 동시 변경, 물리 IME/휠/터치, 실물 모바일, 전체 스크린리더 검증은 포함하지 않는다. [성능 원자료와 한계](performance.md)는 기능 통과와 구별한다.

## 남은 범위

같은 이름 계속/중단·백업 후 덮어쓰기, 최초 복구 보관함 연결, 복원/보존 기간/즉시 삭제는 **계획만 작성했고 미구현**이다. 복구본 검증 전에 덮어쓰지 않는 순서와 실패 테스트를 후속 명세에 기록했다. 현재 이름 충돌은 계속 차단된다. 실제 이동·챗봇 분류 실행도 미구현이다.

요구사항 원장: `E:/memory/chatbotfolder/Requirements/요구사항.md`. 요청대로17개 항목을1~3줄로 기록했으며 추가는 누적하고 취소는 `{취소됨}`으로 남긴다. 이 원장은 요구사항이고 완료 목록이 아니다.
