# 파일 작업 후속 검증 — 2026-11-03

요구사항26~33과 선택 방식 확정을 반영했다. 사용자는 예상 결과 전/후 순서, 세 검사 항목의 순차 체크, 모든 하위 폴더 이름 검색과 위치, 이전 확인 목록 길게 선택, Windows 경로 붙여넣기, 기록3분류와 접힌 요약을 요청했다. 사이트 열기 요청은 요구사항에 포함하지 않았다.

## 구현과 읽기 순서

기준은 [명세](../../specs/file-workspace-followup.md)와 DESIGN.md 최신 절이다. 기능 코드는 `apps/web/src/features/local-folders/` 아래에 있다.

1. `services/folder-tree-search.ts` → `connection-session.ts` → `store/folder-search-controller.ts`: 이름만 제한된 너비 우선 검색. 기존 목록/미리보기 요청과 독립적인 검색 수명,180ms 입력 대기,취소/권한/연결 경계.
2. `store/source-listing-controller.ts` → `source-navigation-controller.ts`: 선택 개수로 모드를 결정. 이전 목록/검색 항목 선택 전 부모를 다시 읽고 이름·종류를 검증. 같은 경로 재조회와 늦은 결과도 검증.
3. `hooks/use-selection-row.ts` → `components/listing/PreviousFolderEntry.tsx`, `FolderSearchResults.tsx`, `SourceFolderBrowser.tsx`: 기존 길게 누르기 재사용,Space 대안,마지막 체크/전체 해제 후 가시적 초점.
4. `lib/pasted-folder-path.ts` → `components/plan/DestinationPathForm.tsx`: 따옴표/역슬래시를 정규화하고 루트 불일치/중복/.. /UNC를 거부. 절대 경로의 드라이브 접두는 확인하지 못하므로 연결 폴더 기준 후보를 명시적으로 확인한다.
5. `components/plan/FileChangePlanView.tsx`, `CopyInspectionView.tsx`와 CSS: 영역을 미리 확보한 전/후 순서 및 실제 성공 후 체크 공개. 결과 공개는 실제 검사 단계 진행률을 뜻하지 않으며 파일 I/O를 지연하지 않는다.
6. `components/history/FolderHistoryView.tsx`, `CopyHistoryView.tsx`: 분류와 native details 요약. 현재 관측과 과거 기록을 구분하는 기존 의미를 유지한다.

새 의존성은 없으며 복사/저널/원본 보호 실행 계약을 바꾸지 않았다. 무관한 승인 채팅 화면은 변경하지 않았다.

## 검증 방법

검색·경로 해석 테스트는 구현 전 missing module 실패를 확인했고, 자동 선택 종료/이전 항목 선택 테스트는 기존 동작에서 실패한 뒤 통과했다. 독립 read-only 검토가 같은 경로 재조회 누락을 찾아 회귀 테스트와 함께 수정했다. 브라우저가 전체 선택 체크 해제 후 숨겨진 조작에 초점을 남기는 실패도 재현한 뒤 제목 복귀를 추가했다.

`pnpm check`:373개/36파일,타입,lint 경고0,서버 경계21,구조 검사,43페이지 빌드 통과. 이후 이전 확인 열의 표시만 다듬은 최종 소스에서 타입·lint·build를 다시 통과했고 새 흐름/실제 복사를 재검증했다. 브라우저 합계283검사(26+52+66+69+26+44) 통과. 단위 테스트는 상한/부분 실패/취소/권한/중복 이름·전체 경로/연결 교체·이전 요청을 포함한다. Chromium은 격리 OPFS fixture와 CDP 포인터·키보드 입력을 사용한다.

- [새 흐름/순차 프레임](browser/checks.json): 선택 종료·전체 해제·초점, 이전 목록 파일/폴더 long-press, 재귀 검색/위치/취소, Windows 후보 확인, 순차 체크와 reduced-motion, 기록 분류.
- [기존 팝업 안정성](stability/checks.json):52검사·14개350ms 프레임 구간. 전체 영역 opacity1, 입력 노드 유지, 팝업 상단 이동0.20회 선택 토글은 다른 선택1개를 유지하여 모드가 열린 상태의 행 좌표를 비교한다. 모드 진입/종료의 도구 배치 변화와 구분한다.
- [기존 탐색](navigation/checks.json):66검사.20회 경로 왕복, 경로 입력 중복 방지,터치·포인터 취소/후속 클릭 차단, 키보드 대안.
- [파일 작업 UI](actions/checks.json):69검사.4폭,스크롤,Tab/Escape,실패 경로,실제 검사 상태.
- [실제 복사](copy/checks.json):26검사.합성 OPFS의 바이트/저널,재연결 내용 대조,4×16MiB 복사,접힌 기록.
- [생성 기록과 현재 상태](history/results.json):44검사.한 줄 요약/펼침,잘못된 기록/소유자/권한/취소/재연결,현재 관측과 과거 결과 구분.

390/768/1440/1920px 캡처 중 검색·검사·작업 기록을 직접 확인했다. [성능 원자료와 해석](performance.md)을 별도로 기록한다. 물리적 IME/모바일·개인 디스크·OS 권한 대화상자·외부 프로그램 경쟁과 실사용 INP는 이번 합성 검증 범위 밖이다.

## 지원 범위

모든 하위 폴더가 검색 대상이지만20,000항목/1,000폴더/깊이64/결과1,000과 폴더 간15초 예산에서 멈추며 일부 결과임을 표시한다. `.moa-history` 내부 기록은 검색 대상에서 제외한다. 중단된 I/O의 실제 OS 반환을 강제하는 timeout은 아니다.

브라우저의 파일 핸들은 임의 드라이브 경로를 여는 기능이 아니다. [File System API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API), [showDirectoryPicker](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker), [File System Access 사양](https://wicg.github.io/file-system-access/)의 사용자 선택·핸들 권한 경계 안에서 후보를 해석한다.

실제 이동/폴더 재귀 복사·이동/백업·덮어쓰기·복원·삭제는 아직 지원하지 않는다. 복구 보관함은 앞선 읽기 전용 식별 기반만 있으며 전체 기능 완료와 구분한다.
