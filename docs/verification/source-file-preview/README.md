# MD/TXT 원문 미리보기 — 2026-10-28

localhost 개발 연결에서 선택한 MD/TXT 파일을 실제로 읽고 표시하는 단위를 구현했다. 상한 2MiB, UTF-8, 명시적 클릭/Enter, 읽기 전용이다. Markdown은 원문 텍스트로 보이며 HTML·원격 이미지·링크를 실행하지 않는다. 실제 인증·AI·색인·원본 쓰기는 이번 완료 범위가 아니다.

## 먼저 읽을 위치

- [코드 안내](../../code-map.md): Next.js 진입점, 클릭→읽기→화면 갱신, 상태 소유권, 변경할 파일, 리뷰 순서, pnpm 선택 근거.
- [대화형 구조도](../../diagrams/local-files.html): 실제 구현의 10개 책임 노드. [생성 검증 영수증](../../diagrams/local-files.delivery.json), [브라우저 증거](../../diagrams/local-files.visual-check.json).
- [명세](../../specs/source-file-preview.md): PREVIEW-001~008 / PREVIEW-UI-001~007.

## 변경과 유지보수 판단

| 변경 파일(로컬 폴더 feature 기준) | 변경 이유와 책임 |
| --- | --- |
| source-file-preview.ts | 실제 파일 읽기·권한·크기·UTF-8 확인. 기존 경로 검증/domain 규칙 재사용 |
| connection-session.ts | readSourceFile 추가. 목록과 본문 요청 순서는 독립, 연결/소유자 수명은 공통 |
| source-preview-controller.ts | 한 문서 상태·갱신·취소·늦은 결과 처리. React/파일 API와 분리 |
| source-connection-controller.ts, source-listing-controller.ts | 교체/해제/권한 상실 시 목록과 미리보기 수명 동기화 |
| use-source-folder-connection.ts | 공유 controller의 preview를 React에 연결 |
| SourceFolderBrowser.tsx | 목록/본문 조합, 원래 버튼·스크롤 복귀, 사라진 취소 버튼 초점 복구 |
| FolderListingView.tsx | 지원 파일만 명시적 미리보기 버튼 제공 |
| SourceDocumentPreview.tsx, source-document-preview.module.css | 파일명·원문·접힌 정보·오류 표시. 읽기/통신을 소유하지 않음 |
| source-folder-browser.module.css, SourceFolderSettings.tsx | 연결 구획의 h2 의미를 유지하면서 기존 외형 보존, 연결만으로 본문을 읽지 않는다는 안내 명확화 |

기존 `actionClasses`, `StatusNotice`, CSS 토큰, `checkDocumentCandidate`, `copyFolderPath`를 사용했다. 표시·상태·수명·I/O 경계를 유지하고 새 의존성/만능 util/범용 프레임워크를 추가하지 않았다. 새 controller의 압축된 복수 문장을 풀고 핵심 코드에는 역할·복사·취소·원문 처리 이유를 주석으로 남겼다. 유지보수성을 파일 수나 줄 수로 평가하지 않는다.

## SDD/TDD의 실행 증거

1. 명세 작성 후 [reader-red.txt](reader-red.txt)에 미구현 reader 테스트 **13개 실패**를 기록했다. 경로·확장자·크기·인코딩·권한·취소·교체·목록과의 독립성을 검증한다.
2. reader/session 구현 후 통과시킨 뒤 [controller-red.txt](controller-red.txt)에 미구현 controller 테스트 **10개 실패**를 기록했다. 표시 보존·새 파일·닫기·교체·해제 실패·권한 동기화를 다룬다.
3. 통합 중 권한 콜백과 메서드의 이름 충돌에 따른 재귀를 테스트가 발견해 콜백을 `onPermissionLost`로 구분했다. 바이트 기대값 오기(17→16)도 실제 UTF-8 길이를 근거로 정정했다.
4. 브라우저에서 [focus-red/checks.json](focus-red/checks.json)의 취소 후 초점 복구 검사가 실패하는 것을 확인한 뒤 화면 조합 계층에서 수정했다.
5. Lighthouse의 [수정 전 desktop 보고서](lighthouse-before-desktop.report.html)는 `h1 → h3` 제목 단계 건너뛰기를 보고했다. 연결 관리의 실제 구획 이름을 `summary > h2`로 지정하고 공통 설정 행의 h3를 유지했다. 숨긴 제목을 추가하거나 검사 규칙을 제외하지 않았다.

문구/CSS와 컴포넌트 모양을 복제하는 단위 테스트를 늘리지 않았다. 실제 상태·원본 보호·키보드 행동을 검사한다. 신규 23개는 합성 핸들/Promise/바이트를 사용한 개발 회귀셋이며 무작위/외부 데이터/holdout은 아니다. 원본 개인 파일을 사용하지 않았다.

## 최종 검증

최종 production URL: `http://127.0.0.1:3004/files`. Node 24.22.1 (`pnpm exec`), pnpm 12.15.0, Next 16.4.3, Chrome 156. 기존 3002 origin의 IndexedDB와 다르므로 연결 복원이 자동으로 공유되지 않는다.

