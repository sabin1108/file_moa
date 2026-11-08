# 채팅으로 질문에 답할 때의 실제 함수 흐름

2026-11-08. [검증과 한계](../verification/organization-reply/README.md).

## 질문이 나오면 입력의 연결이 바뀐다

`LiveConversation`이 기존 controller를 `useSyncExternalStore`로 구독한다. snapshot과 questions가 있으면 `answering`이 참이다. 공통 composer에 `state.replyDraft`, `organization.updateReply`, ‘답변 반영’을 전달한다. 질문 전에는 기존 `state.request`, `organization.update({ request })`, `prepare()`를 사용한다. 따라서 답변 한 글자를 입력할 때 최초 요청을 바꿔 자료를 폐기하던 흐름으로 들어가지 않는다.

`onDraftChange={organization.updateReply}`는 함수 참조를 전달한다. 실제 입력 이벤트가 날 때 공통 textarea가 이를 호출한다. `updateReply`는 pending을 확인한 뒤 초안만 publish한다. 자료/답변/동의는 그대로다. Provider 수명 안에 있으므로 같은 owner의 화면 전환에도 보존되며 reset은 초기값으로 돌린다.

## 답변 반영을 누르면

공통 `send()`가 IME 조합 중인지, pending/빈 입력인지 먼저 확인한다. 정상 제출이면 LiveConversation의 `onSend`가 `organization.submitReply()`를 호출한다. 이 함수는 ready/review와 현재 snapshot/questions를 확인하고 선택 문서의 이름·상대 경로·발췌를 순수 해석 함수에 전달한다. 최초 정리 요청이나 파일 본문을 새로 읽지 않는다.

`parseOrganizationReply`는 절마다 현재 질문의 문서 접두어와 날짜 후보를 비교한다. 예시의 ‘검토 기준일’이 날짜 질문 하나에만 맞으면 그 후보의 실제 날짜/라벨을 사용한다. ‘혼합자료는 학습 폴더로’는 명시 문서의 destination 질문에만 연결한다. 중복/모순/해석 불가는 예외로 반환되어 controller가 안내를 표시하며 답변 일부를 적용하지 않는다. 마지막에 기존 `validateReviewAnswers`가 실제 발췌 근거와 상대 경로 schema를 다시 검사한다.

반환된 답변은 controller의 `applyAnswers`로 간다. 이 경로는 기존 선택 입력의 `answer()`도 함께 사용한다. 이전 답변을 문서 ID별로 합치고 전체를 검증한 후 `stop()`으로 이전 비동기 결과의 세대를 무효화한다. 한 상태 갱신으로 answers를 보관하고 result/consentKey를 지운다. 성공한 채팅 문장은 submittedReply에 보관하고 초안은 비운다. 날짜를 쓰지 않기로 수정하면 이전 dateLabel도 제거한다.

## 화면과 다음 행동

구독이 새 상태를 받으면 날짜 select와 목적지 입력에 확정 답변이 보인다. 목적지 입력은 확정된 경로가 바뀔 때만 새 초기값을 받으므로 다른 질문의 rerender로 작성 중 값을 지우지 않는다. 대화에는 제출한 답변과 별도 전송 안내가 보인다.

이 단계에서 AI 호출은 없다. 기존 체크는 `controller.consent`, 별도 전송 버튼은 `controller.send(organizeAction)`을 실행한다. 전송 직전 원본 재검사와 서버의 인증/한도/응답 검증, 이후 기존 파일 계획/실행은 그대로다. 전송 대기 중에는 답변 제출을 받지 않고 취소 뒤 늦은 결과도 이전 세대라 버린다.

초기 요청을 바꾸려면 조건 영역의 ‘최초 정리 요청 수정’을 누른다. 기존 `update`가 자료/질문/답변을 비우고 최초 요청을 공통 입력에 다시 보여 준다. 답변과 새 요청을 추측으로 구분하는 규칙은 추가하지 않았다.
