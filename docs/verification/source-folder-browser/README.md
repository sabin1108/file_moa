# 자료 폴더 목록 UI — 구현·검증과 코드 읽기

2026-10-28. 27일 memory의 중간 저장에서 이어서 목록 UI 단위를 마무리했다. `/files`에서 연결한 폴더의 파일명·하위 폴더를 읽고 탐색·갱신·취소·재시도한다. 파일 본문, 검색, 다중 선택, 이동·복사·분류, 실제 인증·AI는 이번 완료 범위가 아니다.

## 이번 세션에서 바뀐 것

- `source-folder-browser.module.css`: `.entries`와 `.breadcrumb ol`의 기본 margin/padding을 0으로 설정했다. 브라우저 기본 40px 들여쓰기 때문에 목록과 제목의 작업 면이 어긋나던 문제를 수정했다.
- `FolderListingView.tsx`: 루트에서는 제목만 표시하고 하위 경로에서 breadcrumb를 표시한다. 루트명 반복을 줄이고 상위 이동 기능은 유지했다.
- `check-source-folder-browser.mjs`: 네 폭의 실제 좌표·computed style, 루트 중복 없음, 하위 경로·부모 조작을 추가 확인하고 하위 화면을 캡처한다.
- `check-settings-folder-connection.mjs`: `/files`의 연결 조작 전에 관리 영역을 연다. 목록 읽기의 read 권한 조회와 사용자 권한 요청/picker/저장소 재복원을 구분한다. 경로 왕복 후 불필요한 호출 없음 검사는 유지했다.
- `check-live-screens.mjs`: 제거된 미구현 문구 대신 실제 탐색 영역을 기다린다.
- `measure-settings-performance.mjs`: 기존 1440px 기본값을 유지하며 390px 별도 결과 파일을 지원한다.
- DESIGN·목록/연결/실제 화면 명세·기술 요약의 현재 상태를 갱신했다. 새 의존성·lockfile 변경은 없다. 기존 컨트롤러 업무 동작은 이번 마무리에서 수정하지 않았다.

## 코드 읽는 순서와 연결 관계

경로는 저장소 기준이며 줄 번호는 이 기록 시점 기준이다.

