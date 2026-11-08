# 확인한 자료를 AI에 보내는 코드 따라 읽기

2026-11-08. 정식 로컬 준비의 다음 단위다. 원본을 바꾸는 실행 기능은 연결하지 않는다. [검증과 한계](../verification/live-ai-transfer/README.md)를 함께 읽는다.

1. 사용자가 자료 창에서 이름·발췌·전송 조건을 보고 확인 체크를 누른다. [OrganizationSnapshotView](../../apps/web/src/features/local-folders/components/organization/OrganizationSnapshotView.tsx)의 `onChange`는 `controller.consent(checked)`를 호출한다. [controller](../../apps/web/src/features/local-folders/store/organization-preparation-controller.ts)의 `confirmationKey()`는 요청·scope·기준·참고·목적지와 선택한 문서의 경로/전체·발췌 해시를 묶는다. 이 단계는 외부 요청을 하지 않는다.

2. **‘확인한 발췌를 AI에 전송’** 버튼의 `onClick` 콜백이 `controller.send(organizeAction)`을 실행한다. `organizeAction`은 함수 참조다. [홈 페이지](../../apps/web/src/app/(workspace)/page.tsx)가 실제 Server Action을 `LiveConversation`에 전달하고, 채팅은 자료 창으로 전달한다. 페이지를 그리는 시점에는 함수를 호출하지 않는다.

3. `send()` 안에서 현재 단계가 `ready`인지, 선택과 확인 키가 아직 일치하는지 검사한다. 이전 작업을 `stop()`으로 끝내고 새 `sequence`와 `AbortController`를 만든 뒤 `checking` 상태를 게시한다. React는 `useSyncExternalStore` 구독으로 이 상태를 받아 재검사 중 표시와 중지 버튼을 그린다. `sequence`는 오래된 작업의 결과를 구분하는 번호이고, `AbortSignal`은 읽기를 그만두라는 신호다.

4. `await this.recheck(documents, instruction, signal)`로 [session.recheckSourceSnapshot](../../apps/web/src/features/local-folders/services/connection-session.ts)에 들어간다. session은 현재 owner를 잡고 기존 `inspectSourceSnapshot()`에 **선택된 파일 경로만** 전달한다. 이 함수가 기존 reader와 Worker로 파일을 다시 읽는다. [copy-hash.worker](../../apps/web/src/features/local-folders/services/copy-hash.worker.ts)는 같은 바이트에서 전체 SHA256과 UTF-8 발췌/해시를 만든다. 원본 쓰기나 새 권한 요청은 없다.

5. session으로 결과가 돌아오면 같은 경로의 전체 해시·발췌 해시·실제 발췌·크기·수정 시각을 이전 사본과 비교한다. 파일 크기가 같아도 내용이 다르면 전체 해시가 달라 전송을 중단한다. 재검사에 성공하면 이 읽기를 소유한 `{ userId, workspaceId }`만 반환한다. 이 값은 서버 권한을 부여하는 증명이 아니라, 오래된 브라우저 계정과 현재 서버 계정을 비교하는 값이다.

6. controller로 돌아와 작업 번호와 취소 여부를 다시 검사한다. 유효하면 `sending`으로 바꾸고 동의를 소모한 뒤, 새 `발급시각:UUID`와 확인한 문서/조건을 넣어 `await action(input)`을 호출한다. 이제 처음으로 [live-ai Action](../../apps/web/src/app/actions/live-ai.ts)이 실행된다. 이 파일은 실제 요청의 Origin을 읽어 [organizeLive](../../apps/web/src/server/live-organization.ts)에 전달한다. 파일 핸들과 바이너리는 전달하지 않는다. 짧은 텍스트는 1,200자 발췌 안에 본문 전체가 들어갈 수 있다.

7. `organizeLive()`는 `requireWorkspace()`로 서버 세션을 확정한다. Origin·런타임 스키마·입력 총량·경로·중복·scope·발췌 SHA256을 검사한다. 클라이언트가 입력한 workspace로 DB 권한을 고르는 방식이 아니다. 그 값이 서버 세션과 다르면 거부한다. 서버는 로컬 파일을 읽을 수 없으므로 전체 파일 해시가 실제 원본의 값인지는 증명하지 못한다.

8. 기존 [createAuthRateLimiter](../../apps/web/src/server/auth-rate-limit.ts)의 `consumeAll()`이 요청/작업 공간/계정/샘플 공용 한도를 하나의 짧은 DB 트랜잭션에서 예약한다. 하나라도 거부되면 예약 전체를 되돌린다. **같은 요청 ID는 payload가 달라도 다시 생성하지 않는다.** 시각이 요청 ID 자체에 포함되고 5분이 지나면 거부되므로 1시간 예약 창이 끝난 뒤 오래된 ID를 다시 보내도 요청으로 인정하지 않는다. 생성 결과를 저장해 재전달하는 캐시는 없다.

9. 예약 뒤 세션을 다시 확인하고 [generateOrganization](../../apps/web/src/server/organization-generation.ts)에 들어간다. 샘플과 같은 의미·근거 정책을 사용하되 실제 목적지와 참고 경로를 독립 context로 준다. 참고 경로의 내용/구조를 읽은 것으로 취급하지 않는다. 기존 [generateGeminiJson](../../apps/web/src/server/gemini-classification.ts)이 Google에 `countTokens`를 먼저 보내고 입력 상한 안에서만 생성한다. 이 계산도 외부 전송이다. 자동 재시도나 모델 대체는 없다.

10. 공급자 응답이 돌아오면 세션을 다시 확인하고 `parseOrganizationResponse()`로 선택 ID, 실제 발췌의 인용, 확인 가능한 날짜, 안전한 상대 경로를 검증한다. 결과를 받았다는 이유로 원본 파일에 쓰지 않는다. 서버는 검증된 제안·사용 모델·토큰만 반환하고 본문/결과를 DB나 로그에 저장하지 않는다.

11. controller로 돌아온 결과가 현재 작업 번호와 일치할 때만 `review`와 `result`로 게시된다. [OrganizationResultView](../../apps/web/src/features/local-folders/components/organization/OrganizationResultView.tsx)가 제안·인용·확인 필요 이유·사용량을 표시한다. 이는 실제 파일 작업이 아닌 제안이다. 실패는 확인 키를 비워 새 체크와 클릭을 요구한다. 서버가 세션 문제를 반환하면 초안·발췌까지 비운다.

12. 중지/조건 변경/소유자 교체는 작업 번호를 바꾸고 로컬 신호를 취소한다. 이미 보낸 Server Action을 브라우저 신호만으로 멈췄다고 보장하지 않으며 늦은 결과만 버린다. 이미 사용한 요청량도 환급을 보장하지 않는다. 상태는 Provider 메모리에만 있으므로 F5는 자동 재전송이나 원본 작업을 실행하지 않는다.

이번에 검증한 것은 대체 공급자와 합성 OPFS의 연결 흐름 및 실제 production Action의 거부 경계다. 실제 로그인 계정과 개인 문서를 Google까지 보내는 여정, Windows 네이티브 권한창, 물리 IME는 검증하지 않았다. 날짜/혼합 자료에 답하는 후속 질문과 복사·이동 계획 연결은 다음 단위다.
