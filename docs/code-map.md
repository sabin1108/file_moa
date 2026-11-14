# 코드 읽기 안내 — 화면 진입부터 로컬 파일 읽기까지

초보자용 통합 해설은 [모아 전체 코드 흐름 설명서](모아_전체_코드_흐름_설명서.md)를 먼저 읽는다. 아래는 필요한 소스로 빠르게 이동하기 위한 지도와 날짜별 구현 맥락이다.

## 2026-11-13 기능별로 따라 읽는 현재 구조

큰 조립점에서 실제 행동의 담당 기능으로 내려간다. 전체 폴더 지도는 [제품 소스 안내](../apps/web/src/README.md), 아래 날짜별 설명은 각 구현 당시의 맥락이다. 과거 검증 결과는 이번 이동 후 결과와 구분한다.

| 행동 | 진입 → 조립 → 실행 책임 |
| --- | --- |
| 작업 화면 진입 | `app/(workspace)/layout.tsx` → `features/local-folders/SourceFolderProvider.tsx` → `use-source-folder-connection.ts`. 기존 owner key와 정리 순서를 유지한다. |
| 폴더 탐색·파일 선택 | `app/(workspace)/files/page.tsx` → `features/local-folders/SourceFolderBrowser.tsx` → `browsing`의 화면·controller → `connection-session.ts` → 해당 reader. 반환 상태가 화면을 갱신한다. |
| 문서 보기·편집 | `local-folders/documents`에서 공통 작업면과 preview/inline-editor를 찾는다. 읽기·해시·PDF·OCR은 `content`가 맡는다. |
| 복사·이동·복구 | `operations` 또는 `recovery`의 화면 → controller → session → 검사/실행 서비스. `destination-picker`와 `creation`의 기존 조작을 함께 사용한다. |
| 대화·자료 요청 | `app/(workspace)/page.tsx` → `conversation-workspace/LiveConversation.tsx` → `messaging`, `grounded`, `material-work`. 자료 준비·동의·정리 규칙은 `local-folders/organization`에 있다. |
| 대화 보관·기록 편집 | 대화의 `records/useConversationRecords.ts`가 값을 제공 → `ai-records/library`가 좁은 `ConversationRecordControls`를 받음 → `editing/storage/wiki/context`로 내려간다. 기록 UI는 대화 hook 구현을 import하지 않는다. |
| 로그인·설정·사용량 | auth의 `form/signup/session/social/account`에서 화면과 상태를 찾는다. Action → `server/auth` 또는 `server/settings`가 처리하며 사용량 표시는 `conversation-workspace/settings`에 둔다. |
| 데모·소개 | app의 `/demo`·`/start` 진입 → `sample-workspace`·`onboarding`. 합성 자료와 실제 사용자 자료를 분리한다. |

`server/auth`, `chat`, `demo`, `ai`, `organization`, `settings`는 서버 전용 책임별 위치다. `components`는 공통 표시, `shared`는 최소 계약과 공통 규칙이며 app에는 일반 기능 코드를 넣지 않는다. 테스트도 같은 기능별 하위 책임으로 찾고 실제 기능 간 연결 검증만 `apps/web/tests/integration`에서 확인한다.

2026-11-12: 이전 `prototypes`와 `/preview` 실행 경로를 제거했다. 아래 시안 절은 당시 설계 기록이며 현재 기능 진입점은 실제 작업 경로와 `/demo`다. 실제 파일 미리보기와 보호·복구 검증은 유지한다.

## 로컬 자료 찾기 — 2026-11-08

LiveConversation.isFindRequest → DocumentFindController.start/조건 확인 → search/confirmFindQuery → session.findSourceDocuments/기존 snapshot → 공통 hash Worker의 전체 본문 근거 → 결과/기존 preview.open이다. 날짜 순수 함수를 정리와 공유하며 AI 전송용 DTO/파일 writer를 추가하지 않았다. [호출·반환·상태 읽기](reports/document-find-reading.md), [명세·검증·한계](verification/document-find/README.md).

## 채팅 답변 연결 — 2026-11-08

질문 생성 → 공통 composer의 replyDraft → preparation.updateReply/submitReply → 순수 parseOrganizationReply → 기존 검증과 applyAnswers → 질문 입력/대화 → 새 명시 전송이다. [실제 식·호출·반환](reports/organization-reply-reading.md), [지원 표현·검증·한계](verification/organization-reply/README.md). 최초 요청/상태/외부 접근/표시의 책임을 유지한다.

## 대화 안 정리 실제 적용 — 2026-11-08

`LiveConversation` → `ConversationWorkspace.interaction` → 기존 controller 상태를 받는 조건/질문/전송/제안/실행 표시다. `FileChangeComparison`과 순수 `buildComparisonTrees`는 일반 계획·managed 검토·AI·시안이 함께 쓴다. [실제 호출·반환 순서](reports/chat-first-live-reading.md), [검증·하이드레이션·한계](verification/chat-first-live/README.md). 아래 시안 절은 실제 연결 전의 기록이다.

## 대화 중심 정리 개편 시안 — 2026-11-08 사용자 실제 사용 피드백

`/preview/screens/chat-first` → `prototypes/organization/ChatFirstPrototype`에서 합성 자료 확인/질문/현재·도착 폴더/검토를 대화 안에 배치한다. 실제 AI/파일 기능은 미연결이다. 최신 [디자인 기준](../DESIGN.md), [명세](specs/chat-first-organization.md), [시안과 화면 검토](verification/chat-first-design/README.md). 기존 실제 controller/서버/원본 보호는 교체하지 않았다.

## 정리 질문에서 실제 검토·실행까지 — 2026-11-08

요청 → preparation/infer/read/reference → 명시 전송/검증 질문 → answer/동의 폐기 → 새 명시 전송 → execution.review/operation projection → 기존 managed dialog/버전 검사 → 기존 실행/보존/복구 순서다. [행동별 함수 흐름](reports/live-organization-completion-reading.md), [1~10 상태](verification/live-organization-completion/README.md). 빈 폴더 높이는 공통 frame의 workarea grid에서 수정했다.

## 정식 AI 전송 경계 — 2026-11-08

