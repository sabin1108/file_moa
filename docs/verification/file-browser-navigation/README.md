# 브라우저 탐색과 파일 우선 화면 — 2026-10-29

사용자 스크린샷의 문제를 다음 기능보다 먼저 수정했다. 미리보기/폴더 이동을 브라우저 방문 기록에 연결하고, 검색·선택 도구를 필요할 때 펼치며, 파일 화면의 중앙 카드 바깥 여백을 제거했다. 로그인과 실제 원본 쓰기·목적지 탐색은 추가하지 않았다.

## 보이는 결과

- 목록의 파일을 열고 브라우저 뒤로/앞으로로 왕복한다. 목록으로 돌아가기 버튼도 같은 기록을 사용한다. 검색어·선택·도구 열림·초점·스크롤을 복구한다. 폴더 재조회 후 없어진 파일은 다시 선택하지 않는다.
- 기본 화면은 폴더 이름, 작은 항목 수, 검색/선택 버튼, 파일과 하위 폴더다. 검색을 열면 입력과 범위 설명이 나타나고 선택을 열면 checkbox·전체 선택·변경 계획이 나타난다. 검색 닫기는 필터를 지우고 선택 완료는 선택 수를 유지한다.
- 파일 화면만 중앙 sheet/canvas를 연속된 작업 면으로 변경했다. 모바일16px·데스크톱32px 안쪽 여백, 정렬된 파일명/종류 행과 기존 팔레트/서체를 사용한다. 원문 본문 폭690px과 다른 화면의 기존 구성은 유지했다. 읽지 않은 크기·날짜·썸네일을 만들어 넣지 않았다.

[393px 기본 화면](navigation-final/files-first-393.png), [1440px](navigation-final/files-first-1440.png), [1920px](navigation-final/files-first-1920.png), [검색·선택을 펼친 화면](search-regression/filtered-selection-390.png).

## 명세·코드 읽는 순서

1. [NAV-001~004 / VIEW-001~003](../../specs/file-browser-navigation.md) → [9개 수명 테스트](../../../apps/web/tests/local-folders/store/source-navigation-controller.test.ts). [구현 전 실패](red.md)는 모듈 부재로 suite 수집 실패한 기록이다.
2. [source-navigation-controller.ts](../../../apps/web/src/features/local-folders/store/source-navigation-controller.ts): Provider 수명의 기록 Map(최대200개), 현재/부모 방문 ID, 비동기 복원 세대. URL이나 history.state에는 무작위 ID만 전달하며 파일명/경로/본문/핸들을 저장하지 않는다. 기록에는 본문/핸들을 보관하지 않는다.
3. [use-source-navigation.ts](../../../apps/web/src/features/local-folders/hooks/use-source-navigation.ts): history/DOM adapter. 기존 history 필드를 보존하고 같은 URL에 ID만 추가한다. popstate·스크롤 설정·예약된 animation frame을 수명에 맞춰 정리한다. /files 밖 라우팅은 처리하지 않는다.
4. [source-listing-controller.ts](../../../apps/web/src/features/local-folders/store/source-listing-controller.ts): 검색/선택 도구 상태·복원·연결 reset epoch. [연결 controller](../../../apps/web/src/features/local-folders/store/source-connection-controller.ts)가 navigation을 소유하고 기존 listing/preview와 연결한다. 연결 교체·해제·소유자 변경은 옛 기록을 무효화한다.
5. [SourceFolderBrowser](../../../apps/web/src/features/local-folders/components/listing/SourceFolderBrowser.tsx) → [FolderListingView](../../../apps/web/src/features/local-folders/components/listing/FolderListingView.tsx) → FileNameSearch/SourceFileRow와 CSS. browser는 navigation 콜백, view는 도구 표시와 목록, input은 IME 임시 문자열을 맡는다. SourceFolderSettingsDialog는 동일 연결 로직을 compact 아이콘으로 재사용한다.
6. [files/page.tsx](<../../../apps/web/src/app/(workspace)/files/page.tsx>)와 [workspace-ui.module.css](../../../apps/web/src/styles/workspace-ui.module.css): 파일 화면의 sheet wrapper를 연속된 작업 면으로 교체한다. [브라우저 검사](../../../tests/browser/check-file-browser-navigation.mjs)와 [회귀 진입 helper](../../../tests/fixtures/reveal-file-tools.mjs)는 제품 소스 밖에 둔다.

기존 session/reader와 공통 버튼·토큰을 재사용했다. 새 의존성·비밀키/API·원본 쓰기·`any`를 추가하지 않았다. 새 탐색 수명만 controller와 브라우저 adapter로 분리하고 기존 선택/검색 저장소를 복제하지 않았다. 첫 커밋 전 untracked 전체를 이번 변경으로 세지 않는다.

## 실행 증거

