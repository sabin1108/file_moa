# 자료 폴더 목록 읽기 — 세션/API 검토 단위

2026-10-27. 최신 인수인계의 다음 항목은 실제 파일·하위 폴더 목록 읽기였다. 사용자와 작은 코드 단위로 검토하는 방식에 따라 이번에는 명세, 읽기 로직, 기존 연결 세션과의 수명 경계, 테스트를 구현했다. **`/files` 화면에서는 아직 목록을 볼 수 없다.** 화면 통합과 MD/TXT 본문 미리보기는 후속 단위다.

## 코드 읽는 순서

1. [명세](../../specs/source-folder-listing.md): LIST-001~010의 입력·결과·실패·금지 부작용. `[]`는 연결 루트이고 `["하위"]`는 그 아래 폴더다.
2. [source-folder-listing.ts](../../../apps/web/src/features/local-folders/source-folder-listing.ts) 4줄: 목록 1,000항목 상한. 6줄 이후 결과에는 이름·종류·상대 경로만 포함하며 핸들을 노출하지 않는다. 13줄 `copyFolderPath`는 경로 탈출과 호출 중 입력 변경을 막는다. 24줄 정렬은 폴더 우선, 같은 종류는 이름의 코드 단위 순서다.
3. 같은 파일 31줄 `readSourceFolderListing`: 경로 복사 → read 권한 확인 → 요청한 하위 폴더만 `create:false`로 찾기 → 직접 자식 열거 → 권한 재확인 → 정렬된 결과 반환. 1,001번째 항목은 상한 초과 여부만 확인한다. 일부 목록은 `truncated:true`이며 파일이 삭제됐다는 근거로 쓰지 않는다. 파일 본문·크기·수정 시각은 읽지 않는다.
4. [connection-session.ts](../../../apps/web/src/features/local-folders/connection-session.ts) 99줄 `listSourceFolder`: 연결된 자료 핸들을 내부에서만 사용한다. 기존 계정 세대와 연결 순번을 캡처하고 별도의 목록 순번으로 이전 조회를 무효화한다. `assertCurrent`는 비동기 결과 전후에 호출된다. 취소는 `AbortError`, 오래된 조회는 `stale-connection-operation`으로 종료한다. `NotAllowedError`일 때만 현재 연결을 다시 연결 필요로 바꾸며 저장된 참조는 삭제하지 않는다.
5. [source-folder-listing.test.ts](../../../apps/web/src/features/local-folders/source-folder-listing.test.ts): 브라우저 핸들만 합성한 15개 회귀 테스트. 실제 session과 reader를 호출한다. 지연 Promise는 권한/열거 완료 시점을 제어하고, 취소·교체 이후 결과가 노출되는지 확인한다. 루프 안의 경계 변형은 별도 시나리오 수로 부풀리지 않는다.
6. [브라우저 검사](../../../scripts/check-source-folder-listing.mjs): 독립 프로필의 OPFS 폴더 2개와 작은 파일 3개를 만들고 실제 목록/하위 탐색을 확인한다. 테스트 준비와 전후 hash 비교만 본문/쓰기 API를 사용한다. 제품 reader는 이를 호출하지 않는다. 개인 자료 폴더에 접근하지 않는다.

새 reader 파일은 브라우저 탐색 책임, 기존 session은 연결·소유자·결과 수명 책임이다. UI·업무 상태·파일 접근을 한 컴포넌트에 넣지 않았다. 새 의존성과 범용 상태 계층은 없다.

`apps/web/tsconfig.json`에는 설치된 TypeScript의 `DOM.AsyncIterable`을 추가해 실제 `FileSystemDirectoryHandle.values()` 타입을 사용한다. `scripts/s0/probe-server.mjs`의 모듈 경로/변환도 추가해 기존 세션을 가져오는 브라우저 검사 도구의 import가 끊기지 않게 했다. 핸들에 없는 가짜 API를 타입 단언으로 덧붙이지 않았다.

## 검증