홈 페이지가 실제 `liveOrganizationAction` 참조를 채팅/자료 창에 전달한다. 명시 클릭 → controller.send → session.recheckSourceSnapshot → 선택 파일 Worker 재검사 → app/actions/live-ai → server/organization/live-organization의 인증/Origin/입력/원자 예약 → sample과 공통 organization-generation/Gemini → 응답 검증 → 메모리 제안 표시다. [실제 식·호출·반환 순서](reports/live-ai-transfer-reading.md), [실행 근거·한계](verification/live-ai-transfer/README.md). 개인 실전송/파일 적용 완료 증거는 아니다.

## 정식 채팅의 로컬 자료 준비 — 2026-11-07

`LiveConversation`의 요청 입력/제출 → Provider가 소유한 `OrganizationPreparationController` → `FolderConnectionSession.inspectSourceSnapshot` → `source-snapshot`의 재귀 읽기 → 기존 `copy-hash` Worker의 텍스트/해시 처리 → controller의 후보·동의 상태 → `OrganizationPreparationPanel`/`OrganizationSnapshotView` 표시다. 범위·참고·목적지는 독립이며 같은 `DestinationFolderPicker`를 읽기 전용으로 재사용한다. 샘플의 후보 제한 함수를 shared로 승격했으며 이전 import 재export를 유지했다. [줄을 따라 읽기](reports/live-local-preparation-reading.md), [명세](specs/live-txt-md-consent.md), [검증](verification/live-local-preparation/README.md).

## 사용자 행동과 실행 순서로 읽기 — 2026-11-07

[코드_이해하기](코드_이해하기.md)는 로그인·폴더·계획·실행·복구·샘플 AI·설정을 22절로 따라 읽는 안내다. 실행되는 식/조건에서 호출 함수로 들어갔다가 반환값과 함께 화면으로 돌아온다. 함수/파일 목록보다 실제 동작 순서를 먼저 읽고 싶으면 이 문서에서 시작한다. 아래 날짜별 절은 당시 구현 단위의 기록이다.

## 이메일 인증 화면 읽기 — 2026-11-06

1. `app/login`, `app/welcome`, `app/verify-email`, `app/forgot-password`, `app/reset-password`, `app/account`: 화면 조합·서버 query/세션 진입.
2. `components/layout/AuthShell.tsx`와 CSS: 실제 인증 화면의 공통 표시. 가입·재설정은 `components/ui/PaperStepper.tsx` → `use-paper-stepper-motion.ts`로 표시하며 인증 상태·입력을 소유하지 않는다. 파일·복구 작업은 `WorkflowStepper.tsx`를 유지한다. 모든 로딩은 기존 API에서 교체된 `MoaLoader`를 공유한다.
3. `features/auth/form/AuthScreen.tsx` → `features/auth/form/form-config.ts`·`features/auth/form/useAuthDraft.ts`: 공통 폼/오류/대기, 단계 데이터·허용 표시 상태, 이름·이메일 초안. 비밀번호/token은 저장하지 않는다.
4. `app/actions/auth.ts` → `server/auth/auth-forms.ts` → `server/auth/auth-handler.ts` → `server/auth/auth.ts`: 제출→서버 검증→동일 프로세스 인증→쿠키 반영→결과/redirect. 직접 auth.api 호출로 HTTP 보호를 우회하지 않는다.
5. `shared/auth-contract.ts`: 양쪽에서 쓰는 최소 상태 타입. `tests/server/auth/auth-actions.test.ts`·`auth-forms.test.ts`, `tests/auth/form/flow.test.ts`, 루트 `tests/browser/check-auth-ui.mjs`: 실패·쿠키·단계·실브라우저 검증.

상세 읽기 링크와 재현은 [인증 UI 검증](verification/auth-ui/README.md)을 따른다.

처음 읽는 사용자에게는 [화면에서 시작하는 자세한 코드 설명서](코드_이해하기.md)를 권한다. 실제 버튼에서 controller/session/파일 처리까지 따라가고, 인라인 편집·한 번 보존·수동/주기 저장·URL과 F5 복원·수정 위치를 설명한다. 아래 날짜별 절은 당시 기능 단위의 기록이다.

## 2026-11-04 파일 관리1~6

`SourceFolderBrowser` 조립 → `useManagedFiles`/`ManagedFilesController` → `ManagedFilesDialog`/`ManagedOperationView`/`ManagedArchivesView` → session의 prepare/execute/editor/archive 메서드 → `managed-inspection`/`managed-tree`(읽기 proof) → `managed-execution`(보존·검증·복사·비재귀 제거·편집) → `managed-archive`/`operations/managed/managed-files`(양쪽 기록·strict schema) 순서다. 기존 해시 Worker/BackupDirectory/공통 dialog·picker를 재사용한다.

복원 현재 대조는 `RestoreHistoryView` → 기존 history controller의 별도 restoreInspection → session → `restore-history-inspection` 순서다. [명세](specs/managed-files.md), [검증](verification/file-management-six/README.md).

## 2026-11-04 복원 작업 기록 조회

`FolderHistoryView`의 복원 분류 → `RestoreHistoryView` → 기존 `FolderHistoryController`/session의 `readSourceHistory` → `recovery/restore/recovery-restore-history` → `recovery/restore/recovery-restore-history-rules` 순서다. JSON 파싱은 기존 `parseRestoreRecord`, 일반 자료 경로 차단은 `openSourceDirectory`를 재사용한다. 목적지의 과거 기록만 읽고 현재 파일/보관함 대조는 추가하지 않았다. [명세](specs/recovery-restore-history.md), [정적 검사·미실행 범위](verification/recovery-restore-history/README.md).

## 2026-11-04 새 파일 복원·직접 하위 보관함/현재 연결

`RecoveryRestoreView` → `RecoveryRestoreController` → session의 `prepareRecoveryRestore/executeRecoveryRestore` → `recovery-restore-input` → `recovery-restore` → `recovery/recovery-operation-journal` / `recovery/restore/recovery-restore-rules` 순서다. UI에는 metadata만 반환하고 승인/핸들은 session이 한 번 소비한다. 기존 overwrite journal을 공통 불변 양쪽 기록 책임으로 추출해 parser만 다르게 주입한다. `source-directory`는 일반 자료의 보관함 접근 차단, `recovery-vault-location`은 직접 하위 허용, `checkRecoveryPresence`/connection controller/hook은 읽기 전용 현재 연결 갱신을 맡는다. [명세](specs/recovery-restore.md), [검증·한계](verification/recovery-restore/README.md).

