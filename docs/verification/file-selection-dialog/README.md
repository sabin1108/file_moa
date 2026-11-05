# 파일 다중 선택·연결 관리 팝업 검증

2026-10-28. 이전 [구조 분류와 자동 이동](../feature-classification/README.md)을 완료하는 중 사용자가 다음 기능 구현, 설정 아이콘으로 여는 연결 관리 팝업, 절제한 transition/box-shadow를 요청했다. 현재 폴더의 파일 다중 선택까지 구현했으며 실제 이동·복사·분류·외부 전송은 추가하지 않았다.

## 결과와 코드 리뷰 순서

1. [명세](../../specs/file-selection-and-connection-dialog.md): SELECT-001~006, DIALOG-001~005. 표시된 파일 선택과 연결/경로 수명, 권한/실패, native dialog 의미를 먼저 정의했다.
2. [source-listing-controller.ts](../../../apps/web/src/features/local-folders/state/source-listing-controller.ts): 현재 result.path의 selectedNames를 목록과 함께 보관한다. 별도 전역 선택 저장소·경로 복제·파일 접근 코드는 추가하지 않았다. [선택 실패 테스트](../../../apps/web/src/features/local-folders/state/source-selection.test.ts)와 [연결 통합 테스트](../../../apps/web/src/features/local-folders/state/source-listing-controller.test.ts)를 함께 읽는다.
3. [SourceFileRow](../../../apps/web/src/features/local-folders/ui/SourceFileRow.tsx) / [FileSelectionToolbar](../../../apps/web/src/features/local-folders/ui/FileSelectionToolbar.tsx): checkbox와 미리보기 button은 형제 요소다. 폴더에는 checkbox가 없으며 확장자와 무관하게 파일을 선택한다. 전체 선택의 mixed 상태는 native indeterminate를 쓴다.
4. [SourceFolderSettingsDialog](../../../apps/web/src/features/local-folders/ui/SourceFolderSettingsDialog.tsx): dialog 열림/내용 수명, 안전한 제목 초점, 닫기와 늦은 이벤트 경계. 브라우저의 showModal/close로 배경 inert·Tab 범위를 처리한다. 사용자 닫기 후 늦은 성공/실패가 다시 팝업을 열거나 새 팝업을 닫지 않는다.
5. [SourceFolderSettings](../../../apps/web/src/features/local-folders/ui/SourceFolderSettings.tsx): 기존 연결 UI를 그대로 재사용한다. 성공한 connect/reconnect에만 onConnected를 호출하고 /files가 아닌 경우 이동한다. 단순 복원/실패/취소/해제에는 이동하지 않는다.
6. [브라우저 검사](../../../scripts/check-file-selection-dialog.mjs): 실제 UI→controller→session→브라우저 저장소의 동작 증거.

표시·상태·외부 접근을 기존 책임에 배치하고, 모달용 만능 공통 컴포넌트나 별도 focus trap 패키지를 만들지 않았다. 새 any와 패키지 의존성이 없다. 코드 주석은 선택 범위·불완전 목록·늦은 close 이벤트·DOM indeterminate 등 이유가 필요한 경계를 설명한다. 상세 구조는 [코드 지도](../../code-map.md)와 [src 안내](../../../apps/web/src/README.md)를 따른다.

## 실패 → 수정 → 검증

- SDD: 사용자 행동/실패 조건을 위 명세에 먼저 기록했다. TDD: [선택 red 9건](../feature-classification/selection-red.txt) → 구현 → truncated 재조회 보강 후 선택 테스트10개 통과. 기존 연결 통합 테스트에 선택 reset/보존 확인도 추가했다.
- 브라우저 첫 검사에서 과거 빌드가 늦은 실패의 팝업 밖 안내를 표시하지 않아 중단됐다. 구빌드의 31개 통과는 최신 완료 근거로 세지 않는다.
- 최신 빌드에서 Escape 직후 재열기가 실패하는 경쟁을 재현했다. native close 이벤트는 지연 전달되므로 닫기 요청에서 상태를 바로 정리하고, 이미 다시 열린 dialog에는 늦은 close 이벤트를 반영하지 않도록 수정했다. 최종 전체 검사가 통과했다.
- 시각 검사에서 강한 그림자를 지적해 dialog 한 곳만 6%/6px/20px로 낮추고 중복 테두리를 제거했다. 열림160ms opacity/4px, 행140ms 색/경계 전환만 사용하며 reduced-motion은 효과를 끈다. 닫기·초점 복귀에 타이머를 넣지 않았다.

