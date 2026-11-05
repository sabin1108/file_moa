# 목적지 상대 경로 선택과 경고 색상 검증

2026-10-29. 사용자 요청: “상대 경로도 선택할 수 있게”, “경고에 대한 확실한 색감”. 변경 계획에서 연결 폴더 안의 목적지를 탐색해 입력하도록 구현했다. 직접 입력도 유지하며 원본 이동·복사·생성은 실행하지 않는다.

## 구현과 리뷰 순서

1. [DEST-001~005 / WARN-001~002 명세](../../specs/plan-destination-picker.md) → [8개 수명 테스트](../../../apps/web/tests/local-folders/store/destination-picker.test.ts). [구현 전 실패](red.md)는 미구현 `browseDestination` 호출로 8개 테스트가 실패한 실제 기록이다.
2. [DestinationPickerController](../../../apps/web/src/features/local-folders/store/destination-picker-controller.ts): 현재 목적지·읽기·취소 세대·오류만 소유한다. 기존 목록 reader를 재사용하며 주 목록/선택/history나 파일 본문에 접근하지 않는다.
3. [SourcePlanController](../../../apps/web/src/features/local-folders/store/source-plan-controller.ts): 탐색 시작 경로, 선택 결과 입력, 이전 계획 무효화, 연결/선택 수명과 권한 상실을 연결한다. 탐색 중에는 계획 생성을 막는다.
4. [DestinationFolderPicker](../../../apps/web/src/features/local-folders/components/plan/DestinationFolderPicker.tsx)와 CSS: 직접 하위 폴더·상위/연결 폴더·선택/취소·읽기 상태를 표시한다. [SourcePlanDialog](../../../apps/web/src/features/local-folders/components/plan/SourcePlanDialog.tsx)는 단일 native dialog 안에서 입력·탐색·초점을 조합한다. 중첩 팝업을 만들지 않는다.
5. [공통 상태 스타일](../../../apps/web/src/components/ui/feedback/status-notice.module.css), [workspace 토큰](../../../apps/web/src/styles/workspace-ui.module.css), [계획 결과](../../../apps/web/src/features/local-folders/components/plan/FileChangePlanView.tsx): 경고를 황갈색 배경/테두리/문구/아이콘으로, 오류를 적색으로 구분한다. 색 외에 원인 문구와 아이콘을 유지한다.
6. [브라우저 검사](../../../tests/browser/check-destination-picker.mjs). 제품 코드와 테스트의 책임을 분리했고 새 의존성이나 `any`를 추가하지 않았다.

## 실행 결과

- `pnpm check`: **171개 테스트 / 16파일 통과**. 타입·lint·서버/기능 경계·배치 검사와 production 43페이지 빌드 통과. 최종 Tab 경계 수정까지 포함한다.
- [목적지 선택 29개](final/checks.json), [기존 계획 32개](plan-final/checks.json), [기존 목록 46개](listing-regression/browser-checks.json): 합계 **107개 확인·측정 기록, 실패 0**. 이전 작업의 브라우저 결과를 이번 실행 수에 합치지 않았다.
- 목적지 폴더만 표시, 하위/상위/루트 선택, 빈 폴더 선택, 잘못된 입력 보존, 부분 목록, 없는 폴더·읽기 오류 재시도, 대기 중 취소·늦은 응답 무시, 권한 상실, 주 목록/선택/history 유지, 선택 뒤 계획 재조회 확인.
- 실제 Chrome UI/store/session/OPFS와 합성 picker/권한/오류를 사용했다. 검증 파일 sentinel 유지, 제품 본문 읽기 0·쓰기 0·외부 전송 0·console 오류 0. 실제 사용자 파일은 검증에 사용하지 않았다.
- 새 목적지/경고 화면의 시각 probe 7개는 경고 0. 새 picker CSS/TSX와 공통 notice CSS의 taste source lint는 0 FAIL/0 WARN. 390/768/1440/1920px 캡처를 검토했다.

## 키보드 회귀에서 발견한 수정

버튼 추가 후 기존 계획 검사에서 Tab이 브라우저 chrome 쪽으로 빠지는 현상을 발견했다. [첫 실패](plan-regression/checks.json), [12회 Tab 추적](plan-tab-diagnostic/checks.json)을 보존했다. native dialog의 inert와 별개로 화면에 보이는 활성 조작의 첫/마지막 Tab 경계를 명시했다. 최종 계획 검사에서는 12회 각각 내부 초점을 확인하며, 목적지 검사에서는 Tab·Shift+Tab 각각 12회와 Escape의 탐색→계획 순서, 닫은 뒤 버튼 초점 복귀를 확인했다.

## 경고 대비와 화면