## 2026-11-04 보관함 목록·상세와 권한 안내

`FolderPermissionGuide`는 기존 토큰으로 실제 권한 요청 전 짧은 안내만 표시한다. `RecoveryArchiveDialog` → `RecoveryArchiveView` → `RecoveryArchiveController` → session의 `readRecoveryArchiveList/inspectRecoveryArchiveDetail` → `recovery-archive.ts` → `recovery-archive-records.ts` 순서로 읽는다. recovery/archive/recovery-archive-rules는 DTO/한도, 기존 recovery-backup 스키마는 외부 JSON 검증, Worker는 명시적 상세의 hash를 맡는다. 목록은 payload를 읽지 않고 service snapshot/핸들은 UI로 반환하지 않는다. [명세](specs/recovery-archive.md), [검증](verification/recovery-archive/README.md).

## 2026-11-04 검증된 복구 사본 후 실제 덮어쓰기

`RecoveryOverwriteView`(최종 경고/중단 초점/파일별 결과) → `RecoveryBackupController.confirmOverwrite/startOverwrite`(별도 확인·실행·중단 수명) → `FolderConnectionSession.executeSourceOverwrite`(내부 백업 receipt·파일 핸들·한 번 소비·owner/source/vault 세대) → `recovery-overwrite-input.ts`(현재 입력/보관본/양쪽 백업 기록) → `recovery-overwrite.ts`(기존 파일 순차 교체/재검증) → `recovery-overwrite-journal.ts`/`recovery/backup/recovery-overwrite-rules.ts`(불변 양쪽 versioned 기록/strict JSON). 같은 local-folders 기능 폴더의 책임을 재사용한다. [명세](specs/recovery-overwrite.md), [검증과 한계](verification/recovery-overwrite/README.md).

## 2026-11-04 자료 연결에서 보관함 설정으로 이어가기

`SourceFolderSettings`는 자료 연결 성공 후 같은 화면의 보관함 제목으로 초점을 옮기고 완료 버튼에서만 화면을 마친다. `RecoveryVaultSettings`는 공통 `StatusNotice`의 경고·alert와 직접 수정 버튼을 표시한다. `RecoveryConnectionController`가 짧은 제목/수정 안내/행동 종류를 소유한다. [명세](specs/folder-connection-flow.md), [검증](verification/folder-connection-flow/README.md).

## 2026-11-04 보관함 생성 오류 후속

`RecoveryVaultSettings`의 생성 영역 → `RecoveryConnectionController.run(choose/create)` → session의 `prepareRecoveryCreation`(읽기 위치 선택만) / `createPreparedRecovery`(제스처 쓰기 권한·생성·검증·저장) 순서다. `recovery/recovery-connection-error.ts`는 단계/제한된 코드만 UI로 전달한다. 실제 사용자 최초 예외는 수집되지 않아 네이티브 원인은 미확정이다. [짧은 오류 기록](/E:/memory/chatbotfolder/Requirements/오류_정리.md), [명세](specs/recovery-creation-fix.md), [검증](verification/recovery-creation-fix/README.md).

## 2026-11-04 기존 목적지의 검증된 복구 백업

후속 UI: `SourcePlanDialog` → `RecoveryBackupView`는 비교/결과 표시를 맡는다. `SourcePlanController.inspectBackup`이 `conflictingBackupPlan`으로 정확한 충돌만 좁히고 `RecoveryBackupController`가 검사/명시 실행/취소 수명을 관리한다. source listing 해제는 오래된 결과를 지우며 실행 중 동일 연결의 갱신은 중단 정산을 유지한다. UI도 구현했으므로 아래 최초 API 단계의 ‘현재 버튼 없음’ 설명은 후속으로 대체한다.

이번 단위는 화면 추가 없이 session 실행 API를 구현했다. 읽기 순서: `recovery/backup/recovery-backup-rules.ts`(계획/manifest/상태 타입·Zod) → `recovery/backup/recovery-backup-input.ts`(목록·metadata·source/target hash 검사·bytes 고정) → `recovery/backup/recovery-backup-storage.ts`(새 작업 폴더·불변 파일·JSON 재읽기) → `recovery/backup/recovery-backup.ts`(순차 백업·양쪽 기록·중단/최종 감사) → `connection-session.ts`의 `inspectSourceBackup`/`executeSourceBackup`(내부 검사 snapshot·사용자 제스처·연결 세대). 경로는 local-folders 기준이다. hook의 `inspectBackup`/`executeBackup`이 후속 충돌 UI 연결점이며 현재 버튼은 없다. 기존 copy의 충돌 차단은 유지한다. [명세](specs/recovery-backup.md), [검증](verification/recovery-backup/README.md).

## 2026-11-04 복구 보관함 설정

읽는 순서: `recovery/RecoveryVaultSettings.tsx`(표시/행동) → `recovery/recovery-connection-controller.ts`(진행/취소/오류) → `connection-session.ts`의 recovery 메서드(owner·자료 연결 수명·저장) → `recovery/recovery-vault-location.ts`(핸들 관계) → `recovery/create-recovery-vault.ts`(신규 식별 기록 생성·재읽기) → 기존 `recovery/recovery-vault.ts`/`recovery/recovery-vault-rules.ts`(읽기/스키마). 경로는 모두 `apps/web/src/features/local-folders/` 기준이다. 기존 IndexedDB object store에 독립 `recovery` 키를 사용하고 시작 시 권한 요청 없이 참조만 복원한다. [명세와 실패 계약](specs/recovery-vault-connection.md).

## 2026-11-02 경로 중복·선택·탐색 후속