- 명세와 최초 13개 테스트를 구현 전에 작성했다. 첫 실행은 `session.listSourceFolder is not a function`으로 13개 실패했다.
- 구현 후 13개 모두 통과. 이후 열거 도중 해제와 마지막 권한 확인 도중 취소를 추가해 **15개 통과**.
- 기존 포함 전체 테스트 **76개 통과**(기존61+목록15). 마지막 두 경계 테스트 추가 후 전체·타입·린트를 재실행했다.
- web/domain 타입 검사, web ESLint, S0 타입 검사 통과. Next production build **43페이지** 생성 성공.
- 런타임 확인: pnpm으로 실행한 Node **24.22.1**, TypeScript **5.9.3**, Vitest **5.0.5**. Next **16.4.3**, 의존성/lockfile 변경 없음.
- 정적 접근 확인: 제품 reader에는 본문 읽기, 쓰기/생성/삭제, 권한 요청, 네트워크 호출이 없으며 하위 접근은 `create:false`다. 파일 필터와 UTF-8 검증을 이미 구현했다고 주장하지 않는다.
- [실제 브라우저 결과](browser-checks.json): Chrome155의 독립 프로필/실제 OPFS에서 **8개 확인 통과**. 자료 폴더2개, 하위 폴더1개, 파일3개의 경로·SHA-256·크기·수정 시각 전후 동일. 저장소 repository는 단위 범위에 맞춰 메모리 대체했으며 IDB 검증은 이번 실행에 포함하지 않았다. 권한 query와 폴더 열거는 실제 브라우저 API를 사용했다.
- 제한 환경에서는 Chrome2회/Edge1회가 `Page.enable`에서 timeout되어 검사 본문에 진입하지 못했다. 자동 승인된 제한 밖 실행에서 같은 검사 파일로 통과했다. 실패를 기능 불량이나 성공 사례로 집계하지 않았다.

미검증: OS 네이티브 폴더 선택/권한창, 실제 디스크 폴더, 실제 계정, `/files` 화면, 키보드/IME, 사이트 성능. 단위 테스트의 권한 철회/지연 오류는 합성 응답이다. 실제 UI·성능 완료나 전체 파일 관리 완료로 확장해 해석하지 않는다.

외부 API는 [WHATWG 디렉터리 API](https://fs.spec.whatwg.org/#api-filesystemdirectoryhandle)와 [WICG 권한 계약](https://wicg.github.io/file-system-access/#permissions)을 확인했다. 조회 순서는 보장되지 않으며 원자적 스냅샷이 아니다. 브라우저 조회에 AbortSignal 인자는 없으므로 이미 진행 중인 I/O를 강제 중단하는 기능으로 설명하지 않는다.

별도 검토 에이전트는 설치된 역할 모델을 이 계정에서 사용할 수 없어 실행되지 않았다. 이를 독립 리뷰 통과로 보고하지 않는다. 작성자가 세대/순번 검사 위치, 오류로 인한 새 연결 훼손 여부, API 타입·실제 호출, 브라우저 import 경계를 직접 재검토하고 경계 테스트 두 개를 보강했다.

## 재현과 다음 단위

```powershell
pnpm test apps/web/src/features/local-folders/source-folder-listing.test.ts
pnpm test
pnpm typecheck
pnpm lint
pnpm exec tsc --noEmit -p scripts/s0/tsconfig.json
pnpm build
pnpm exec node scripts/check-source-folder-listing.mjs
```

현재 화면에서 직접 확인하는 방식은 아직 제공하지 않는다. 다음 단위에서 기존 provider/controller 경계와 `/files`에 이 API를 연결해 초기 목록·하위 탐색·갱신/취소·오류/재연결을 표시한다. 연결/계정 변경 때 이전 목록을 비우고, 같은 폴더 갱신 실패 때 마지막 목록을 오래된 정보로 보존하는 상태 계약을 구현한다. 실제 UI·키보드·좁은 화면·경로별 성능은 그 통합에서 검증한다. 본문 미리보기는 그다음이다.
