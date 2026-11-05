# local-folders — 자료 폴더 기능

2026-11-04 최신: 파일/폴더 실제 copy/move·앱 휴지통·복원·MD/TXT 인라인 편집과 첫 보존 후 수동/주기 저장, URL 단계·IndexedDB 초안/F5 복원이 연결되어 있다. 아래 날짜별 미구현 설명보다 [현재 사용자 코드 해설](../../../../../docs/코드_이해하기.md)과 [UX 검증](../../../../../docs/verification/workflow-ux/README.md)을 우선한다. 기존 책임별 컴포넌트 구조를 유지한다.

2026-10-30 최신: 사용자 ZIP 시안으로 폴더 화면을 교체했다. `FolderWorkspaceFrame`이 경로/열, `FolderTrailController`가 이미 읽은 상위 목록, `FilePreviewPane`이 데스크톱/모바일 미리보기를 맡는다. 파일 선택 취소는 전체 선택을 지운다. `NewEntryForm` → `EntryCreationController` → session → `create-entry`/`folder-creation-journal`은 **현재 탐색 폴더에 새 폴더·빈 TXT/MD와 .moa-history 기록**을 만든다. `lib/new-entry`는 이름·확장자 규칙이다. 별도 기록 폴더 선택 창은 열지 않는다. 기존 파일 이동/복사/분류는 여전히 검토 계획이며 `복사 전 검사`만 실제 내용 hash를 읽는다. 아래 날짜별 ‘쓰기 없음’은 당시 기능 단위의 경계다. [최신 명세](../../../../../docs/specs/folder-workspace-revision.md), [검증](../../../../../docs/verification/current-folder-creation/README.md).

2026-10-29 후속 화면 수정: `store/source-navigation-controller.ts`는 Provider 수명의 브라우저 탐색 기록, `hooks/use-source-navigation.ts`는 history/DOM adapter다. 파일/폴더 방문은 뒤로·앞으로 복원하며 연결 reset epoch로 옛 기록을 지운다. 목록 store가 검색/선택 도구의 접힘도 소유하고 기본 화면은 파일을 먼저 보여준다. [명세](../../../../../docs/specs/file-browser-navigation.md), [검증](../../../../../docs/verification/file-browser-navigation/README.md).

실제 자료 폴더 연결, 직계 목록 탐색, 파일 다중 선택, MD/TXT 원문 미리보기를 담당한다. 기능 전용 코드는 이 폴더에 모으고 공통 UI만 ../../components에서 가져온다. 테스트는 [apps/web/tests/local-folders](../../../tests/local-folders)에 분리했다.

2026-10-29 후속: 현재 목록의 이름 검색을 추가했다. `lib/file-name-search.ts`는 순수 필터, listing store는 확정 검색어와 선택 수명, `FileNameSearch`는 IME 임시 입력과 키보드만 소유한다. 검색 밖 선택을 보존하고 전체 선택 checkbox는 표시 파일만 바꾼다. 미리보기/같은 작업 화면 왕복에는 검색을 보존하며 계획은 숨겨진 선택도 포함한다. [검색 명세](../../../../../docs/specs/file-name-search.md), [검증](../../../../../docs/verification/file-name-search/README.md).

2026-10-29: 선택 파일의 이동·복사·확장자 분류 **계획 검토**를 추가했다. `components/plan`은 입력/표시·dialog 초점, `store/source-plan-controller.ts`는 읽기/취소·선택 수명 연계, `lib/file-change-plan.ts`는 순수 경로/충돌 규칙이다. 기존 session의 목록 읽기만 사용하며 쓰기·본문 접근·외부 전송은 없다. [명세](../../../../../docs/specs/file-change-plan.md), [검증](../../../../../docs/verification/file-change-plan/README.md).

| 먼저 읽을 위치 | 역할·사용처 |
| --- | --- |
| providers/SourceFolderProvider.tsx | app/(workspace)/layout이 설치한다. 경로 이동 중 상태 공유 |
| hooks/use-source-folder-connection.ts | repository→session→connection controller를 조립하고 React 구독/정리 연결 |
| store/source-connection-controller.ts | UI의 연결/해제 요청 처리, 목록/본문 상태 협력 |
| services/connection-session.ts | 소유자·권한·연결/요청 세대 검증, reader/repository 호출 |
| services/handle-repository.ts | IndexedDB 핸들 참조 저장. 원본 내용 쓰기 없음 |
| components/connection | 연결 상태 표시·설정 조작·설정 팝업과 CSS. 설정과 파일 화면에서 재사용 |
| components/listing | SourceFolderBrowser가 조합, FolderListingView가 표시, SourceFileRow/Toolbar가 선택 조작 |
| store/source-listing-controller.ts | 현재 경로의 목록·선택 수명. 기능별 별도 전역 저장소 없음 |
| components/preview + store/source-preview-controller.ts | 본문 표시/닫기와 독립 요청 수명 |
| services/source-folder-listing.ts, source-file-preview.ts | 실제 읽기 경계. 프레임워크 독립 정책은 packages/domain에서 재사용 |
| types.ts + lib/connection-validation.ts | 타입 계약과 실행되는 연결 검증을 구분 |

연결 흐름: 설정 UI → connection store → connection service → 브라우저 picker/권한·repository → 성공 결과 → UI가 /files 이동 또는 dialog 닫기.

파일 흐름: 목록 UI → listing/preview store → session → reader → 값/상태 → 구독된 UI. checkbox는 listing store의 selectedNames만 바꾸며 본문을 읽지 않는다. 다른 폴더 이동/연결 reset은 선택을 비우고, 미리보기/같은 Provider 경로 왕복은 유지한다.

SourceFolderBrowser가 DOM 초점·스크롤을 맡고 store/services는 DOM을 모른다. SettingsDialog는 native dialog의 열림과 내용 수명만 관리하며 SourceFolderSettings의 연결 로직을 재사용한다. 새 컴포넌트를 만들 때 ‘해당 기능의 화면인가 / 여러 기능의 공통인가’를 먼저 확인한다.

[명세와 실패 조건](../../../../../docs/specs/file-selection-and-connection-dialog.md), [전체 코드 지도](../../../../../docs/code-map.md).
