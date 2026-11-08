# 요청 후 대화 안에서 정리하는 코드 흐름

2026-11-08. [검증과 한계](../verification/chat-first-live/README.md).

## 요청을 제출하면

`LiveConversation`은 입력을 기존 `organization.update({ request })`로 보관한다. `onSend`에는 함수를 전달하고 실제 제출할 때 `organization.prepare()`를 호출한다. prepare의 읽기·후보·버전 처리는 기존 controller/session/Worker가 수행한다.

상태가 바뀌면 `useSyncExternalStore` 구독으로 새 snapshot을 받는다. `submittedRequest`가 있으면 `ConversationWorkspace.interaction`에 `OrganizationPreparationPanel`을 전달한다. shell은 대화 안에 렌더링하며 별도 질문 상태나 파일 사본을 만들지 않는다. 이때 예전 메시지 끝으로 강제 스크롤하는 효과는 적용하지 않아 질문을 건너뛰지 않는다.

## 전송 확인과 질문에 답하면

조합 컴포넌트가 질문·전송 확인·제안·실행·조건을 배열한다. 조건 입력은 `OrganizationConditionsView`, 문서 선택/발췌는 `OrganizationDocumentsView`가 표시한다. controller 메서드 참조를 받아 클릭/입력할 때 호출한다. 파일 handle이나 공급자 호출은 직접 다루지 않는다.

`OrganizationSnapshotView`는 참고/목적지, Google에 보낼 내용, 짧은 문서 전체가 발췌에 포함될 가능성을 동의 전에 보여 준다. 기술 한도/해시/발췌 상세는 펼쳐 본다. 체크는 `controller.consent`, 별도 전송은 `controller.send(organizeAction)`을 호출한다. 기존 원본 재검사·인증·서버 예약·응답 검증을 거친다. 답변/조건 변경 시 제안/동의 폐기와 새 명시 전송도 유지한다. 채팅 문장을 답변 DTO로 해석하는 기능은 이번에 추가하지 않았다.

## 복사·이동 모습을 보면

호출자가 실제 계획/검사 결과 또는 검증된 AI 문서와 목적지에서 `{ from, to, kind }` 배열을 만든다. 공통 `FileChangeComparison`이 `buildComparisonTrees(changes, operation)`을 호출한다. 경로 조각을 부모부터 삽입해 같은 폴더를 묶고, 복사일 때 예상 구조에도 출발 항목을 남긴다. 반환값은 파일 handle이 없는 표시 tree다. 모바일 전환 상태는 표시 컴포넌트 안에만 있다.

일반 계획·managed 검토·AI·시안이 이 표시를 공유한다. 경로 유효성/충돌/원본 변경 판정과 실행 허용은 기존 계획·검사가 결정한다. 파일별 충돌 상세도 유지한다.

사용자가 작업 계획과 묶음을 고르면 기존 execution controller가 `ManagedRequest`를 만들어 `ManagedFilesDialog`로 넘긴다. 기존 session이 버전/목적지/보존을 검사하고 별도 실행 후 결과를 반환한다. 공통 표시가 쓰기 권한이나 실행 상태를 소유하지 않도록 경계를 유지했다.
