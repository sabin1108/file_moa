# 최신 인수인계 — 2026-10-27 파일 목록 UI 구현 중간 저장

사용자 최신 요청: “memory에 저장해야해 지금까지 한거”. 이 절이 과거의 “목록 화면 연결은 아직 시작하지 않음”보다 우선한다. **목록 UI 구현과 1차 검증은 진행했지만 최종 마무리는 남아 있다. 완료로 보고하지 않는다.** 이번 저장 시점에는 제품 코드를 추가로 수정하지 않았다.

## 구현한 내용과 읽을 파일 순서

프로젝트: E:/project/ai_folder_project. 아래 경로는 프로젝트 기준이다.

1. `docs/specs/source-folder-listing.md`: LIST-UI-001~012 추가. 화면 활성화 시 최초 읽기, 성공 후 경로 전환, 실패 시 이전 목록 보존/오래됨 표시, 취소와 늦은 결과 무시, 연결 교체·계정 변경·해제 시 비움, 권한 재연결, 경로 왕복 보존, 빈 폴더/1,000항목 제한을 명세했다.
2. `apps/web/src/features/local-folders/source-folder-browser.test.ts`: 실제 controller/session/reader를 조합한 12개 테스트. 먼저 미구현 실패를 확인한 뒤 구현해 통과했다. 폴더 변경/취소/실패/권한/소유자 변경의 수명 규칙을 검증한다.
3. `apps/web/src/features/local-folders/source-listing-controller.ts`: 목록 상태와 읽기/갱신/재시도/취소, 지연 활성화, 세대와 AbortController를 소유한다. 새로고침은 표시 중 경로, 재시도는 실패한 요청 경로를 사용한다.
4. `apps/web/src/features/local-folders/source-connection-controller.ts`: 기존 연결 controller가 listing을 소유하고 연결·재연결·해제·stop과 목록 수명을 동기화한다. `use-source-folder-connection.ts`에서 공유 listing을 노출한다.
5. `apps/web/src/features/local-folders/SourceFolderBrowser.tsx`: 공유 상태 구독/활성화, 연결 관리 접힘, 읽기 종료 후 사라진 초점 복구를 담당한다.
6. `apps/web/src/features/local-folders/FolderListingView.tsx` 및 `source-folder-browser.module.css`: 표시와 콜백만 소유한다. 폴더 이동/상위/경로/새로고침/취소, 실제 파일명, 빈 상태와 오류/권한/제한 안내. 파일은 아직 본문을 열지 않는다. 기존 Icon/StatusNotice/버튼/디자인 토큰을 재사용했다.
7. `apps/web/src/app/(workspace)/files/page.tsx`: 기존 목록 미구현 안내 대신 실제 SourceFolderBrowser를 구성한다.
8. `scripts/folder-browser-fixture.mjs`, `scripts/check-source-folder-browser.mjs`: 제품 코드에 테스트 훅을 넣지 않고 독립 브라우저에 합성 OS 경계와 OPFS 자료를 주입한다.

## 실행한 검증과 증거

- 이 구현 턴에서 전체 단위 테스트 88개(8개 파일), pnpm typecheck, pnpm lint, pnpm build(43페이지)가 통과했다. 이번 memory 저장 작업에서는 이 명령들을 다시 실행하지 않았다.
- `docs/verification/source-folder-browser/browser-checks.json`: 2026-10-27T10:22:14.607Z 기록. 실제 UI/controller/session/IndexedDB/Web Locks/OPFS를 사용하는 39개 확인 모두 통과. memory 저장 시 JSON을 다시 읽어 39개/실패 0을 확인했다.
- 폴더 연결 시 불필요한 목록 읽기 없음, 첫 목록/하위/상위/빈 폴더, Enter 이동과 초점, 경로 10회 왕복 유지, 갱신 실패/재시도, 읽기 취소 후 늦은 결과, 권한 철회와 재연결, 선택 취소/저장 실패/연결 교체, 해제 실패 시 목록 제거를 확인했다.
- 390/768/1440/1920px 가로 넘침 검사 통과. 스크린샷은 같은 검증 폴더의 connected-*.png, empty-390.png, read-error-390.png, refreshing-1440.png, permission-390.png. 연결 상태 네 폭은 직접 보았고, 나머지 상태의 직접 시각 검토는 남았다. 자동 시각 검사 지적은 없었지만 수동 확인에서 기본 목록 들여쓰기 문제를 발견했다.
- 제품 측 파일 본문 읽기/쓰기/외부 전송이 없는지 확인하고, 합성 sentinel의 hash/크기/mtime이 유지됨을 검사했다. OS 네이티브 선택창/권한/실제 디스크/실제 계정/IME 검증과 구분한다. 개인 원본 D:/sabin/note는 사용하지 않았다.
- `performance-before.json`: 기존 6개 경로 각 3회, production/1440×900/무제한속도/차가운 HTTP 조건, staticBytes 744911. after 측정과 비교는 아직 없다. 목록 100/1000/1001항목 각 3회 약 62~133ms는 CDP 조작+열거+렌더+폴링 측정이며 현장 INP나 성능 개선 근거가 아니다.
- 이전 단위의 test:boundaries 21개, 연결 공유 49개, 실제/시안 경계 69개 통과는 과거 결과다. 현재 UI 변경 후 해당 회귀 검사를 재실행했다고 말하지 않는다.

