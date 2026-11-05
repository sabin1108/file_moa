# 2026-10-28 사용자 요구와 적용 — 구조 분류·연결 이동·선택·설정 팝업

사용자는 features의 파일이 유지보수하기 복잡하므로 분류해야 한다고 요청했다. 이후 “자료폴더 연결하고 성공하면 자연스럽게 내파일로 이동”, “작업 이어서 하고 그다음 기능도 만들어줘”, “폴더 연결 관리는 설정 아이콘과 함께 그 창을 팝업 형태로”, transition과 box-shadow는 “적당히가 중요”하며 필요 없으면 쓰지 않아도 된다고 요청했다. 기존의 유지보수성·재사용성·의미 있는 주석·웹표준·불필요한 any 지양 기준을 함께 적용했다.

## 구조로 해결한 부분

- 실제 기능이 시안 폴더의 공통 UI를 import하던 방향을 제거했다. app은 URL/화면 조합, features는 실제 기능, shared는 실제 공유 표시, prototypes는 합성 시안으로 분류했다. local-folders 내부는 ui/state/browser/contracts 책임으로 나누고 기존 Icon wrapper를 없앴다. 이동/매핑102건의 변경 전 hash를 남겼다. 새 패키지·barrel·호환 wrapper는 추가하지 않았다.
- 실제 공유 근거가 있는 ActionLink·StatusLabel·SettingRow·actionClasses·StatusNotice·MoaLoader/CSS만 shared로 옮겼다. PreviewButton과 시안 전용 feedback은 prototypes에 둔다. ESLint와 구조 fixture19개로 역방향 import를 막는다. 기존 서버 경계21개도 유지한다.
- 연결 controller가 이번 작업 성공 여부를 반환하고 UI가 /files 이동을 담당한다. 취소·실패·복원·떠난 화면의 늦은 완료를 성공으로 오인하지 않는다. 설정 화면/팝업은 기존 SourceFolderSettings를 재사용한다.
- 다음 기능은 현재 폴더 파일 다중 선택으로 한정했다. 선택은 기존 목록 controller의 현재 경로와 함께 보관하며 별도 전역 저장소/연결 세대를 복제하지 않는다. 미리보기·페이지 왕복은 보존, 폴더 이동/연결 교체·해제/소유자 변경은 초기화한다. 불완전 목록에서 미표시 선택을 제외해도 원본 삭제로 판정하지 않는다.
- native dialog의 showModal/close로 배경 inert·키보드 범위를 사용한다. checkbox와 미리보기 button은 형제 요소이며 p/버튼 안에 block/다른 조작을 중첩하지 않는다. 팝업만6% 그림자,160ms 열림/4px 이동, 선택140ms 색/테두리 전환을 적용했다. reduced-motion은 효과를 없애며 닫기/초점을 타이머로 지연하지 않는다.

## 명세·실패·구현·검증 과정

명세는 docs/specs/connection-navigation.md와 file-selection-and-connection-dialog.md에 결과/실패/금지 부작용/수명 계약을 기록했다. 연결 반환 계약7개와 선택9개의 실패를 먼저 확인한 뒤 구현했다. 선택은 truncated 재조회 검사를 추가해10개로 보강하고 기존 연결 통합 테스트에서도 선택 reset을 확인했다.

브라우저에서 Escape 직후 다시 열기 경쟁을 발견했다. native close 이벤트가 늦게 전달되므로 닫기 요청에서 즉시 상태를 정리하고 이미 다시 열린 dialog에는 과거 close 이벤트를 반영하지 않도록 수정했다. 닫았다 다시 연 뒤 이전 연결 완료가 새 팝업을 닫지 않는 경로와 늦은 실패가 재오픈하지 않는 경로를 검증했다.

최종 pnpm check: 타입·lint·단위121개/11파일·서버 경계21개·구조 경계19개·production build43페이지 통과. 브라우저는 선택/팝업39+이동13+연결51+목록46+미리보기53+화면69=271 확인/측정 기록이다. 독립 시나리오271개로 부르지 않는다. S0 모듈 graph9개와 브라우저 export 평가도 확인했다. 격리 합성 OPFS와 실제 UI/IndexedDB/Web Locks를 사용했으며 OS 선택창·권한·오류만 주입했다. 개인 자료에 접근하지 않았고 원본 sentinel 동일, 제품 쓰기0/외부 요청0이었다.

6경로×desktop/mobile×3회 성능 원자료와100/1000/1001항목 선택 비용을 기록했다. 정적 자산은 직전 구조 단계780,092→786,407bytes(+6,315). 1,000개 전체 선택은 CDP 포함167–291ms이며 field INP가 아니다. Lighthouse13.5.0 미연결 초기 /files 단발 baseline은 desktop100/100/100, mobile99/100/100(성능/접근성/모범사례)이다. 실제 OS picker·로그인·스크린리더·실사용 성능을 인증한 것은 아니다.

## 코드 리뷰와 다음 경계

docs/code-map.md와 apps/web/src/README.md에서 Next layout/page→Provider/hook→controller/session→browser/domain 호출을 설명한다. 새 기능 리뷰 순서는 명세→source-listing-controller/테스트→SourceFileRow/FileSelectionToolbar→SourceFolderSettingsDialog/SourceFolderSettings→브라우저 검증이다. 최종 근거는 docs/verification/file-selection-dialog/README.md와 performance.md에 연결했다.

다음 단위는 선택 파일의 읽기 전용 변경 계획 검토다. 실제 원본 이동·복사·분류 적용은 아직 없으며 쓰기 권한·hash 재검사·충돌·journal·부분 실패/복구 계약 뒤에 구현한다. 실제 로그인·AI·외부 업로드도 이번 구현 범위가 아니다.

---