`DestinationFolderPicker`의 형제 key를 path/creation으로 구분해 경로 입력 누적을 고쳤다. `FolderPathTree`는 경로 조각을 깊이별로 표시한다. `useDialogStepTransition`은 표시 높이만 부드럽게 잇고 실제 작업 상태는 바꾸지 않는다. `useLongPressSelection` → `SourceFileRow`/`SourceFolderRow` → listing 선택 상태 순으로 길게 누르기를 처리한다. 계획 controller는 폴더 포함을 차단한다. navigation은 선택 당시 kind를 메모리에 보관해 뒤로 가기 때 다른 종류를 재선택하지 않는다. [검증](verification/folder-navigation-ux/README.md).

## 2026-11-02 직접 작업·목적지 통합·단계별 복사

`FileSelectionToolbar` → `SourcePlanController.open(copy/move)` → `SourcePlanDialog`에서 시작한다. `PlanDestinationInput`의 경로 버튼은 `DestinationFolderPicker`를 열고 그 안의 `DestinationPathForm`이 후보를 탐색한다. 폴더 확정 뒤 계획→검사→실행으로 표시를 전환한다. `completeCopy`는 성공한 목적지를 한 번 반환하고 `SourceFolderBrowser`가 창 닫기 뒤 목록 이동/초점을 처리한다. `usePlanDialogScroll`은 휠 경계, `FolderWorkspaceFrame`은 열린 폴더 재클릭을 담당한다. [명세](specs/file-actions-ux.md), [검증과 변경 순서](verification/file-actions-ux/README.md). 복구 보관함과 덮어쓰기는 [별도 미구현 계획](specs/recovery-vault.md)이다.

## 2026-11-02 실제 복사·작업 기록·현재 내용 대조

`SourcePlanDialog` → `CopyExecutionView` → `SourcePlanController.executeCopy` → `CopyExecutionController` → `connection-session.executeSourceCopy` → `operations/copying/copy-execution` 순서로 명시적 실행을 처리한다. 기록의 검증·집계는 `operations/copying/copy-journal`, 저장/조회는 `operations/copying/copy-journal-storage`, 현재 내용 대조는 `operations/copying/copy-history-inspection`이 맡는다. 표시 컴포넌트는 실행 전 계획과 실행 결과를 구별하며 실제 파일 접근을 소유하지 않는다. [기능 코드 읽기](reports/copy-execution-reading-guide.md), [최종 검증](verification/copy-execution/README.md), [인수인계](handoff/2026-11-02-copy-execution-complete.md).

아래 날짜별 과거 절의 ‘복사 미구현’은 당시 범위다. 현재 복사는 구현됐으며 이동·삭제·자동 복구·본문 편집은 후속이다.

## 2026-10-31 미확인 작업 대상 확인

`HistoryTargetView`의 확인 버튼 → 기존 `FolderHistoryController.inspectTarget` → `connection-session.inspectSourceHistoryTarget` → `services/history-target-inspection.inspectHistoryTarget` → 같은 행의 현재 관측 표시 순서다. reader는 기록 재검증과 대상 handle 비교만 수행하며 생성 journal을 쓰지 않는다. [기능 코드만 읽는 상세 범위](reports/history-target-reading-guide.md).

## 2026-10-31 현재 폴더 작업 기록

기능 코드만 읽는 상세 순서는 [작업 기록 읽기 가이드](reports/folder-history-reading-guide.md)에 있다. `SourceFolderBrowser` → `FolderHistoryDialog` → `FolderHistoryController` → `connection-session.readSourceHistory` → `history/folder-history` → `history/folder-history-rules` → `FolderHistoryView` 순서로 사용자 행동에서 결과 표시까지 따라간다. reader는 파일 접근, lib는 검증·묶음 규칙, controller는 요청 수명, dialog는 초점/열림, view는 표시만 소유한다. 생성 writer와 조회 reader를 합치지 않았다.

## 2026-10-31 연결 조작·확장자 우선 규칙

[명세 NEW-005/006](specs/folder-workspace-revision.md) → `creation/new-entry.ts`의 `resolveNewEntry`(최종 이름·종류) → `NewEntryForm`(공유 미리보기) → `EntryCreationController`(결과 문구) → `create-entry`(직접 호출 시에도 같은 검증 및 journal kind). 연결 버튼은 `SourceFolderBrowser`에서 `FolderListingView.connectionControls`로 전달하고 `FolderWorkspaceFrame`의 전역 controls 슬롯은 제거했다. `source-folder-browser.module.css`는 제목을 덮지 않게 툴바를 줄바꿈한다. [검증과 재현](verification/folder-followup-20261031/README.md).

## 최종 시안·현재 위치에서 폴더/TXT/MD 생성 — 2026-10-30

[명세](specs/folder-workspace-revision.md) → [화면 배치](../apps/web/src/features/local-folders/browsing/FolderWorkspaceFrame.tsx) → [방문한 상위 목록](../apps/web/src/features/local-folders/browsing/navigation/folder-trail-controller.ts) → [반응형 미리보기](../apps/web/src/features/local-folders/documents/preview/FilePreviewPane.tsx) → [생성 입력](../apps/web/src/features/local-folders/creation/NewEntryForm.tsx) → [이름·확장자 규칙](../apps/web/src/features/local-folders/creation/new-entry.ts) → [생성 상태](../apps/web/src/features/local-folders/creation/entry-creation-controller.ts) → [실제 생성 서비스](../apps/web/src/features/local-folders/creation/create-entry.ts) → [디스크 기록](../apps/web/src/features/local-folders/creation/folder-creation-journal.ts) → [검증](verification/current-folder-creation/README.md) 순서다. session은 자료 연결과 소유자 수명을 확인한다. 기록은 현재 탐색 위치의 .moa-history에 자동 저장한다. 기존 listing이 선택을 소유하고 취소 시 체크와 도구 상태를 함께 해제한다. 폴더·빈 TXT/MD 생성은 실제 쓰기이며 파일 이동/복사와 본문 편집은 실행하지 않는다.

## 복사 전 검사 — 2026-10-30