실제 computed style에서 전경/배경 대비를 계산했다. 경고 글자/아이콘은 **7.72:1**, 테두리는 **3.75:1**. 오류 글자/아이콘/테두리는 **6.16:1**. 왼쪽 테두리 4px를 확인했다. 측정한 상태의 대비이며 전체 접근성 인증을 뜻하지 않는다.

- 목적지 선택: [모바일 390](final/destination-390.png), [768](final/destination-768.png), [1440](final/destination-1440.png), [1920](final/destination-1920.png).
- [이름 충돌 경고](final/conflict-warning-390.png), [일부 목록 경고](final/partial-warning-390.png), [폴더 없음 오류](final/missing-folder-390.png).

기존 목록의 데스크톱 probe는 소량 자료가 끝난 뒤 남는 작업 면 때문에 blank-gap/hero-void/panel-void 경고를 계속 보고한다(1440/1920 각 3개, 갱신 중 2개). 원자료에 남겼으며 새 목적지 패널의 넘침이나 중복 여백으로 간주하지 않았다. 파일 수를 꾸며 공간을 채우지 않는다.

## 성능과 검증 한계

[6개 경로 × 두 화면 폭 × 3회 성능 측정](performance.md). 정적 자산은 795,297→804,772B(+1.19%). `/settings`의 CLS 최댓값은 1440px에서 0.00171, 390px에서 0.01068이며 나머지 경로는 0이었다. 모든 측정에서 console 오류 0·관찰 구간 long task 0. `/files` 로드와 목적지 탐색 비용은 다른 지표다. 계획 검토의 실제 CDP 클릭+조회+렌더+poll 중앙값은 100개 59.8ms, 1,000개 302.2ms였다. 이는 field INP나 OS 디스크 성능 보장이 아니다.

목적지 조회는 기존 1,000개 직접 자식 상한을 따르므로 일부 목록에서 보이지 않는 폴더는 직접 경로를 입력해 확인할 수 있다. 새 폴더 생성, 실제 원본 적용, 로그인은 구현하지 않았다. native OS 폴더 대화상자·실제 OS 권한·물리 키보드/IME·iPhone 실기기는 이번 검증 범위 밖이다. 추가 전문 에이전트 리뷰는 도구 사용 한도로 완료하지 못했으며 직접 코드 검토와 실행 결과를 근거로 보고한다.

재현: production 서버를 실행한 뒤 `pnpm check`, `pnpm exec node tests/browser/check-destination-picker.mjs http://127.0.0.1:3010 docs/verification/plan-destination-picker/new-run`을 실행한다. 테스트는 격리 브라우저와 합성 폴더를 사용한다.

## 2026-10-30 중단 지점 재개 검증

전날 실제 세션 로그의 마지막 사용자 요청과 종료 이벤트를 확인했다. 구현·검증 문서 작성 후 최종 보고 전에 `usage_limit_exceeded`로 종료된 작업이다. 이번에는 memory 문서를 변경하지 않고 기존 구현의 완료 여부를 확인했다.

- 현재 소스에서 `pnpm check` 재실행 통과: 16파일·171개 테스트, 타입·lint·서버/기능 경계 검사, 43페이지 production 빌드.
- [목적지 선택 브라우저 재검증](resume-20261030/checks.json): 29개 통과, 실패 0. 390/768/1440/1920px, Tab/Shift+Tab·Escape·초점 복귀, 취소/늦은 응답/권한 상실, 주 목록·선택·history 보존을 확인했다. 경고 대비는 글자/아이콘 7.72:1·테두리 3.75:1, 오류 대비는 6.16:1이다.
- 검증용 원본 sentinel 유지, 제품 쓰기/본문 읽기/외부 요청/console 오류 0. 최초 격리 실행은 `Page.enable`에서 시간 초과해 검사를 시작하지 못했으며, 승인된 재실행에서 임시 Chrome 프로필과 합성 폴더로 통과했다.
- 390px 목적지 선택 캡처를 직접 확인했다. 목적지 controller·계획 controller·dialog·표시 컴포넌트·8개 단위 테스트를 직접 검토했다. 추가 독립 리뷰는 에이전트 초기화 대기 상태에서 실행되지 않아 완료 근거에 포함하지 않는다.
- 전날 성능 원자료와 요약을 대조해 “모든 CLS 0” 오기를 수정했다. `/settings`에서 1440px 0.00171, 390px 0.01068이 측정됐으며 성능 측정을 새로 실행한 것은 아니다.

제품 코드 추가 변경 없이 요청 기능의 검증과 보고를 마무리했다. 실제 원본 이동·복사·생성, 로그인, 실제 OS 권한 및 실기기 검증은 기존 범위와 동일하게 제외한다.