## 정확히 남은 작업 — 여기서 이어갈 것

1. CSS의 `.entries`와 `.breadcrumb ol`에 기본 ul/ol margin/padding 제거가 필요하다. 현재 약 40px 들여쓰기로 제목과 행이 어긋난다. 루트 경로에서 제목과 같은 루트명 breadcrumb 중복도 줄이는 방향을 검토했다. **직전 apply_patch는 TSX 줄 매칭 실패로 적용되지 않았고, CSS를 다시 읽어 변경 없음 확인.** 수정 완료라고 가정하지 않는다.
2. 관련 작은 수정 후 build/서버 재시작, 새 브라우저 검사와 최종 스크린샷 확인. 오류/권한/빈 폴더/갱신 화면도 직접 본다. 필요 시 기존 디자인 스킬 앱 검사 실행.
3. 기존 회귀 스크립트의 새 동작에 맞지 않는 가정만 조정하고 실행한다. `check-settings-folder-connection.mjs`: `/files` 연결 관리가 접혀 있어 숨은 버튼 조작 전 details를 열어야 한다. 첫 `/files` 조회의 read 권한 query는 정당하므로 “권한 요청/picker/IDB 재복원 없음”과 구분한다. `check-live-screens.mjs`: 옛 목록 미구현 문구 대기 대신 현재 탐색 영역을 기다린다. 테스트를 약화하거나 실제 실패를 숨기지 않는다.
4. `pnpm test:boundaries` 실행, 수정 범위에 맞는 단위/타입/린트/빌드 최종 검증. 현재 실패가 확인된 것은 시각 정렬 문제이며, 전체 완료 증거 수집이 남았다.
5. `scripts/measure-settings-performance.mjs`로 같은 조건의 after 측정/비교. 실제 UI 변경에 대한 docs/performance-policy.md 기준의 desktop/mobile 측정과 한계 기록. 기존 결과를 덮어쓰지 않는다. Lighthouse는 기존 설치/고정 도구를 활용하고 새 의존성을 추가하지 않는다.
6. 이 검증 폴더에 최종 README(코드 읽는 순서/흐름/실행 근거/제한)를 작성한다. DESIGN.md, 관련 spec/live-workspace 등 “목록 미구현” 상태를 최신화하고, 명세의 이전 “다음 단위” 문장도 정리한다. 현재 HANDOFF.md는 중간 기록이며 최종 보고서가 아니다.
7. 이 UI 단위 완료 보고 후 사용자 코드 검토 흐름을 유지한다. 다음 MD/TXT 본문 미리보기, 이동/복사/분류, 로그인/AI로 자동 확대하지 않는다.

## 실행 환경과 지속 제약

- 마지막 production 서버는 `pnpm --filter @personal-ai/web start --port 3002`, 실행 세션 63812. 마지막 확인 URL http://127.0.0.1:3002/files. 다음 세션에서 생존/빌드 최신 여부를 확인한다. 기존 3001과 origin이 달라 IndexedDB 연결 상태를 공유하지 않는다. 사용자 서버를 무작정 종료하지 않는다.
- 제한 환경 브라우저 초기화 Page.enable timeout은 이전에 확인했고, 이번 브라우저 검사는 자동 승인된 제한 밖 실행으로 완료했다. 동일 실패를 불필요하게 반복하지 않는다. 합성 자료와 독립 프로필만 사용한다.
- Git은 기존부터 첫 커밋 전이며 대부분 untracked다. 이번 변경만 새 파일 전체로 오인하거나 정리/삭제하지 않는다. 새 의존성/lockfile 변경 없음.
- 사용한 스킬: personal-ai-files, personal-ai-ui, design-taste-frontend 앱 규칙. 승인된 시안을 재설계하지 않는다. 단순 보기 컴포넌트와 상태/브라우저 접근을 분리한다.
- 사용자 강조: SDD 명세→실패 테스트→구현→검증→설명, 작은 검토 단위, 원본 보호, 실제 기능과 시안/미검증 구분. 이번에는 12개 미구현 실패→88개 전체 통과와 실제 브라우저 경계 검증으로 행동을 연결했다.
- 서버 API 데이터 업무 가공/인증/소유권/최소 DTO는 서버 책임, 브라우저 업무 요청은 Server Actions 경유라는 앞선 기준 유지. 로컬 폴더 핸들은 브라우저에 두며 자동 업로드하지 않는다. Server Actions나 F12 차단만으로 보안 완성이라 주장하지 않는다.
- 앞선 바탕화면 기술 요약과 서버 경계 구현은 완료 상태 유지. 그 문서의 폴더 UI 미구현 설명은 최종 UI 마무리 시 함께 최신화할지 확인한다. 이 저장 요청은 새 기능을 추가하라는 요청이 아니다.
