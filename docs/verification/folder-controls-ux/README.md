# 목적지 선택·새로고침 UX 검증

2026-10-30. 사용자가 지적한 목적지 선택의 불명확한 조작과 파일 목록 새로고침의 화면 흔들림을 수정했다. memory 문서는 수정하지 않았다.

## 문제 → 명세 → 실패 → 수정

목적지의 `연결 폴더`는 최상위 복귀였지만 이름이 모호했고, 선택 버튼은 비활성 입력 폼 아래의 목록 끝에 묻혔다. 새로고침은 toolbar에 취소 버튼과 목록 위 pending 안내를 추가했다. [명세](../../specs/folder-controls-ux.md)를 먼저 작성하고 [브라우저 수용 검사](../../../tests/browser/check-folder-controls-ux.mjs)를 이전 production에 실행했다. [수정 전 결과](before/checks.json)는 당시 32개 중 30개가 실패했고, 네 화면 폭 × 각 3회에서 갱신 중 첫 행/toolbar 좌표의 최대 변위는 90.921875px였다. 이후 추가한 긴 이름·SVG 검사는 최초 실패 실행에 포함되지 않는다.

리뷰 순서와 변경 책임:

1. [FolderListingView](../../../apps/web/src/features/local-folders/components/listing/FolderListingView.tsx), [전용 CSS](../../../apps/web/src/features/local-folders/components/listing/source-folder-browser.module.css): 동일 경로 갱신을 표시 상태에서 판별해 기존 항목 수 자리에 진행 상태를 표시한다. 새로고침↔읽기 취소는 같은 44px 버튼이다. 최초 읽기·다른 경로·오류/권한/부분 목록 안내는 유지한다.
2. [Icon](../../../apps/web/src/components/ui/Icon.tsx): retry를 viewBox 안의 단일 원형 화살표로 정리했다. [SourceFolderBrowser](../../../apps/web/src/features/local-folders/components/listing/SourceFolderBrowser.tsx): 비동기 완료 뒤 필요한 초점 복구에 preventScroll을 적용했다.
3. [DestinationFolderPicker](../../../apps/web/src/features/local-folders/components/plan/DestinationFolderPicker.tsx), [CSS](../../../apps/web/src/features/local-folders/components/plan/destination-folder-picker.module.css): 최상위 이름을 경로 복귀 조작으로 사용하고 현재 폴더 확정 버튼을 목록 위에 배치한다. 목적지 이름·명시적 행동·check 아이콘으로 의미를 전달하며 색만으로 전달하지 않는다. 기존 중첩 패널 테두리와 하단 중복 설명을 제거했다.
4. [SourcePlanDialog](../../../apps/web/src/features/local-folders/components/plan/SourcePlanDialog.tsx): 탐색 중 입력·생성 조작을 hidden 처리하며 DOM/입력은 보존한다. controller·파일 접근 계층·원본 권한은 바꾸지 않았다.
5. [목적지 회귀](../../../tests/browser/check-destination-picker.mjs): 실제 표시 이름이 바뀐 조작의 selector만 새 접근 가능한 이름으로 맞췄다. 키보드·취소·실패 계약은 유지한다.

## 실행 결과

- `pnpm check` 통과: 16파일·171테스트, 타입·lint, 서버 경계 21개, 웹/도메인 import 25/6개·배치 3개·실제 도메인 경계, production 43페이지 빌드.
- [수정 후 UX 검사](after/checks.json) **35개 통과**. 네 화면 폭(390/768/1440/1920) × 각 3회 갱신에서 동일한 기존 행/toolbar/스크롤 좌표의 최대 변위 **0px**. 관찰한 불변 데이터 갱신의 좌표이며 새 파일 추가/제거에 따른 행 수 변화나 field CLS를 뜻하지 않는다.
- [목적지 회귀](destination-regression/checks.json) **29개**, [계획 회귀](plan-regression/checks.json) **32개**, [목록 회귀](listing-regression/browser-checks.json) **46개** 통과. 합계 **142개 확인·측정 기록, 실패 0**. 합성 IME/키보드·취소·늦은 응답·읽기 실패·권한 상실·선택/방문 기록·원본 sentinel 보존을 포함한다.
- 공통 경고 대비 유지: 글자/아이콘 7.72:1, 테두리 3.75:1, 오류 6.16:1. 목적지/계획 visual probe 경고 없음. 변경한 picker/listing TSX/CSS taste source lint 0 FAIL/0 WARN.
- 추가 전문 리뷰 역할은 현재 계정에서 해당 모델을 지원하지 않아 실행되지 않았다. 탐색 에이전트가 원인 위치를 확인했고, 최종 구현은 직접 검토와 위 실행 결과를 근거로 검증했다.

## 화면 판단

기존 achromatic-ledger(seed 2044201404)·팔레트·시스템 서체를 재사용하고 새 방향을 추첨하지 않았다. 화면의 질문은 “어느 폴더를 목적지로 확정하는가”이며 실제 폴더 이름과 선택 행동이 한 주 버튼에 함께 나타난다. 데이터는 제품에서는 사용자 허용 폴더, 검증에서는 별도 OPFS fixture다. 장식이나 가상의 파일 수를 추가하지 않았다.

- [390](after/picker-390.png), [768](after/picker-768.png), [1440](after/picker-1440.png), [1920](after/picker-1920.png) 캡처를 직접 확인했다. 입력 폼·계획 만들기와 선택 버튼이 경쟁하지 않으며 모든 폭에서 첫 화면에 선택 버튼과 하위 폴더가 보인다.
- [긴 이름 390](after/picker-long-390.png): 경로·버튼 이름 줄바꿈, 가로 넘침 없음, 선택 뒤 원래 입력과 초점 복귀 확인.
- [파일 화면 390](after/files-390.png), [1440](after/files-1440.png): 새로고침 SVG와 설정 버튼 크기 확인. 적은 파일의 데스크톱 목록 끝에 남는 면에 기존 blank-gap/hero-void/panel-void 경고가 남는다(연결 1440/1920·갱신 1440 각 3개). 실제 파일 수에 맞는 목록 뒤 작업 면이므로 임의 항목으로 채우지 않는다.

## 성능·한계·다음 경계

[사이트 전체와 경로별 전후 측정](performance.md)은 production의 6개 경로·두 화면 폭·각 3회 원자료다. 사용자 클릭 직후의 화면 움직임은 최근 입력을 제외하는 일반 CLS만으로 잡히지 않으므로 위 좌표 검사와 구분한다.

실제 OS 선택창·물리 키보드/IME·iPhone 실기기는 미검증이다. 브라우저 검사는 실제 UI/session/OPFS와 합성 picker/권한/오류를 사용한다. 원본 쓰기·업로드·로그인은 이번에 추가하지 않았다. 다음 파일 관리 단계 후보는 검토한 계획의 실제 복사 적용이며, 구현 전 쓰기권한·충돌·원본 재검사·journal/부분 실패/복구 명세와 테스트가 필요하다. 이번 UX 수정은 실제 복사 실행 승인이나 해당 명세 완료를 뜻하지 않는다.