| 실행 | 결과 / 근거 |
| --- | --- |
| pnpm check | 타입(web/domain/S0), lint, 단위111개/10파일, 서버 경계21개, production build43페이지 통과. [로그](check-final.txt) |
| check-source-file-preview.mjs | **53개 확인, 실패0**. [원자료](browser-final/checks.json) |
| check-source-folder-browser.mjs | 기존 목록46개, 실패0. [원자료](listing-regression/browser-checks.json) |
| check-settings-folder-connection.mjs | 기존 연결51개, 실패0(기능49+측정2). [원자료](connection-regression/browser-checks.json) |
| check-live-screens.mjs | 기존 경로/경계69개, 실패0. [원자료](live-regression/screen-checks.json) |
| Lighthouse 13.5.0 | /files desktop/mobile 각각 성능100/98, 접근성100/100, 모범사례100/100. 제목 순서 실패 해소. [요약](lighthouse-summary.json), [desktop](lighthouse-desktop.report.html), [mobile](lighthouse-mobile.report.html). 단일 초기 화면 측정이며 전체 접근성 인증은 아님 |

브라우저 **219는 확인·측정 기록 합계**이며 독립 테스트 시나리오 219개가 아니다. 실제 UI/controller/session/IDB/Web Locks/OPFS를 사용하고 OS picker·권한·실패 응답만 합성 경계로 대체했다. sentinel hash/path/size/mtime 동일, 제품 쓰기0, 외부 요청0을 확인했다. 미리보기에는 실제 본문 읽기가 있으므로 제품 읽기0이라고 보고하지 않는다.

키보드 Enter 열기·제목 초점·닫기 후 파일 버튼/스크롤 복구·취소 초점, 10회 경로 왕복, 원문 DOM 비실행, 파일 정보 토글의 본문 DOM 보존, 빈 파일/잘못된 UTF-8/상한·초과/삭제/외부 수정/권한 상실·재연결/지연 결과를 검증했다. 390/768/1440/1920px와 파일 상한에서도 가로 넘침이 없었다.

표시 검토: 미리보기 11개 캡처(본문4폭·파일 정보·빈 파일·인코딩·초과·삭제·갱신·권한)를 확인했다. 해당 미리보기와 목록 probe/judge는 FAIL0/WARN0이다. **기존 연결 관리의 긴 폴더명 카드에는 여백 WARN, 미구현 대화/빈 화면에는 여백 FAIL/WARN이 남는다.** 동작 확인 통과를 사이트 전체 디자인 승인으로 부르지 않는다.

HTML은 JSX 소스와 공통 컴포넌트를 읽고 실제 DOM의 main·목록 자식·상호작용 중첩·ARIA 대상·제목 순서·초점으로 점검했다. 자동 검사 범위를 넘어 모든 콘텐츠 모델·스크린리더 적합성을 인증한 것은 아니다. `<p>`의 block 중첩과 버튼/링크 중첩을 피하며 의미가 없는 배치 그룹에 쓰는 div는 유지한다.

## 성능과 재현

[성능 표](performance.md)에 이전 기준선, 전체 정적 자산·6개 경로×desktop/390px×3회, 2MiB 파일/100·1000·1001항목의 실제 동작 비용을 기록했다. field INP·실제 디스크 성능으로 오해하지 않도록 측정 경계를 함께 적었다. Lighthouse는 폴더 미연결 초기 화면의 별도 desktop/mobile 기준선이다. 연결 후 읽기는 OPFS 브라우저 검증을 사용한다.

```powershell
pnpm check
pnpm --filter @personal-ai/web start --port 3004
pnpm exec node scripts/check-source-file-preview.mjs http://127.0.0.1:3004 docs/verification/source-file-preview/browser-final
pnpm exec node scripts/check-source-folder-browser.mjs http://127.0.0.1:3004 docs/verification/source-file-preview/listing-regression
pnpm exec node scripts/check-settings-folder-connection.mjs http://127.0.0.1:3004 docs/verification/source-file-preview/connection-regression
pnpm exec node scripts/check-live-screens.mjs http://127.0.0.1:3004 docs/verification/source-file-preview/live-regression
```

각 브라우저 스크립트는 격리 프로필을 사용한다. 원자료를 보존하려면 재실행 시 다른 출력 디렉터리를 지정한다. 제목 수정 전 Lighthouse와 focus-red는 실패 근거이며 최신 성공 자료로 인용하지 않는다. `browser/`, `check.txt`는 중간 결과, `browser-final/`, `check-final.txt`가 최종 결과다.

## 남은 제품 경계

실제 로그인/계정 소유권 발급, 네이티브 OS 권한창, 실제 디스크 파일의 외부 변경 경쟁, 완전 브라우저 재시작, 스크린리더 검증은 완료하지 않았다. 미리보기는 입력창이 없어 OS IME 대상이 아니다. 한 번에 한 본문만 보관하며 닫기/해제 시 애플리케이션 참조를 비우지만 운영체제 메모리의 즉시 보안 삭제를 보장하지 않는다. Markdown 렌더링·쓰기·업로드·색인은 별도 계약과 검증이 필요하다.

구조도는 9개 artifact 검사/오류0/경고0, 자동 브라우저 검사 통과와 라이트·다크 화면 확인을 분리해 기록했다. SHA-256과 바이트 수는 생성/브라우저 영수증에 있다. 도구의 Viewer UI와 html lang은 영어로 생성되며 내용/설명은 한국어다. 전체 내보내기 형식과 모바일 Viewer 조작까지 검증했다고 주장하지 않는다.