## 실행 결과

| 검사 | 최신 결과와 근거 |
| --- | --- |
| pnpm check | 타입·lint·단위121개/11파일·서버 경계21개·구조 경계19개·production build43페이지 통과. [전체 로그](../feature-classification/check-selection-dialog-final.txt) |
| 선택/팝업 | 39개 통과. Escape/Tab/배경 inert/닫기 후 재열기/늦은 성공·실패/선택 범위/100·1000·1001항목/reduced-motion/원본 보존. [원자료](browser/checks.json) |
| 연결 후 자동 이동 | 13개 통과. [원자료](navigation/checks.json) |
| 기존 연결 | 51개 통과(동작49+측정2). [원자료](connection/browser-checks.json) |
| 기존 목록 | 46개 통과. [원자료](listing/browser-checks.json) |
| 기존 미리보기 | 53개 통과. [원자료](preview/checks.json) |
| 실제/시안 경로 | 69개 통과. [원자료](screens/screen-checks.json) |

| Lighthouse 13.5.0 | desktop: 성능100/접근성100/모범사례100, mobile: 성능99/접근성100/모범사례100. 미연결 초기 화면 각1회. [요약](lighthouse-summary.json), [desktop HTML](lighthouse-desktop.report.html), [mobile HTML](lighthouse-mobile.report.html) |

브라우저 **271은 확인·측정 기록 합계**이며 271개의 독립 시나리오가 아니다. 격리 Chrome 프로필의 합성 OPFS 자료와 실제 UI/IndexedDB/Web Locks를 사용했다. OS picker·권한·오류는 주입했다. 원본 sentinel hash/mtime/size/path 동일, 제품 쓰기0, 외부 요청0을 확인했다. 선택은 본문을 읽지 않으며 미리보기 자체의 읽기는 정상 동작이다.

선택/목록/미리보기의 390·768·1440·1920px와 팝업390·768·1440px 검사에서 가로 넘침이 없었다. 대표 선택·팝업·시안 설정 캡처를 직접 확인했다. 새 선택/팝업·목록·미리보기 inspector 결과는 FAIL0/WARN0이다. 기존 미구현 대화/빈 경로의 여백 지적은 남아 있으며 이번 동작 완료를 사이트 전체 디자인 승인으로 표현하지 않는다. HTML/키보드 검증 범위는 native checkbox, 형제 조작, main/목록 구조, ARIA 대상, modal focus이며 전체 스크린리더 인증은 아니다. 새 UI에는 텍스트 입력이 없어 IME 대상이 없다.

## 성능·재현·남은 경계

[성능 표](performance.md)에 6경로×desktop/mobile×3회와 선택/목록/본문 실제 흐름을 기록했다. 1,000개 전체 선택은 CDP 포함167–291ms였으며 즉각적 입력이나 실사용 INP 기준 달성을 주장하지 않는다. 전체 정적 자산은 직전 단계보다6,315 bytes 증가했다. 이전 비교는 기능 추가 비용을 포함한다.

```powershell
pnpm check
pnpm test:s0-graph
pnpm --filter @personal-ai/web start --port 3009
pnpm exec node scripts/check-file-selection-dialog.mjs http://127.0.0.1:3009 docs/verification/file-selection-dialog/browser
pnpm exec node scripts/check-connection-navigation.mjs http://127.0.0.1:3009 docs/verification/file-selection-dialog/navigation
pnpm exec node scripts/check-settings-folder-connection.mjs http://127.0.0.1:3009 docs/verification/file-selection-dialog/connection
pnpm exec node scripts/check-source-folder-browser.mjs http://127.0.0.1:3009 docs/verification/file-selection-dialog/listing
pnpm exec node scripts/check-source-file-preview.mjs http://127.0.0.1:3009 docs/verification/file-selection-dialog/preview
pnpm exec node scripts/check-live-screens.mjs http://127.0.0.1:3009 docs/verification/file-selection-dialog/screens
```

실제 로그인/권한 발급·OS picker·실제 디스크 경쟁·스크린리더·저사양 기기 field 성능은 미검증이다. 선택은 현재 폴더의 메모리 상태이며 페이지 새로고침 후 복원하지 않는다. 다음 구현 단위는 선택된 파일의 읽기 전용 변경 계획 검토(출발/도착/충돌/예상 결과)다. 실제 적용은 별도 쓰기 권한·hash 재검사·journal·부분 실패/복구 계약 뒤에 진행한다.