- `pnpm check`: **163개 / 15파일 통과**, 타입·lint·서버 경계21·웹 import25/domain6·배치3·실제 domain import 검사·production43페이지 통과. 이후 history adapter의 초기 상태 보존 수정에 대해 build·typecheck·lint와 navigation9개를 다시 통과했다.
- [실제 브라우저 방문 기록23](navigation-final/checks.json): 실제 Chromium `Page.navigateToHistoryEntry`로 뒤로/앞으로·폴더→문서 순서·10회 왕복·버튼 복귀 후 앞으로·검색/선택 복구·설정 라우트 왕복·늦은 본문 응답·연결 교체·opaque ID/Next 필드 보존 확인. 모두 통과.
- 기존 회귀 [선택/팝업39](selection-regression/checks.json), [본문53](preview-final/checks.json), [검색38](search-regression/checks.json), [목록46](listing-regression/browser-checks.json), [계획32](plan-regression/checks.json). 합계 **231개 확인·측정 기록, 실패0**. 독립 시나리오 수나 파일 개수와 구분한다.
- 브라우저 흐름은 실제 UI/store/session/IndexedDB/Web Locks/OPFS와 합성 picker/권한·오류·CDP 조합 입력을 사용했다. sentinel 이름/size/mtime/hash 동일, 제품 쓰기0, 외부 요청0, console error0. 문서 앞으로 이동은 현재 내용을 다시 읽는다.
- 393x852와390x852의 기본 목록 첫 행은 **y258px**, 합성 자료8개가 첫 화면에 표시됐다. 1440/1920에서 main과 목록 작업 면의 왼쪽 좌표는 모두220px로 사이드바 다음에 바로 이어지고 내부 padding32px이다. 가로 넘침이 없다. iPhone16 실기기나 OS 마우스 드라이버 자체를 시험한 결과는 아니다.

## 발견하고 고친 문제

초기 구현이 Next의 native history wrapper만 믿고 ID만 replace하면 첫 child effect 시점에 라우터 필드가 유실되는 경우를 브라우저가 잡았다. [최초 실패](debug-history/checks.json)는 history에 `moaFileVisit`만 남은 증거다. 현재는 기존 객체의 필드를 그대로 보존하고 URL을 바꾸지 않는다. 최종 브라우저에서 Next 필드 보존과 실제 라우트 왕복을 확인했다.

기존 미리보기 회귀는 동기 close를 가정해 버튼 클릭 직후 초점을 검사했다. 이제 browser.back은 비동기이므로 실제 목록 복귀와 예약된 초점 복구를 기다리게 바꿨다. [이전 검사 실패](preview-regression/checks.json)를 보존하고 [재실행53개](preview-final/checks.json)에서 스크롤/초점 조건을 그대로 검증했다. 기존 선택/검색 회귀는 실제 토글로 도구를 연 뒤 검사하며 숨김 DOM에 직접 상태를 주입해 검사를 우회하지 않는다.

[Next native History 지원](https://nextjs.org/docs/app/getting-started/linking-and-navigating#native-history-api), [MDN popstate](https://developer.mozilla.org/en-US/docs/Web/API/Window/popstate_event)를 참고했고 설치된 Next16.4.3 app-router 코드를 함께 확인했다. 공식 지원 설명만으로 초기 effect 순서를 가정하지 않고 실제 브라우저 결과를 우선했다.

## 화면 판단과 한계

393/390/768/1440/1920px 기본 상태, 좁은 화면의 검색·선택·오류, 원문 미리보기를 캡처해 검토했다. 기본 모바일/태블릿 probe는 경고0, 데스크톱 기본 화면은 각3개의 blank-gap/hero-void/panel-void 경고다. 8개 자료가 끝난 뒤 작업 면 아래가 비는 것을 감지한 것으로, 내용 사이에 고정 spacer나 빈 장식 카드는 없다. 사이드바와 파일 사이의 중복 여백은 제거했고 적은 자료를 가짜 항목으로 채우지 않았다. 긴 이름은 잘라 숨기지 않고 줄바꿈한다.

taste source lint10파일은0 FAIL/1 WARN이며 기존 native dialog 그림자다. 실제 떠 있는 팝업의 그림자를 유지한다. 미리보기·선택/검색의 desktop 하단 여백 경고도 원자료에 남겼다. 자동 점수만으로 시각적 만족이나 접근성 인증을 완료했다고 주장하지 않는다.

기록은 메모리에만 있으므로 새로고침/새 탭/200개를 넘겨 제거된 기록은 상세 복원이 불가능하다. 유효하지 않은 기록은 현재 안전한 상태로 대체하며 옛 폴더를 자동 연결하거나 권한 요청하지 않는다. 별도 전문가 리뷰는 도구 사용 한도로 완료되지 않았고 이 보고서는 직접 코드 검토·실행 결과에 근거한다.

[경로별 성능 전후](performance.md). 실제 OS IME·물리 마우스 버튼 드라이버·iPhone 실기기·실제 사용자 파일·로그인/AI/원본 쓰기는 미검증 또는 미구현이다.
