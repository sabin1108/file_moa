# 기록 개수와 대화 turn 한도 수정

2026-11-13. `.omx/verification/egm-wide-review-20261113/repair-dispatch.md`의 F1/F2를 수정했다. 기존 미커밋 구조 개편, 개별 손상 기록 격리, 삭제 재개, 경고 유지 수정을 보존했다. 비용 한도와 철회된 검토 후보는 바꾸지 않았다.

## F1: 저장·목록의 개수 한도 일치

이전에는 신규501번째 저장이 성공하지만 재조회는 전체 실패했다. [공통 한도](../../../apps/web/src/shared/ai-records.ts)의 `records=500`을 신규 기록 디렉터리 생성에 적용했다.

[repository.directoryForSave](../../../apps/web/src/features/ai-records/storage/ai-record-repository.ts)는 기존 디렉터리이면 그대로 갱신한다. 신규일 때만 workspace 생성 잠금 안에서 존재·소유자·삭제 표식·원본 참조와 전체 디렉터리 수를 다시 검사한다. 500개면 생성 전에 `record-count-limit`로 실패한다. 499개이면 잠금 안에서 디렉터리를 만들어 한 자리를 예약한다. 이후에는 기존 source→record 저장 잠금을 유지한다.

정상·읽기 불가·삭제 대기 폴더는 실제 제거 전까지 자리를 차지한다. 폴더 없는 삭제 표식과 유효한 기록 ID가 아닌 항목은 세지 않는다. 기존 수정·삭제·삭제 재개는 이 생성 상한으로 막지 않는다.

이미 초과한 저장소는 `list()`가 최대501개 후보를 분류하고 `overLimit`을 반환한다. [controller](../../../apps/web/src/features/ai-records/ai-records-controller.ts)는 정상 목록과 경고를 유지한다. 502개 이상이면 일부가 창 밖에 있으며 사용자가 명시적으로 정리하고 다시 읽으면 다음 항목이 들어온다. 쓰기 상한을 올리거나 기존 파일을 자동 삭제하지 않는다. 다른 저장 위치 선택도 가능한 대안이다.

## F2: turn 생성과 저장 한도 일치, 명시적 전환

단일 대화의 질문·답변 또는 자료 작업 묶음은500turn까지다. 실패·중지 turn도 포함한다. 저장 schema, [reducer](../../../apps/web/src/features/conversation-workspace/messaging/general-chat-state.ts), [일반 전송/작업 추가](../../../apps/web/src/features/conversation-workspace/messaging/useGeneralChat.ts), [자료 요청](../../../apps/web/src/features/conversation-workspace/material-work/useWorkspaceConversation.ts), [화면](../../../apps/web/src/features/conversation-workspace/LiveConversation.tsx)이 `conversationTurns=500`을 함께 사용한다. 상한 뒤에는 모델 호출과 새 작업을 시작하지 않고 입력 초안을 유지한다. 한 기록의2MiB·누적50MiB·revision1000 한도는 별도다.

[useConversationRecords](../../../apps/web/src/features/conversation-workspace/records/useConversationRecords.ts)의 `persist()`는 store의 최신 snapshot으로 저장한다. 전환 전에 현재 snapshot·선택 ID·임시 여부·project·연결 revision을 잡고, 저장 뒤 다시 검사한다. 저장 대기 중 새로 편집한 내용을 옛 전환이 지우지 못한다.

저장 실패나 미저장 임시 대화에서는 전환을 멈추고 기존 `StatusNotice`·버튼 스타일로 ‘계속 편집’/‘미저장 내용 버리고 전환’을 제공한다. 취소는 현재 대화를 보존한다. 버리기는 현재 snapshot·선택·연결·진행 요청을 다시 확인한 뒤에만 실행한다. 기존 저장 파일을 지우지 않으며, legacy501turn 내용도 자동으로 자르지 않는다. 일반/임시 새 대화 모두 이 확인을 거친다.