[명세](specs/copy-inspection.md) → [입력/DTO/한도](../apps/web/src/features/local-folders/operations/copying/copy-inspection-rules.ts) → [읽기 검사 서비스](../apps/web/src/features/local-folders/operations/copying/copy-inspection.ts) → [Worker 수명](../apps/web/src/features/local-folders/content/copy-hash.ts)와 [내용 hash](../apps/web/src/features/local-folders/content/copy-hash.worker.ts) → [검사 controller](../apps/web/src/features/local-folders/operations/copying/copy-inspection-controller.ts) → [결과 표시](../apps/web/src/features/local-folders/operations/copying/CopyInspectionView.tsx) → [검증](verification/copy-inspection/README.md) 순서다. connection session은 연결/소유자 수명, 기존 plan은 입력 변경 시 검사 폐기를 맡는다. 검사 결과는 메모리 DTO이며 쓰기 권한이나 실행 가능한 작업 journal이 아니다.

## 목적지 확정·새로고침 표시 — 2026-10-30

[UX 명세](specs/folder-controls-ux.md) → FolderListingView의 동일 경로 갱신 표시와 고정 새로고침/취소 조작 → SourceFolderBrowser의 스크롤 없는 초점 복구 → DestinationFolderPicker의 경로/이름 있는 선택 버튼 → SourcePlanDialog의 탐색 중 입력 숨김 → [실행 결과와 파일별 책임](verification/folder-controls-ux/README.md) 순서로 읽는다. controller·reader·원본 쓰기 경계는 그대로이며 표시·초점 수정이다.

## 목적지 탐색·선택 — 2026-10-29

[명세](specs/plan-destination-picker.md) → [목적지 controller](../apps/web/src/features/local-folders/destination-picker/destination-picker-controller.ts) → [계획 controller](../apps/web/src/features/local-folders/operations/planning/source-plan-controller.ts) → [표시 컴포넌트](../apps/web/src/features/local-folders/destination-picker/DestinationFolderPicker.tsx) → [dialog 조합](../apps/web/src/features/local-folders/operations/planning/SourcePlanDialog.tsx) → [검증](verification/plan-destination-picker/README.md) 순서로 읽는다. 목적지 controller는 탐색/취소 수명, 계획 controller는 입력 반영과 기존 계획 무효화, UI는 표시·초점만 맡는다. 기존 목록 reader를 재사용하고 주 목록/선택/history는 수정하지 않는다.

## 파일 탐색 기록과 점진적 도구 표시 — 2026-10-29

[명세](specs/file-browser-navigation.md) → [navigation controller](../apps/web/src/features/local-folders/browsing/navigation/source-navigation-controller.ts) → [browser adapter](../apps/web/src/features/local-folders/browsing/navigation/use-source-navigation.ts) → SourceFolderBrowser/FolderListingView 순서로 읽는다. controller는 제한된 메모리 기록과 늦은 요청 차단, hook은 history/DOM/리스너 정리만 소유한다. 연결 controller가 navigation의 수명을 소유하고 listing reset epoch로 옛 연결의 기록을 지운다. 검색/선택 도구 열림은 기존 listing store에서 관리한다. [수명 테스트](../apps/web/tests/local-folders/browsing/navigation/source-navigation-controller.test.ts), [브라우저 검증](verification/file-browser-navigation/README.md).

## 현재 폴더 이름 검색 — 2026-10-29

[명세](specs/file-name-search.md) → [순수 필터](../apps/web/src/features/local-folders/browsing/search/file-name-search.ts) → [검색·선택 수명](../apps/web/src/features/local-folders/browsing/file-list/source-listing-controller.ts) → [IME 입력](../apps/web/src/features/local-folders/browsing/search/FileNameSearch.tsx) → [목록 조합](../apps/web/src/features/local-folders/browsing/file-list/FolderListingView.tsx) → [브라우저 검증](../tests/browser/check-file-name-search.mjs) 순서로 읽는다.

필터는 이미 읽어 둔 직접 자식 배열의 일치 항목을 반환하며 빈 검색어에는 기존 배열을 그대로 반환한다. 검색어·선택은 listing store 하나가 소유하고, 검색 결과의 전체 선택/해제도 같은 store의 표시 파일에만 적용한다. 별도 검색 API, 재귀 탐색, 파일 본문 읽기, 권한 요청, 서버 상태 및 원본 쓰기는 추가하지 않는다. [단위 테스트](../apps/web/tests/local-folders/browsing/search/source-search.test.ts)와 [실행 증거](verification/file-name-search/README.md)를 함께 읽는다.

## 변경 계획 검토 — 2026-10-29

[명세](specs/file-change-plan.md) → [순수 규칙](../apps/web/src/features/local-folders/operations/planning/file-change-plan.ts) → [계획 store](../apps/web/src/features/local-folders/operations/planning/source-plan-controller.ts) → [dialog 조합](../apps/web/src/features/local-folders/operations/planning/SourcePlanDialog.tsx) → [결과 표시](../apps/web/src/features/local-folders/operations/planning/FileChangePlanView.tsx) → [검증](verification/file-change-plan/README.md) 순서로 읽는다.

FileSelectionToolbar → plan.open → 입력/plan.generate → 기존 session.listSourceFolder로 출발지/목적지 읽기 → 순수 계획 계산 → FileChangePlanView 표시다. 선택은 listing store만 소유한다. 계획 store는 listing의 변경을 구독해 연결 교체·소유자 변경·갱신·선택 변경 시 읽기를 취소하고 결과를 폐기한다. services를 추가하거나 파일 쓰기/서버 API를 연결하지 않았다. components/plan과 operations/planning/file-change-plan이 새 책임이며 기존 connection/listing/preview 경계는 유지한다.

## 현재 폴더 분류와 연결 후 이동 — 2026-10-28

[src 구조 안내](../apps/web/src/README.md)에서 app(진입점), components(공통 UI/레이아웃), features(기능과 독립 데모), src 밖 tests(검증)를 구분한다. 이전 prototypes는 제거했다. 현재 local-folders 내부는 connection/browsing/documents/content/operations/recovery 등 기능별 책임으로 나눈다. 위 2026-11-13 안내가 최신 기준이다. workspace는 업무 기능이 아닌 공통 프레임이므로 components/layout에 있다. 기능 전용 hooks/store/services를 전역에 흩뜨리지 않는다.

