# 대화 안 정리와 공통 폴더 비교 적용

후속: [현재 질문에 로컬 채팅 답변을 연결했다](../organization-reply/README.md). 아래 자연어 답변 미구현은 이 단위 전의 상태이며 일반 자유 대화 이해와 실제 Windows 전체 검증은 여전히 별도다.

2026-11-08. 승인된 대화 중심 방향을 정식 채팅에 연결했다. [이전 시안](../chat-first-design/README.md)은 당시 상태로 보존한다. 일반 자연어 답변 해석은 추가하지 않았으며 날짜·혼합 자료는 기존 검증된 질문 입력으로 답한다.

## 결과와 읽을 순서

1. `LiveConversation` → `ConversationWorkspace`: 자료 확인·질문·제안·검토를 대화 안에 한 번만 표시한다. 정식 채팅은 오른쪽 창을 자동으로 열지 않는다. 샘플 채팅은 기존 자료 창을 유지한다.
2. `OrganizationPreparationPanel`: 기존 Provider/controller 구독과 화면 조합이다. `OrganizationConditionsView`는 조건 입력, `OrganizationDocumentsView`는 선택·발췌, `OrganizationSnapshotView`는 전송 확인, `OrganizationResultView`는 제안 표시다. 상태는 기존 controller가 소유한다.
3. 순수 `buildComparisonTrees` → `FileChangeComparison`: 출발/도착 경로를 현재·예상 구조로 표시한다. 일반 `FileChangePlanView`, 공통 `ManagedOperationView`, `OrganizationExecutionPanel`, 시안이 함께 사용한다. 복사는 원본도 남긴다. 기본8개/전체 보기, 모바일 전환, 선택 항목만의 구조라는 설명을 제공한다. 기존 충돌 상세는 충돌이 있으면 열린다.
4. 기존 execution controller → `ManagedFilesDialog` → 검사/보존/복사·이동/복구를 유지한다. 공통 비교는 파일 접근·경로 승인·충돌 판정 없이 표시만 담당한다. 새 writer·실행 엔진·의존성은 없다.

[사용자 행동부터 호출·반환·화면까지 읽기](../../reports/chat-first-live-reading.md).

## 하이드레이션 원인

사용자 제공 차이는 루트 `<html>`의 `data-map-dyoa-ext="1.3.0"`다. 제품 소스에서 설정하는 속성이 아니며 브라우저 확장 프로그램이 React 시작 전 바꾼 HTML과 초기 렌더가 달라진 경우다. 확장 프로그램 이름은 확인하지 않았다. RootLayout의 고정 스타일은 이번에 바꾸지 않았다.

[실제 RootLayout과 시안의 SSR→hydrate 검사](hydration-checks.json): 깨끗한 HTML은 경고/예외0, 제공 속성을 주입하면 같은 경고와 RootLayout 차이가 재현됐다. 후자는 의도한 재현이다. 인증된 사용자 창 전체 검사로 확대하지 않는다. 앱에 경고 억제나 SSR 중단을 추가하지 않았다. 확장 프로그램의 이 사이트 접근 해제 후 새로고침은 사용자 환경에 남아 있다. [Next.js 공식 설명](https://nextjs.org/docs/messages/react-hydration-error).

## 현재 검증

- 전체998개/103파일, 타입·린트·빌드, 서버 경계21, 구조25 web/6 domain/3 layout 통과. 빌드 `CydLoWSShzQgTYL4jWE3b`.
- [자료 준비28](preparation/browser-checks.json): 실제 controller/session/Worker/OPFS, 조건·선택·취소·계정 경계·조합 입력·상태 보존.
- [전송23](transfer/browser-checks.json): 명시 동의/전송 분리, 재검사, 중복/취소/늦은 응답/실패/F5. 인증·공급자는 합성 대체다.
- [완성 흐름30](completion/browser-checks.json): 참고 구조·묶음 질문·새 동의, 실제 OPFS 복사·보존 이동·기록·복구·원본 변경 차단. 390/768/1440/1920px 준비/검토, 가로 넘침 없음, 모바일 전환과 Tab/Enter 확인. [준비390](completion/ready-390.png), [검토1440](completion/review-1440.png).
- [성능 전후54+54](performance.md). 이번에 실제 AI 생성/개인 자료 전송/Windows 원본 변경/배포는 실행하지 않았다.

도구의 초기 Vite 준비 대기, 옛 상세 선택자, Enter 문자 누락과 SSR fixture의 동기 스크립트 린트 오류를 수정한 뒤 재검사했다. 서버/클라이언트는 동일한 async module을 표시한다. 초기 실패는 통과로 합산하지 않았다.

## 재현과 한계

`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm test:boundaries`, `pnpm test:structure`, `pnpm build`. 브라우저는 루트에서 `node tests/browser/check-live-local-preparation.mjs <새 결과 폴더>`, `check-live-ai-transfer.mjs`, `check-live-organization-completion.mjs` 순으로 검사한다. 하이드레이션은 `node tests/browser/check-chat-first-hydration.mjs`다. 브라우저 검사는 격리된 fixture owner/권한/OPFS와 Next 탐색 shim을 쓴다.

물리 한국어 IME, 실제 Windows 답변 후 재전송·복사·이동·복구 전체 여정, 사용자 확장 프로그램 해제 후 화면, 실제 사용성 개선은 미검증이다. 사용자 보고는 기존 로그인·소스/보관함 연결과 첫 제안의 보류2개까지다.