1. [목록 명세](../../specs/source-folder-listing.md): LIST-001~010은 reader/session, LIST-UI-001~012는 화면 수명·실패 결과다. 목록 1,000개 한도와 문서 처리 500개 한도를 구분한다.
2. [source-folder-browser.test.ts](../../../apps/web/src/features/local-folders/source-folder-browser.test.ts): 실제 controller/session/reader를 조합하고 외부 브라우저 I/O만 대체한 12개 수명 테스트다. 27일 기록에는 미구현 실패 후 구현한 과정이 있고, 이번에는 기존 전체 88개를 재실행했다. 이번에 실패 테스트를 새로 작성했다고 주장하지 않는다.
3. [source-listing-controller.ts:17](../../../apps/web/src/features/local-folders/source-listing-controller.ts#L17): UI 상태의 유일한 소유자다. `activate`(50)는 화면 구독 수를 세고 최초 읽기를 지연한다. `reset`(56)은 이전 작업을 무효화하고 결과를 비운다. `suspend`(63)는 picker 취소에 대비해 기존 목록을 보존하고 새 읽기를 막는다. `resume`(71)은 연결 결과에 맞춰 다시 활성화한다.
4. 같은 파일 `open`(76): 요청 경로를 복사하고 세대/AbortController를 만든다. 성공하면 경로와 목록을 함께 교체한다. 실패하면 마지막 목록을 남기고 read/missing/permission/cancelled를 구분한다. 세대가 달라진 늦은 성공·실패는 게시하지 않는다. `refresh`(107)는 표시 경로, `retry`(108)는 실패했던 요청 경로를 읽는다. `cancel`(109)은 대기 표시를 즉시 끝내며 OS I/O 자체의 강제 종료를 보장하지 않는다.
5. [source-connection-controller.ts:61](../../../apps/web/src/features/local-folders/source-connection-controller.ts#L61): listing 인스턴스를 소유하고 읽기를 session에 위임한다. load/stop/unavailable/해제는 목록을 비우고, 연결 교체 성공은 새 루트를 읽으며, 재연결은 기존 경로를 갱신한다. 저장 실패나 picker 취소는 이전 목록을 보존한다. 권한 오류 callback은 연결 view도 함께 갱신한다.
6. [connection-session.ts:99](../../../apps/web/src/features/local-folders/connection-session.ts#L99) → [source-folder-listing.ts](../../../apps/web/src/features/local-folders/source-folder-listing.ts): 계정·연결·목록 순번을 검증한 뒤 직접 자식을 열거한다. read 권한 확인, 경로 검증, create:false, 상한·취소가 이 경계에 있다. 표시 UI에는 핸들을 돌려주지 않는다.
7. [use-source-folder-connection.ts:37](../../../apps/web/src/features/local-folders/use-source-folder-connection.ts#L37) → [SourceFolderBrowser.tsx:9](../../../apps/web/src/features/local-folders/SourceFolderBrowser.tsx#L9): 공유 listing을 받아 `useSyncExternalStore`로 구독하고 effect에서 활성화한다. 읽기 완료 후 사라진 조작의 초점만 제목으로 복구한다. 연결 관리 접힘은 여기서 담당한다.
8. [FolderListingView.tsx:26](../../../apps/web/src/features/local-folders/FolderListingView.tsx#L26): `state`, `folderName`, ref와 콜백만 받아 제목·경로·항목·상태를 표시한다. 브라우저 저장소·권한·서버 API를 직접 호출하지 않는다. 폴더 버튼은 경로 배열을 `onOpen`에 넘기고 파일은 이름/종류만 표시한다.
9. [files/page.tsx](../../../apps/web/src/app/(workspace)/files/page.tsx): 작업 shell 안에 SourceFolderBrowser를 조합한다. 공유 layout/provider 덕분에 설정·대화·내 폴더 왕복 시 같은 연결과 목록을 사용한다.

대표 호출 흐름은 `폴더 클릭 → onOpen(path) → listing.open → session.listSourceFolder → reader → 상태 게시 → 구독 렌더`다. 표시/상태/연결 수명/브라우저 접근을 각각 읽을 수 있게 분리했으며 파일 수를 늘리기 위한 범용 계층은 추가하지 않았다.

## 이번에 실행한 검증

| 검사 | 결과와 근거 |
| --- | --- |
| `pnpm check` | web/domain/S0 타입, ESLint, 단위 88개(8파일), 서버 경계 21개, production build 43페이지 통과 |
| 목록 브라우저 | [46개, 실패 0](final-20261028/browser-checks.json). 실제 UI/controller/session/IndexedDB/Web Locks/OPFS, 합성 picker·권한·실패 |
| 기존 연결 회귀 | [51개 기록, 실패 0](final-20261028/connection-regression/browser-checks.json). 기능 확인 49개 + 반복 작업 측정 2개 |
| 실제/시안 경계 | [69개, 실패 0](final-20261028/live-regression/screen-checks.json). 모바일 Tab/Enter, 실제 경로의 합성 데이터 부재, 시안의 실제 저장소 접근 없음 |
| taste 소스 lint | 표시 TSX 2개와 CSS, 0 FAIL/0 WARN |
| 목록 taste 앱 probe/judge | 9개 캡처 상태/폭에서 0 FAIL/0 WARN. 원자료 위 목록 JSON의 visual 필드 |
| 성능 | desktop 6경로×3회, 390px 6경로×3회. [원자료·전후 표·한계](final-20261028/performance.md) |

브라우저 기록 합계 166은 서로 독립적인 테스트 케이스 166개를 뜻하지 않는다. 레이아웃 확인과 반복 측정 기록도 포함한다. 첫 연결 회귀 실행은 JSON/오류 로그 없이 exit 1로 종료되어 결과로 채택하지 않았다. 같은 코드를 재실행한 최종 JSON과 exit 0을 근거로 삼았고 최초 종료 원인은 규명하지 못했다.

개발 도구는 프로젝트 고정 Node 24.22.1, Next 16.4.3, TypeScript 5.9.3, Vitest 5.0.5를 사용했다. Next 설치본 CSS 가이드와 실제 import/API를 확인했다. 이전 성능 Chrome 155와 현재 성능 Chrome 156의 버전 차이를 명시했다. 현재 브라우저 환경 차이를 숨기고 무회귀·최적화 성공으로 판정하지 않는다.

## 화면 검토

[연결 1440](final-20261028/connected-1440.png), [1920](final-20261028/connected-1920.png), [768](final-20261028/connected-768.png), [390](final-20261028/connected-390.png), [하위](final-20261028/child-390.png), [빈 폴더](final-20261028/empty-390.png), [읽기 오류](final-20261028/read-error-390.png), [갱신](final-20261028/refreshing-1440.png), [권한](final-20261028/permission-390.png)을 직접 열어 확인했다.

화면 질문은 ‘현재 폴더 안에 무엇이 있고 어디로 들어갈 수 있는가’다. 목록이 가장 큰 영역을 차지하며, 제목·목록·하단 안내의 좌우 작업 면이 맞는다. 긴 이름은 잘라 숨기지 않고 줄바꿈한다. 색은 기존 팔레트와 오류/권한 의미에만 사용한다. 개수는 실제 result.entries.length이며 일부 목록은 상한 안내를 붙인다. 모바일은 한 열이고 기존 메뉴를 재사용한다. 기존 achromatic-ledger(seed 2044201404)를 유지했고 재추첨하지 않았다.

실제 화면 경계 검사의 미연결/미구현 화면에는 기존 빈 공간 FAIL/WARN과 `/files` 미연결 상태의 여백 WARN이 남는다. 데이터가 없는 상태에 예시를 채우거나 승인된 채팅을 재설계하지 않았다. 따라서 전체 사이트 시각 검사 통과나 UX 완성으로 보고하지 않는다.

## 원본 보호와 미검증 범위

- 고정 이름의 합성 OPFS 폴더와 sentinel, 100/1,000/1,001개 순번 fixture만 사용했다. 외부 데이터·개인 노트·무작위 seed 없음. 개발 회귀셋이며 holdout/사용자 검토 완료가 아니다.
- sentinel 경로/hash/size/mtime 동일, 제품 본문 읽기·쓰기 0과 외부 요청 없음 확인. 실제 폴더를 자동 업로드하지 않는다.
- OS 네이티브 선택창·실제 디스크 권한 철회/재시작, 실제 로그인·계정 동기화, 스크린리더 전체 인증은 미검증이다. 실제 입력창이 없어 OS IME 검사는 해당 없음이다.
- 성능 전체 자산은 +27,009 bytes이며 `/` LCP 변동이 커 무회귀 판정은 보류한다. field INP·Lighthouse TBT·실제 모바일 장치·서버 부하는 미측정이다.
- 바탕화면 기술 요약 사본은 27일 스냅샷이다. 현재 상태는 갱신한 저장소의 `docs/project-stack-and-security.md`를 따른다.

## 재현

```powershell
pnpm check
pnpm --filter @personal-ai/web start --port 3002
# 다른 터미널에서; 기존 증거를 덮어쓰지 않도록 새로운 출력 폴더 사용
pnpm exec node scripts/check-source-folder-browser.mjs http://127.0.0.1:3002 docs/verification/source-folder-browser/recheck
pnpm exec node scripts/check-settings-folder-connection.mjs http://127.0.0.1:3002 docs/verification/source-folder-browser/recheck/connection-regression
pnpm exec node scripts/check-live-screens.mjs http://127.0.0.1:3002 docs/verification/source-folder-browser/recheck/live-regression
pnpm exec node scripts/measure-settings-performance.mjs after http://127.0.0.1:3002 docs/verification/source-folder-browser/recheck
pnpm exec node scripts/measure-settings-performance.mjs after http://127.0.0.1:3002 docs/verification/source-folder-browser/recheck 390
```

이번 단위는 코드 검토 가능한 상태다. 다음 후보는 MD/TXT 본문 미리보기이며 사용자 검토 뒤 별도 명세·실패 테스트부터 진행한다.