연결 이동 리뷰는 [명세](specs/connection-navigation.md) → [controller](../apps/web/src/features/local-folders/connection/source-connection-controller.ts) → [화면 조합](../apps/web/src/features/local-folders/connection/SourceFolderSettings.tsx) → [브라우저 검사](../tests/browser/check-connection-navigation.mjs) 순서다. controller가 이번 작업의 성공 여부를 반환하면 UI가 /files로 이동한다. 저장된 연결을 복원하는 것만으로 이동하지 않는다. [현재 구조 검증](verification/readable-structure/README.md).


2026-10-28 실제 소스 기준. 먼저 [대화형 구조도](diagrams/local-files.html)를 보고, 아래 순서로 파일을 열면 된다. 구조도는 이전 미리보기 단계의 논리 호출 방향이며 최신 디렉터리 목록이 아니다. 현재 파일 위치는 이 코드 지도와 src/README를 따른다. 현재 폴더 기능은 localhost 개발 연결이다.

## main.tsx / App.tsx는 어디에 있나

이 프로젝트는 React를 Next.js App Router 위에서 실행한다. 직접 `createRoot`를 호출하는 `main.tsx` 대신 Next가 시작·라우팅·hydration을 담당하고, 개발자는 `layout.tsx`와 `page.tsx`를 작성한다. `layout.tsx`는 공통 틀, `page.tsx`는 URL별 화면이다. 둘이 React의 시작 파일과 정확히 일대일 대응하지는 않는다.

```text
Next.js가 URL에 맞는 layout/page를 조합
apps/web/src/app/layout.tsx                  html lang=ko, body, 전역 CSS
  └─ app/(workspace)/layout.tsx              작업 영역의 공통 수명
       └─ SourceFolderProvider              연결 controller 하나를 소유
            └─ app/(workspace)/files/page.tsx  /files 화면
                 └─ WorkspaceShell          메뉴·main·페이지 제목
                      └─ SourceFolderBrowser   목록/미리보기 조합·초점
                           ├─ FolderListingView
                           └─ SourceDocumentPreview
```

`(workspace)`는 URL에 나타나지 않는 route group이다. `/`, `/files`, `/settings`는 이 공통 layout을 공유하고 `/login`, `/welcome`, `/account`는 밖에 있다. 페이지를 왕복할 때 Provider가 유지되므로 연결과 열린 문서를 다시 만들 필요가 없다. 브라우저 전체 새로고침 뒤에는 본문이 복원되지 않고, 저장된 핸들만 읽은 뒤 명시적인 재연결이 필요하다.