독립 정적 리뷰에서 같은 ID의 대화를 다시 선택할 때 최신 내용을 저장한 직후 예전 목록 payload를 복원하는 경우도 발견했다. 별도 회귀로 재현하고, 정상 저장 후 같은 ID이면 restore 없이 현재 화면을 유지하도록 고쳤다. 저장 실패 뒤 명시적으로 버리기를 선택한 경우에는 해당 저장본으로 복원할 수 있다.

## 실행한 검증

| 명령·검사 | 결과 |
|---|---|
| 수정 전 F1 집중 회귀 | 6실패·33통과로 신규/동시 생성·초과 읽기·안내 문제 확인 |
| 수정 전 F2 집중 회귀 | 7실패·14통과로 초과 추가·미저장 전환·저장 중 편집 보존 문제 확인 |
| same-ID 추가 회귀 | 수정 전 실패, 수정 후 성공 no-restore/명시적 discard restore 모두 통과 |
| `pnpm check` | 154파일·1,380테스트, Prisma 검증, 타입·린트, 서버 경계26, 구조32+6+3, Next 빌드 통과 |
| `pnpm exec node tests/browser/check-ai-records.mjs .omx/verification/egm-wide-review-20261113/repair-browser` | 격리 OPFS·실제 제품 컴포넌트·합성 SSE로46검사 통과 |
| `pnpm test:s0-graph` | 168모듈 및 브라우저 export 검사 통과 |
| 코드 설명서 검사 | 30장·31표식·로컬 링크475·원문 발췌20 통과 |
| 독립 native architect 정적 리뷰 | F1 범위 CLEAR. F2 same-ID finding 수정 뒤 CLEAR |

회귀23개를 추가해 기존1,357개에서1,380개가 됐다. 501/503개 legacy fixture가 있는 해당 데이터 경계 검사만15초 시간 여유를 뒀다. 최초 전체 검사에서 이 중503개 사례가 병렬 실행 중 기본5초를 넘었다. 검증 기대값을 낮추거나 전역 제한을 바꾸지 않았다. 최종 전체 실행은 통과했다.

브라우저 최초 시도는 비동기 저장 완료를 기다리지 않은 검사와 자동 갱신된 제목 대신 초기 제목을 기대한 검사에서 실패했다. 완료 상태를 기다리고 실제 제목 흐름으로 맞춘 뒤46개가 통과했다. 실패를 제품 성공 근거로 세지 않았다. `repair-browser/records-checks.json`과 `unsaved-conversation-confirmation.png`는 지시문 폴더 아래에 있으며390px 확인 화면을 직접 확인했다.

## 리뷰 순서

1. 공통 한도 → repository의 `list`/`directoryForSave` → controller 경고.
2. reducer/일반 전송/자료 submit의 한도 차단 → `useConversationRecords`의 `persist`/`open`/`discardAndOpen`.
3. `ConversationRecordControls`·기록함의 확인 UI → 관련 repository/controller·대화 저장·일반 상태·자료 작업 테스트.
4. `tests/browser/check-ai-records.mjs`의500/501·실제 생성 잠금·명시적 정리/전환 사례.

## 한계와 보존

동시 생성은 단위 keyed queue와 같은 브라우저의 실제 Native Web Locks/OPFS 동시 Promise로 확인했다. 서로 다른 물리 브라우저 프로필·외부 OS 프로그램의 동시 쓰기를 검증하지 않았다. 502개 이상 전체를 한 번에 표시하는 페이지 기능은 추가하지 않았고 최대501개 복구 창을 명시했다. 손상된 파일과 삭제 표식은 추정해 자동 삭제하지 않는다.

실제 개인 폴더·운영 DB·유료 AI·실제 OAuth·물리 IME·외부 OS 장애를 재실행하지 않았다. 커밋·푸시·배포·새 의존성·CI 변경도 없다. 원래 `storage-limits.probe.cjs`와 검토 문서/해시는 수정 전 버그 재현 원자료로 보존했다. 이 구현 절차를 EGM 전체 재검토 완료라고 부르지 않는다.
