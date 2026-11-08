# 사용자 행동에서 정리 실행까지

2026-11-08. 실제 구현 설명이며 검증 범위는 [보고](../verification/live-organization-completion/README.md)와 구별한다.

1. 채팅에서 요청을 제출하면 `OrganizationPreparationController.prepare()`가 호출된다. 명확한 조건이 빠졌으면 session의 `inferOrganization()`이 알려진 폴더 메타데이터와 문장을 대조한다. `organization-intent.ts`는 이미 명시 선택/해제된 조건을 덮어쓰지 않고 애매하면 미정으로 반환한다. controller는 이 반환값을 요청 조건에 반영한 뒤 기존 `inspectSourceSnapshot()`으로 TXT/MD를 준비한다.
2. 참고 폴더를 정했다면 `readOrganizationFolders()`가 디렉터리 상대 경로만 제한된 깊이/시간/개수로 읽어 `snapshot.reference`를 반환한다. 참고 파일 본문은 읽지 않는다. `OrganizationSnapshotView`는 이 구조/부분 여부와 실제 발췌를 보여 준다. 새 전송은 파일 버전뿐 아니라 이 구조도 재검사한다.
3. 명시 전송은 기존 `send()` → 재검사 → `liveOrganizationAction` → 서버 인증/Origin/입력/원자 예약 → 공통 generation 순서다. 서버는 `parseLiveOrganizationResponse()`로 제안과 질문을 함께 검증한다. 문서 ID/인용/안전한 목적지 검증은 기존 파서를 재사용하고, 날짜 후보는 실제 발췌의 날짜와 앞선 라벨에서 만든다. 보류된 문서에 질문이 없으면 성공 제안으로 돌려주지 않는다.
4. 응답이 돌아오면 `OrganizationQuestionsView`는 문서별 날짜/목적지 질문을 묶는다. 날짜를 선택하거나 목적지를 제출하면 `controller.answer()`가 답을 저장하고 이전 result/consent를 지운다. 함수가 서버를 호출하지 않는다. 모든 필요한 답을 채운 뒤 사용자가 발췌를 확인하고 새 동의/전송을 눌러야 답이 포함된 새 요청이 나간다. 확인했던 질문 이력을 보존하므로 답도 다시 수정할 수 있다. `clearAnswer()`도 옛 제안/승인을 무효화한다.
5. 해소된 제안에서 사용자가 복사/이동과 기준 목적지를 고르고 `OrganizationExecutionController.review()`를 누르면 `buildOrganizationBatches()`가 문서 ID를 로컬 snapshot의 경로로 바꾼다. 같은 출발 부모/도착 폴더의 `ManagedRequest`로 묶고 중복 목적지/범위 밖/보류/같은 경로를 거부한다. 이 순수 함수는 파일을 읽거나 쓰지 않는다.
6. 묶음을 열면 공통 `ManagedFilesDialog`가 기존 계획 만들기를 제공한다. 이때 session의 `prepareOrganizationManaged()`가 제안 파일을 다시 읽고 기존 `prepareManagedOperation()` 결과를 `assertOrganizationBaseline()`과 대조한다. 파일 종류/전체hash/크기/mtime이 다르면 준비를 폐기한다. 실행 controller는 이를 stale로 기억해 다른 옛 묶음도 막는다. 단순히 다른 복사/이동을 고르거나 목적지를 바꿔 이 차단을 해제할 수 없다.
7. 검사 성공 뒤 사용자의 실행 클릭은 기존 `executeManaged()`로 이어진다. 기존 권한/충돌 재검사·vault 보존·journal·쓰기/검증·부분 실패를 사용한다. controller는 묶음 결과를 보관하고 완료 항목 재실행을 막는다. 이동 보존본도 기존 보존 기록 UI와 복구 검증을 사용한다. 복구 시 이미 이동한 옛 원본 hash를 재요구하지 않고 보존본의 기존 검증을 따른다.

선택 UI의 별도 수정은 `SourceListingController.publish()`가 명시적인 선택 모드 상태를 보존하도록 한 것이다. `clearSelection()`은 도구를 유지하고 개별 toggle의 마지막 해제는 false를 전달한다. `exitSelection()`은 사용자가 도구 자체를 닫는 경로다. `FileSelectionToolbar`와 `SourceFolderBrowser`가 이 의도를 그대로 연결한다.

빈 폴더 높이 오류는 상태 controller와 관계없다. `FolderWorkspaceFrame`의 바깥 grid는 화면 높이를 확보했지만 `.workarea`의 자식 `.columns`가 내용 높이에 머물렀다. `.workarea { display:grid }`로 기본 stretch를 적용해 목록/미리보기 열을 남은 행 높이까지 늘렸다. 모바일의 block 전환 대상에서도 `.workarea`를 제외해 같은 높이 연결을 보존한다. 본문이 길면 기존처럼 문서가 자연스럽게 늘고, 짧으면 열의 배경/구분선이 하단 상태줄까지 이어진다.