루트/layout/page는 서버 컴포넌트이며 빌드 때 초기 화면을 만들 수 있다. `"use client"`는 상호작용 코드의 경계다. 클라이언트 컴포넌트도 초기 HTML 생성에 참여하므로 그 표시 본문에서 `window`나 IndexedDB를 바로 읽으면 안 된다. 실제 브라우저 접근은 hook의 effect와 사용자 이벤트 이후에 시작한다. 근거: 설치된 Next 문서의 `Layouts and Pages`, `Server and Client Components` 및 [공식 파일 규약](https://nextjs.org/docs/app/getting-started/layouts-and-pages).

## 선택과 연결 관리 팝업을 리뷰할 때

[명세](specs/file-selection-and-connection-dialog.md) → [SourceListingController](../apps/web/src/features/local-folders/browsing/file-list/source-listing-controller.ts)와 [실패 테스트](../apps/web/tests/local-folders/browsing/file-list/source-selection.test.ts) → [SourceFileRow](../apps/web/src/features/local-folders/browsing/file-list/SourceFileRow.tsx) / [FileSelectionToolbar](../apps/web/src/features/local-folders/browsing/file-list/FileSelectionToolbar.tsx) → [SourceFolderSettingsDialog](../apps/web/src/features/local-folders/connection/SourceFolderSettingsDialog.tsx) → [브라우저 검사](../tests/browser/check-file-selection-dialog.mjs) 순서다.

선택은 목록 controller가 현재 폴더 경로와 함께 소유한다. 별도 전역 선택 저장소를 만들지 않았다. 팝업은 HTML dialog로 배경 조작·키보드 범위를 맡기고, React는 열려 있는 내용의 수명을 관리한다. 닫기 이벤트가 늦게 전달돼도 다시 열린 팝업을 지우지 않는다. 연결·파일 접근·선택 상태를 dialog 안에 복제하지 않는다.

## 처음 리뷰할 파일 7단계

아래 링크는 프로젝트 내 실제 파일이다. 모든 파일을 처음부터 읽기보다 바꾸려는 책임을 먼저 찾는다.

| 순서 | 파일 | 확인할 내용 |
| --- | --- | --- |
| 1 | [미리보기 명세](specs/source-file-preview.md) | 허용 동작, 실패 조건, 금지 부작용, PREVIEW ID |
| 2 | [files/page.tsx](<../apps/web/src/app/(workspace)/files/page.tsx>), [WorkspaceShell](../apps/web/src/components/layout/WorkspaceShell.tsx) | 어떤 화면이 어디에 조합되는가 |
| 3 | [SourceFolderProvider](../apps/web/src/features/local-folders/SourceFolderProvider.tsx), [use-source-folder-connection](../apps/web/src/features/local-folders/use-source-folder-connection.ts) | controller 생성·구독·복원·정리, 개발 소유자 제한 |
| 4 | [SourceFolderBrowser](../apps/web/src/features/local-folders/SourceFolderBrowser.tsx), [SourceDocumentPreview](../apps/web/src/features/local-folders/documents/preview/SourceDocumentPreview.tsx), [FolderListingView](../apps/web/src/features/local-folders/browsing/file-list/FolderListingView.tsx) | 화면 전환·초점 복귀 / 표시와 콜백 / HTML 의미 |
| 5 | [source-connection-controller](../apps/web/src/features/local-folders/connection/source-connection-controller.ts), [source-preview-controller](../apps/web/src/features/local-folders/documents/preview/source-preview-controller.ts), [source-listing-controller](../apps/web/src/features/local-folders/browsing/file-list/source-listing-controller.ts) | 연결·목록·본문의 상태 소유와 취소·오래된 결과 처리 |
| 6 | [connection-session](../apps/web/src/features/local-folders/connection-session.ts), [source-file-preview](../apps/web/src/features/local-folders/documents/preview/source-file-preview.ts), [handle-repository](../apps/web/src/features/local-folders/connection/handle-repository.ts) | 소유자/연결 세대, 실제 읽기와 권한, IndexedDB 참조 보관 |
| 7 | [reader 테스트](../apps/web/tests/local-folders/documents/preview/source-file-preview.test.ts), [controller 테스트](../apps/web/tests/local-folders/documents/preview/source-preview-controller.test.ts), [브라우저 검사](../tests/browser/check-source-file-preview.mjs) | 명세의 실패 조건이 실제로 재현되는가 |

## 파일을 클릭하면 무슨 일이 일어나나

1. `FolderListingView`는 MD/TXT에만 버튼을 만든다. 클릭하면 `SourceFolderBrowser`가 돌아올 초점·스크롤 위치를 기록하고 `preview.open(path)`를 호출한다.
2. `SourcePreviewController`는 경로를 복사하고 이전 요청을 무효화한다. 같은 파일 갱신이면 이전 본문을 보존하고, 다른 파일이면 지운 뒤 loading 상태를 게시한다.
3. 주입된 `read`가 `FolderConnectionSession.readSourceFile`을 호출한다. session은 연결/소유자와 요청 순번을 붙여 이전 연결의 결과가 새 화면을 덮지 못하게 한다.
4. `readSourceFilePreview`가 상대 경로·확장자·권한·크기를 확인하고 `create:false`로 파일을 연다. 공통 [domain 규칙](../packages/domain/src/index.ts)의 2MiB 상한 안에서 읽고 UTF-8을 엄격하게 해석한다.
5. 읽기 후에도 권한과 요청 수명을 확인한다. 유효한 결과만 controller에 돌아오며 `useSyncExternalStore` 구독으로 화면이 갱신된다.
6. `SourceDocumentPreview`는 문자열을 React 텍스트로 출력한다. Markdown의 이미지·HTML·링크를 실행하지 않고, 닫으면 controller의 본문 참조를 비우고 기존 목록으로 초점과 스크롤을 복구한다.

따라서 컴포넌트 안에 파일 읽기·권한 처리 조건문을 덧붙일 필요가 없다. 표시 변경은 view, 요청 수명 변경은 controller/session, 파일 규칙 변경은 reader/domain에서 처리한다.

## 상태와 부작용은 누가 소유하나

| 책임 | 소유자 | 수명/경계 |
| --- | --- | --- |
| 연결 참조·소유자·연결 세대 | FolderConnectionSession | 소유자 교체/해제 때 이전 작업 무효화. 인증 자체를 구현한 클래스는 아님 |
| 연결 상태와 목록/본문 협력 | SourceConnectionController | 권한 상실은 둘에 반영, 성공한 교체·해제 시작 시 함께 비움 |
| 현재 목록·본문·요청 취소 | 각각 Listing/PreviewController | 서로의 요청 순번을 간섭하지 않음. 늦은 성공뿐 아니라 오류도 차단 |
| 현재 DOM 초점·스크롤 | SourceFolderBrowser | 표시 전환의 책임. 연결 상태를 별도 useState로 복제하지 않음 |
| 파일 정보 접힘 | SourceDocumentPreview | 문서별 로컬 UI 상태. 본문 데이터/파일 접근은 소유하지 않음 |
| 읽기 정책 | packages/domain + reader | 확장자·크기 규칙 재사용. 실제 브라우저 접근은 reader에 한정 |
| 영구 저장 | IndexedDbHandleRepository | 기기의 핸들 참조만 보관. 파일 본문/서버 업로드 없음 |

`AbortController`가 OS 파일 읽기를 즉시 멈추게 하지는 않는다. `Blob.arrayBuffer()`에는 AbortSignal 인자가 없어, 결과 전후에 세대·취소 상태를 확인하는 것이 필수다. 이것이 UI/controller와 session 양쪽 수명 검사가 있는 이유다. [File API](https://www.w3.org/TR/FileAPI/#dom-blob-arraybuffer).

## 재사용과 주석을 적용한 기준

- 폴더와 본문 읽기는 기존 경로 검증 `copyFolderPath`와 domain의 파일 후보 규칙을 재사용한다. 파일 수를 줄이기 위해 두 읽기 유스케이스를 하나의 만능 함수로 합치지는 않았다.
- 버튼은 기존 `actionClasses`, 오류/진행은 `StatusNotice`, 간격·색은 CSS 토큰을 재사용한다. 표시 컴포넌트에 합성 fixture·타이머·파일 API를 넣지 않았다.
- 핵심 주석은 “왜 경로를 복사하는지”, “왜 읽기 후 다시 권한을 확인하는지”, “왜 이전 결과를 무시하는지”, “왜 DOM을 숨겨 보존하는지”를 설명한다. 모든 줄에 문법 설명을 붙이지 않는다.
- 현재 작업은 큰 파일을 통째로 재작성하거나 일반 프레임워크를 추가하지 않고, 기존 연결 구조에 독립적인 미리보기 상태/읽기/표시 책임을 연결했다.

## HTML을 검토하는 방법

`main`은 주 콘텐츠, `nav`는 탐색, `ol`은 경로, `ul/li`는 목록, `dl/dt/dd`는 파일 정보, `article`은 독립 문서에 쓴다. 버튼의 `type`, 접힘 상태의 `aria-expanded`와 `aria-controls`, 제목 초점, `hidden`의 키보드 제외도 확인한다. 배치를 위한 의미 없는 그룹에는 `div`가 적절하다.

`p`는 구문 콘텐츠(phrasing content)를 담는다. 따라서 `p > div`는 잘못됐지만 `p > button` 자체는 금지되지 않는다. 버튼/링크 안에 다른 버튼·링크를 넣는 중첩은 별도 제한이다. 지금 파일 정보의 `dl > div > dt/dd` 그룹은 허용된 구조다. [WHATWG p](https://html.spec.whatwg.org/multipage/grouping-content.html#the-p-element), [button](https://html.spec.whatwg.org/multipage/form-elements.html#the-button-element), [a](https://html.spec.whatwg.org/multipage/text-level-semantics.html#the-a-element), [dl](https://html.spec.whatwg.org/multipage/grouping-content.html#the-dl-element).

이번에는 관련 JSX와 공통 상태 컴포넌트의 실제 구성을 읽고, lint와 브라우저의 목록 자식·상호작용 중첩·ARIA 대상·main 개수·초점을 검사했다. 잘못된 HTML을 브라우저가 복구할 수 있으므로 DOM 검사만으로 소스 적합성을 단정하지 않는다. 전체 웹표준/스크린리더 인증을 완료했다는 뜻도 아니다.

추가 Lighthouse 검사에서 연결 관리가 h1 다음에 공통 행의 h3를 바로 노출하는 문제를 찾았다. 실제 구획 이름인 `summary` 안에 h2를 두어 `h1 → h2 → h3` 관계를 바로잡았다. 공통 `SettingRow`에 화면별 예외를 누적하거나 의미 없는 숨긴 제목을 추가하지 않았다. 취소 버튼이 사라진 뒤 초점이 body로 빠지는 문제도 화면 조합에서만 복구해 데이터 계층에 DOM 처리를 섞지 않았다.

## pnpm을 쓰는 이유와 확인 위치

기존 [스택 문서](project-stack-and-security.md)와 [아키텍처](architecture.md)에 기록된 선택은 **웹 앱과 공통 domain을 함께 관리하는 workspace**다. 과거에 npm/yarn/pnpm을 벤치마크해 가장 빨라서 골랐다는 기록은 없다. 현재 설정에서 확인할 수 있는 근거는 다음과 같다.

| 근거 | 실제 파일과 효과 |
| --- | --- |
| workspace 경계 | [pnpm-workspace.yaml](../pnpm-workspace.yaml)의 apps/*, packages/*. [web/package.json](../apps/web/package.json)의 `@personal-ai/domain: workspace:*`가 로컬 domain을 사용하도록 지정한다 |
| 재현 가능한 의존성 | [루트 package.json](../package.json)의 pnpm 12.15.0·Node 24.22.1, 정확한 의존성 버전, [lockfile](../pnpm-lock.yaml). `install --frozen-lockfile`은 manifest와 lockfile 불일치를 조용히 다시 계산하지 않고 실패시킨다 |
| 한곳에서 실행 | `--filter @personal-ai/web`으로 웹 명령을 선택하고 `pnpm -r typecheck`로 패키지 타입 검사를 묶는다. `pnpm check`로 타입·lint·단위·경계·빌드를 실행한다 |
| 공유 저장소 | pnpm은 내용 기반 저장소를 통해 설치 파일을 재사용할 수 있다. 현재 PC의 실제 용량/설치시간 절감은 측정하지 않았다. 서로 다른 드라이브/파일시스템에서는 hard link가 불가능해 복사가 사용될 수 있다 |

[공식 workspace 설명](https://pnpm.io/workspaces/), [frozen-lockfile](https://pnpm.io/cli/install#--frozen-lockfile), [공유 저장소](https://pnpm.io/), [다른 드라이브 제약](https://pnpm.io/faq#does-pnpm-work-across-multiple-drives-or-filesystems).

npm도 workspace를 지원하므로 pnpm이 필수인 것은 아니다. 이 저장소는 pnpm 계약·lockfile·스크립트를 이미 공유하고 있어 이를 일관되게 유지하는 것이 현재의 실용적인 이유다. 패키지 매니저 선택이 보안 검증을 대신하지 않으며, 이 작업에서 새 의존성을 추가하지 않았다. `.github`에는 현재 PR 템플릿만 있어 위 명령이 CI에 연결돼 있다고 주장하지 않는다.

## 검증과 구조도 범위

[미리보기 검증 기록](verification/source-file-preview/README.md)에 red→green 기록, 실행 명령, 현재 결과와 미검증 범위를 모았다. [구조도 원본](diagrams/local-files.architecture.json)과 [생성 영수증](diagrams/local-files.delivery.json)은 9개 검사/오류0/경고0, [브라우저 영수증](diagrams/local-files.visual-check.json)은 별도 자동 검사 결과다.

1440/2048px의 라이트·다크 캡처를 직접 확인했으며 겹침/잘림은 발견하지 못했다. 작은 보조 글자는 확대해서 읽도록 제공되며 파일별 상세는 이 문서를 사용한다. 구조도 본문은 한국어지만 도구의 고정 Viewer UI와 HTML lang은 영어로 생성된다. 모바일 구조도 조작·내보내기 전 형식은 이번 검증 범위가 아니다.
# 샘플 대화 정리·실모델 평가 — 2026-11-07 후속

최신 지침 v4/CO-012는 확정된 기간 밖 자료를 보류가 아닌 제외로 처리하고 제안 요약을 사용한다. [실패→재검증](verification/expectation-review/README.md)과 [정식 연결 초안](specs/live-txt-md-consent.md)을 먼저 읽는다. 아래 v3 설명은 도입 당시의 흐름이다.

`app/actions/sample-ai.ts` → `server/demo/sample-organization.ts`는 샘플 세션/Origin/동의/등록 자료와 DB 원자 한도를 확인한 뒤 공통 `generateGeminiJson`을 호출한다. 지침 v3은 날짜 키워드로 분기하지 않고 기간 필터·날짜별 정리·부정문을 독립 조건으로 제공한다. 결과는 기존 `shared/organization.ts`의 ID·인용·본문 날짜·상대 경로 검사 후 가상 변경 계획으로 전달한다. 개인 파일 AI는 이 경로에 연결하지 않았다.

`tests/server/organization-live.checks.ts`는 명시 opt-in과 development 요청 하나만 허용한다. 현재 후보 함수와 `tests/sample-workspace/organization/organization-evaluation.ts`의 판정기를 재사용하고 실제 DB/공급자 경계를 유지하며 해시·후보·토큰·시간·합성 응답을 기록한다. 정답·유보는 공급자 입력에 포함하지 않는다. 재현과 한계: [실모델 평가](verification/organization-evaluation/live-evaluation.md).
