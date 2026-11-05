# 2026-11-04 복구 보관함 생성·연결 완료

## 재개 우선 — 편집기 미저장 내용 대조, 그다음 로그인 기반 검토

제품 변경73~76까지 완료했지만 마지막 IDE 진단은 별도 미완료다. 저장된 SourceFolderBrowser는 onOpenFile/onSelectPrevious를 전달하며 web 타입/해당 ESLint가 통과했다. VS Code의 미저장 예전 내용은 다른 버전이었고, 최신 SourceFolderBrowser를 연 뒤 남은1오류는 FolderListingView 미저장 버전의 필수 onSelectionOpen 선언이다. 이 상태는 마지막 확인이며 다음 실행에서 재확인한다.

다음은 미저장 내용을 먼저 별도로 보존하고 디스크와 대조해 필요한 변경을 합친 뒤 IDE·CLI 양쪽 진단을 확인하는 일이다. 강제 저장/폐기하지 않는다. `.omx/editor-unsaved-20261104`는 빈 준비 폴더일 뿐 백업 파일은 생성되지 않았다. 관련 없는 layout의 미저장 내용도 임의로 건드리지 않는다. 상세는 E:/memory/chatbotfolder/HANDOFF.md 최신 절과 Requirements/오류_정리.md다.

그다음 제품 후보는 로그인·사용자별 workspace/자료·보관함 연결 분리, 기존 연결 확인/선택이다. 실제 인증 제공자·서버/DB·배포와 사용자 전환/만료/로컬 핸들 경계를 명세로 정해야 한다. 앞선 ‘다음 기능은 무엇인가’ 답변은 구현 착수 승인으로 취급하지 않으며 이번 memory 요청에서는 제품 코드를 변경하지 않는다.

## 가장 최신 — 사용자73~76 연결 버튼·A4·경고·하단 알림 완료

사용자는 기존 보관함/다시 연결 버튼이 같은 동작처럼 보인다고 지적하고32인치 전체 화면의 문서 지면을 A4 정도로 조금 넓혀 달라고 했다. 이어 저장하지 않은 편집 경고와 버튼의 간격, 최상단 일시 경고를 우측 하단 작은 알림으로 바꾸도록 요청했다. 요구73~76과 docs/specs/document-a4-vault-actions.md에 기록했다.

RecoveryVaultSettings는 별도 ‘보관함 다시 연결’ UI를 제거하고 기존 선택 버튼 하나를 사용한다. 연결되어 있으면 ‘다른 보관함 선택’으로 표시하며 권한 상실 상태도 같은 기존 보관함 재선택/식별 검증 경로를 쓴다. 연결 service·파일 보호·권한 계약은 바꾸지 않았다. source-document-preview.module.css의 같은 본문은 최대CSS210mm(793.7px), 컨테이너 폭×297/210 최소 높이다. 읽기/편집 모두 적용하고 좁은 화면은 줄이며 긴 내용은 늘어난다. PDF 생성·물리 모니터 실측 기능이 아니다.

InlineDocumentEditor의 dirty 확인은 문서 최대 폭으로 제한하고 경고와 버튼 그룹에12px을 둔다. DismissibleNotice는 fixed 우측하단24px/max420px(작은 화면16px·안전 영역)으로 옮겨 문서 시작점을 밀지 않는다. 직접 닫기·5초·hover/키보드 pause, 중요한 오류/저장 확인 비자동닫기는 유지한다. 타입 검사에서 사용되지 않는 필수 onSelectionOpen Props 선언을 발견해 한 줄 제거했으며 선택 동작은 변경하지 않았다.

최종568테스트/56파일·타입/lint/경계·43페이지 build, production3040 합성 OPFS/Worker/IDB70검사(집중21+기존흐름49), 예외/실패0.390/768/1440/1920/2560/3840px의 실제 읽기/편집 폭·높이/A4비율, 권한 상실 뒤 단일 연결/파일 쓰기0·재생성0, 경고간격12px, toast rect/상단 비이동/수동·5초 닫기와 기존 편집·F5·복사 흐름을 확인했다. docs/verification/document-a4-vault-actions/{README.md,check.log,performance.md}가 근거다. 코드 설명서와 DESIGN도 갱신했다.

사용자 확인은 같은 origin http://127.0.0.1:3034/files 에 최신 build를 반영했다. 새 origin에 개인 핸들을 옮기지 않는다. 테스트는 사용자 note/실물 디스크에 접근하지 않았다. native 권한창/물리IME/외부 원자적 경쟁·실사용 INP·실제32인치 물리 크기는 미검증이다. 다음 세션은 이 절→요구73~76/짧은 오류→명세/검증→실제 소스 순서로 읽는다. 새 의존성·아토믹 전환·로그인/AI·commit/PR/배포 없음. 전체untracked 상태다.

## 가장 최신 — 사용자68~72 화면 일관성·재사용·알림 완료

사용자는 보관함 조회와 연결 관리 버튼 묶음, 미리보기/편집 괴리, 파일-only와 폴더 포함 복사의 다른 진입 과정, 경고 닫기/5초 수명, 이미지의 브라우저 쓰기 권한창 디자인 가능 여부를 지적했다. 요구68~72에 기록하고 docs/specs/workspace-consistency.md의 변경 계획/실패 조건을 먼저 작성했다. controller의 ‘처음 목적지 계획/선택 후 명시 검사’ 시험을 기존 자동 picker에서 실패시킨 뒤 수정했다.

### 실제 변경과 책임

RecoveryVaultSettings는 현재 연결/상태 확인/사본 조회와 fieldset의 생성·기존 연결·해제를 분리했다. 새 선택/권한 흐름을 추가하지 않는다. DocumentWorkspace는 제목/도구줄/정보/본문/하단 슬롯의 같은 작업면이며 SourceDocumentPreview의 article과 InlineDocumentEditor의 textarea가 공유한다. source-document-preview.module.css의 공통 본문 폭690px·17px/1.85·20px(작은 화면16px),48dvh 최소 지면을 사용한다. 전역 `.system :is(input, select, textarea)`가 폰트를 덮는 원인은 `.preview .body` 우선순위로 수정했고 네 폭 computed style/rect 비교로 확인했다. 편집 시작은 입력에, 목적지 확정 뒤에는 공통 목적지 버튼에 초점을 둔다.

FileOperationHeader는 제목·선택/출발 요약·닫기·Stepper를, DestinationPlanStep은 작업 선택·목적지 버튼·계획 조작을 공유한다. PlanDestinationInput은 기존 source plan의 어댑터, ManagedOperationView는 같은 입력에 managed controller를 연결한다. 폴더 copy/move도 열자마자 탐색하지 않고 계획 화면→목적지 선택→같은 picker/생성→선택 확정→계획 만들기→검사→별도 최종 실행이다. ManagedFilesController.destinationConfirmed로 미선택 실행/검사를 막고 작업 종류 전환은 기존 검토를 폐기한다. 파일 copy→move에서도 목적지를 유지한다. 파일 conflict/보존/overwrite와 재귀 트리의 실제 파일 검증·보호 계약은 각각 유지한다. 새 의존성/아토믹 전환 없음.

WorkflowDraft의 destinationConfirmed/choosing/pickerPath를 추가했다. 확정 destination과 탐색 중 위치를 별도로 보관해 F5 뒤 탐색을 취소해도 미확정 위치가 승인되지 않는다. 기존 owner/root 동일성·실행 중 자동 재실행 금지는 유지한다. DismissibleNotice는 기존 StatusNotice를 조합해 X/기본5초·hover/키보드 pause를 제공한다. 복원 안내 같은 일시에만 자동 닫기, 초안 저장 실패 등 중요한 오류는 수동 닫기만 제공하며 실행 확인/진행은 기존 표시를 유지한다. 닫기는 파일 상태를 건드리지 않는다.

이미지의 변경사항 저장 창은 Chromium File System Access 보안 UI다. 공식 Chrome/MDN/Permissions 명세로 앱 CSS·자동 닫기 대상이 아님을 확인했다. 앱은 직접 저장에서 권한 요청 결과를 처리하며 기존 앱 안내를 사용한다. 네이티브 창을 가짜로 대체하거나 우회하지 않는다.

### 검증·산출물·환경

최종568테스트/56파일·타입/lint/경계·production43페이지 build, production3039 Chromium OPFS/Worker/IDB207검사(통합48/managed20/현재복원45/복원F535/overwrite38/연결21), 실패/콘솔 예외0.390/768/1440/1920 문서 같은 위치/폰트와 공통 계획,390/1440 보관함 그룹,5초/직접 알림 닫기, 탐색/확정/검토/결과 F5, 작업 종류 변경,15초 자동저장·사본1개·권한창0·외부 변경 차단·16MiB 트리/중단/충돌 회귀를 확인했다. docs/verification/workspace-consistency/{README.md,check.log,static-review.json,performance.md}를 따른다.

docs/코드_이해하기.md에 새 공통 면/어댑터/입력·확정/탐색 F5/알림/권한창의 실제 흐름을 추가했다. 요구사항 원장은72까지, 짧은 오류와 중요한 사용자 강조 내용은 외부 memory에 기록했다. 사용자 note/실물 디스크·네이티브 권한창·물리IME·외부 OS 원자적 경쟁·실사용 INP는 미검증이다. 실제 페이지는 기존 origin http://127.0.0.1:3034/files 에 새 build로 재시작했다. 테스트 origin3039와 혼동하지 않는다. 보관된 핸들을 새 origin으로 옮기지 않았고 사용자 파일/브라우저 데이터를 테스트·삭제하지 않았다. 중간 검증용3032/3033/3035~3038 서버는 종료했다. 다음 세션에는3034 생존을 다시 확인한다. 전체untracked·commit/PR/배포 없음.

다음 읽기: 이 절→외부 요구68~72/짧은 오류→workspace-consistency 명세/검증→코드 설명서/실제 파일. 신규 로그인/AI/영구 삭제 등으로 범위를 넓히지 않는다. 성능과 원자료는 이번 최종 문서를 우선하며 이전 UX62~67 수치를 현재 결과로 재사용하지 않는다.

## 가장 최신 — 사용자 UX62~67·자세한 코드 설명서 완료

사용자는 기능1~6 이후 복원 위치/편집/재사용/단계와 F5를 정정하고, 그 작업이 끝난 뒤 본인이 이해할 수 있는 자세한 한글 코드 설명서를 요청했다. 외부 요구사항 원장은67번까지 갱신했다. 기존54의 테스트 보류는61에 따라 이번 범위에서 해제된 상태다. 기존 구조를 유지하며 아토믹 전환·새 의존성·로그인/AI7번 이후 구현은 하지 않았다.

### 최종 동작과 소유 파일

- 복원은 연결 루트[]로 시작하고 DestinationPathForm에 루트 이름을 표시한다. parsePastedFolderPath가 표시 접두어를 상대경로로 해석하며 절대경로 후보 확인은 유지한다. 원래 부모가 없어도 다른 위치에 복원한다.
- ManagedFilesDialog/RecoveryRestoreView도 DestinationFolderPicker+NewEntryForm의 전체 폼·생성·탐색을 재사용한다. AGENTS/guidelines에 UI/폼/상호작용 재사용을 중요 기준으로 추가했다.
- SourceFolderBrowser의 기존 FilePreviewPane 안에서 InlineDocumentEditor로 전환한다. InlineEditorController가 입력/dirty/저장/IME/닫기 확인을, InlineEditorSession이 실제 기준 proof·최초 backupId/보존 payload·권한/잠금을 소유한다. 첫 직접 저장 뒤 같은 편집 세션의 반복 수동·주기 저장에서 원본 사본을 재사용한다. 양쪽 저장별 이벤트는 추가한다.
- verified-text-writer는 기존 managed edit와 반복 저장의 UTF-8/BOM/CRLF/2MiB·파일 handle/size/mtime/hash·64KiB/완료 재읽기를 공유한다. 저장 중 추가 입력은 이번 저장의 savedText를 덮지 않고 dirty로 남는다. 외부 편집·보존본 손상·권한 상실에서 중지한다.
- EditorSettings/editor-preferences: 기본30초, 끄기/15/30/60/120초. 첫 직접 보존 이후 visible/dirty/비조합 상태에서 주기 저장한다. 타이머는 queryPermission만 하고 권한창을 열지 않는다. 설정은 현재 브라우저 localStorage다.
- WorkflowStepper와 workflow-steps를 공유하고 use-workflow-url의 Next query를 표시 단계 기준으로 사용한다. 실제 승인·IO 상태는 controller/session이 소유한다. URL에는 flow/step/opaque draft만, 선택/본문/핸들은 WorkflowDraftRepository의 owner/root-bound IndexedDB에 둔다.
- SourceConnectionController.load→resumeGrantedConnections는 이미 granted 읽기 연결만 재개하며 보관함 식별/위치를 검증한다. use-workspace-workflow와 use-recovery-workflow가 선택/위치/편집 checkpoint/검토·결과를 복원한다. 실행 중 F5와 임의 execute query는 자동 쓰기하지 않는다. 다른 기기에 로컬 초안이 없으면 안내한다.

### 발견한 오류·정정

기존 편집 popup/매번 백업, 폴더 picker의 생성 비활성화, 복원 원래부모/빈 입력을 요구대로 정정했다. 새로고침 충돌 복사에서 최초 root listing이 loading일 때 navigation.openFolder가 즉시 반환해 선택이 비어 plan.open이 실패했다. listing 준비/같은 경로를 확인한 뒤 선택을 복원하도록 고쳤고 복원 종료 때 URL을 현재 재검사 상태와 맞춘다. pagehide 임시 텍스트는 해당 최신 IDB 사본과 같을 때 정리해 오래된 fallback이 최신 초안을 덮지 않게 했다. 상세 실패 개발 실행은 최종 검사 수에 포함하지 않는다.

### 검증·산출물

최종 pnpm check exit0:566테스트/56파일·타입/lint·경계·43페이지 build. production3034의 OPFS/Worker/IndexedDB UI188검사, 390/768/1440/1920 편집/검토와 설정/키보드/합성 IME, F5의 편집·폴더검토·완료/충돌·복원검토/결과·재실행 차단을 확인했다. 웹 TS206파일 명시적any0. 전체6경로×2폭×3회 성능36표본, 정적1218942bytes, files JS260.78KiB, LCP124/120ms, CLS0. 자료는 docs/verification/workflow-ux/{README.md,performance.md,static-review.json}. docs/코드_이해하기.md는19절로 실제 화면→함수→처리와 기초 문법/수정 위치/전체 범위를 설명하고 README/code-map/src 안내에 연결했다.

### 제한·다음 읽기

검증은 합성 자료이며 사용자 note/실물 디스크·네이티브 권한창·물리IME·외부 OS 원자적 경쟁은 미검증이다. URL 공유는 핸들/본문 공유가 아니다. F5는 one-shot 보존/덮어쓰기 승인을 되살리지 않고 현재 재검사로 돌아간다. 이전 사본과 기록은 유지한다. 같은 편집 세션의 최초 원본만 보존하며 모든 자동저장 버전의 독립 복구는 아니다. 강제 종료 직전 키 입력 영구 보장은 없다. Source hash의 두 값은 README 안내 문단만의 변경임을 재구성 hash로 증명했다. 실행 소스 hash354ab0022798ec9b002743e6af8d5419ac5061cb45132c84ba3ce7bb3cad9925.

다음 세션은 이 절→요구62~67/짧은 오류→workflow-ux 명세/검증→실제 코드/코드 설명서를 읽는다. 서버 생존은 다시 확인한다. 다음 기능 자동 착수는 하지 않는다. 전체untracked·commit/PR/배포 없음.

## 가장 최신 — 승인한 기능1~6과 테스트 재개 완료

요구55~61: 복원 파일 현재 대조, 실제 단일 파일 이동, 재귀 폴더 복사·이동, 앱 휴지통/새 항목 복구, MD/TXT 편집·저장을 구현했다. 기존 컴포넌트 설계/공통 표시를 유지하고 private 승인·보존 bytes/양쪽 JSON·비재귀 원본 제거·외부 변경 검사·실패/중단 정산을 연결했다. 영구 삭제/자동 purge는 없다. 보관함을 포함한 관리 폴더가 있는 트리의 원본 제거는 차단한다.

사용자가 테스트 재개를 요청해 보류54를 이번 범위에서 해제했다. 최종556테스트/54파일·타입/lint/경계·43페이지 build, 실제 Chromium OPFS/Worker 브라우저349검사와 전체 성능36표본을 수행했다. 코드 검토에서 찾은 목적지 최종 확인/제거 부모 교체/한쪽 완료 기록 오판을 고치고 반례를 고정했다. [계약](../specs/managed-files.md), [검증·미검증](../verification/file-management-six/README.md), [성능](../verification/file-management-six/performance.md). 아래 보류/미구현 설명보다 이 절을 우선한다. 개인 note·실물 디스크/네이티브 권한창에는 접근하지 않았다. 최신 production3031은 다음 실행 때 생존/빌드를 확인한다.

## 가장 최신 — 복원 작업 기록 조회·테스트 보류

사용자가 기존 컴포넌트 설계를 유지하고 복원 작업 기록 조회를 진행하도록 요청했다. 추가로 요청 전까지 테스트를 건너뛰라고 지정했다. 기존 작업 기록→복원 분류에 목적지의 과거 복원 파일명/위치/시각/용량/완료·중단·실패·확인 필요를 연결했다. 기존 controller/dialog/표시를 재사용하며 reader/순수 요약/표시 책임을 분리했다. 현재 파일/보관함 대조나 복원 재실행은 추가하지 않았다.

이번 변경은 타입·lint·43페이지 build만 통과했다. 단위/브라우저 테스트 작성·실행 및 성능 측정은 사용자 지시로 보류했고 실제 동작/4폭 화면은 미검증이다. 아래514테스트/204브라우저/성능36표본은 직전 복원 기능의 과거 결과다. [명세](../specs/recovery-restore-history.md), [이번 확인 범위](../verification/recovery-restore-history/README.md). 다음 단계는 요청 시 이번 변경의 동작 검증이다. 테스트 재개나 새 기능을 자동 승인하지 않는다.

## 가장 최신 — 새 파일 복원·삭제된 보관함 상태·자료 루트 바로 아래 허용

요구사항49~51: 복구 사본 확인→기존 복원 위치→새 이름 제안/최종 실행→실제 파일/양쪽 기록 검증을 완료했다. 저장된 핸들을 현재 존재로 간주하던 오류를 읽기 전용 현재 식별/위치 검사와 승인 폐기로 수정했다. `note/보관함` 구조를 허용하고 일반 자료 경로의 보관함 접근은 공통 경계로 차단한다. 외부 삭제는 설정 열기/창 복귀/보이는 탭5초 간격/수동 검사 시 반영하며 자동 재생성/권한 요청0이다.

전체514테스트/51파일·타입/lint/경계·43페이지 build, production3026 브라우저204검사(복원43/목록37/연결23/덮어쓰기38/복사26/계획37).16MiB 실제 복원/충돌 재검사/부분 취소/원래 폴더 상실/OPFS 보관함 실제 삭제를 확인했다. [명세](../specs/recovery-restore.md), [위치](../specs/recovery-vault-placement.md), [검증·한계](../verification/recovery-restore/README.md), [성능](../verification/recovery-restore/performance.md). 외부 Requirements/오류_정리.md는 짧게, 상세는 memory/HANDOFF 최신 절에 둔다. 아래 복원 미구현 문구보다 이 절을 우선한다. 다음 후보는 복원 기록 조회이며 새 작업 승인으로 간주하지 않는다.

## 가장 최신 — 보관함 목록·상세와 권한 안내 디자인

요구사항47~48: 파일 화면/연결 설정의 `복구 보관함 보기`→metadata 목록→펼친 상세→명시적 보관본 검사를 구현했다. 정상/손상/확인 필요와 보관본·양쪽 기록 결과/검사 시각을 구분한다. 권한 안내는 사이트 스타일을 재사용한 짧은 영역이며 추가 승인 단계가 없다. 브라우저/OS 권한창 자체를 꾸미거나 대체하지 않는다. 안내를 처음부터 표시해 로딩 후 삽입으로 인한 밀림을 줄였다.

전체481테스트/47파일·타입/lint 경고0·경계·43페이지 build. production3025의 브라우저161검사와 최종 성능36표본은 [검증](../verification/recovery-archive/README.md)/[성능](../verification/recovery-archive/performance.md)을 따른다. 읽기는 권한 요청/생성/쓰기/삭제0이며 개인 디스크와 네이티브 권한창은 미검증이다. 최신 소스/목록/진단 경계는 [명세](../specs/recovery-archive.md), 외부 memory/HANDOFF 최신 절. 복원·삭제·보존 기간 설정·실제 이동/재귀는 후속이다. 아래의 목록 미구현 문구보다 이 절을 우선한다.

## 가장 최신 — 검증된 복구 사본 후 실제 덮어쓰기

사용자의 진행 지시에 따라 충돌 백업 완료→덮어쓰기 검토→별도 최종 실행→파일별 결과까지 연결했다. 현재 대상과 실제 보관본/양쪽 기록을 재검증하며 session이 백업 당시 파일/부모 핸들과 한 번 소비하는 내부 승인을 보관한다. 원본은 유지하고 기존 목적지만 교체한다. 첫 실패 뒤 후속 항목을 막고 시작한 항목의 실패/취소는 확인 필요로 남긴다. 요구사항46과 [명세](../specs/recovery-overwrite.md)를 따른다.

최종 전체458테스트/45파일·타입/lint 경고0·서버/구조 경계·43페이지 build, production3023의 브라우저147검사.16MiB를256×64KiB로 써서 원본 불변/대상 hash 일치를 확인했다. [검증·재현·한계](../verification/recovery-overwrite/README.md), [성능](../verification/recovery-overwrite/performance.md). 오류/요구 원장은 외부 Requirements, 상세는 memory/HANDOFF 최신 절이다. 복원/삭제/보관 기간/보관함 목록·실제 이동/재귀 작업은 후속이다. 아래 과거 덮어쓰기 미구현 문구보다 이 절을 우선한다.

## 가장 최신 — 연결 흐름·오류 강조·기록 위치

자료 연결/재연결 뒤 설정을 유지하고 보관함 제목으로 초점을 옮긴다. 완료/나중에 연결로 명시적으로 마친다. 오류는 짧은 제목·수정 안내·직접 행동 버튼과 경고/alert/초점으로 표시한다. 새 로그인/사용자 판별은 후속이다. 요구사항43~45와 [명세](../specs/folder-connection-flow.md)를 따른다.

오류 기록은 `E:/memory/chatbotfolder/Requirements/오류_정리.md`로 이동했고 스킬/AGENTS/현재 참조를 갱신했다. 상세는 외부 HANDOFF 최신 절. 전체431테스트/44파일·타입/lint/경계·43페이지 build, 완료된 브라우저5묶음123검사와 성능36표본. [근거·검증 한계](../verification/folder-connection-flow/README.md), [성능](../verification/folder-connection-flow/performance.md). production3020을 사용했다.

## 가장 최신 — 생성 실패 후속과 기록 스킬

생성 위치 선택과 실제 생성 버튼을 분리하고 생성 클릭에서 쓰기 권한을 요청한다. 실패 단계/코드를 표시한다. 원래 사용자의 실제 exception은 미수집이며 재현된 query-only prompt 중단과 구별한다. 전체430테스트/44파일·타입/lint/경계·43페이지 build, production3019 생성·연결19/백업UI23 통과. [짧은 오류 기록](/E:/memory/chatbotfolder/Requirements/오류_정리.md), [수정 근거](../verification/recovery-creation-fix/README.md). 상세는 외부 memory/HANDOFF 맨 위 최신 절에 저장했다.

요구사항39~42, `.agents/skills/project-work-log/SKILL.md`, AGENTS 시작 라우팅을 추가했다. 짧은 오류 기록과 요구사항을 작업 시작/진행/마감에 확인하며 긴 과정은 memory 인수인계에 둔다. 최신 확인 주소는 http://127.0.0.1:3019/files. 네이티브 앱 접근 승인 시간 초과로 OS 권한창 검증은 못 했다.

## 가장 최신 — 실제 복구 사본 화면까지 완료

사용자가 작업 계속을 지시해 API 다음의 실제 UI도 연결했다. 정확한 이름 충돌 검사 → 새/기존 파일 비교 → 별도 복구 사본 만들기 → 파일별 결과를 제공한다. Escape는 실행 취소 정산 뒤 결과를 남기고 source/owner 해제는 과거 결과를 폐기한다. 혼합 선택에서 정확한 충돌만 백업한다. 최종 덮어쓰기는 후속이다.

최신 전체424테스트/43파일·타입/lint/경계·43페이지 build. 최종 production3016 UI23검사, UI 연결 뒤 복사26·반복 피드백37, backend OPFS/Worker16과 앞선 보관함 연결14를 검증했다. [최종 보고](../verification/recovery-backup/README.md), [성능](../verification/recovery-backup/performance.md). 현재 확인 주소는 http://127.0.0.1:3016/files. 다음은 최종 덮어쓰기 경고/현재 목적지·보관본 재검증/명시적 실행과 실패 계약이다. 외부4종 memory 재개 문서는 이번 후속으로 갱신하지 않았으므로 이 최신 절을 우선한다.

## 앞선 단위 — 기존 목적지의 검증된 백업 API

사용자가 다음 백업 단위의 진행을 요청해 source/target 읽기 검사, immutable target bytes, 양쪽 prepared/verified/stopped JSON, 실제 보관본 저장·close 후 재열기·크기/SHA-256 재검증을 구현했다. session이 내부 검사 snapshot·새 사용자 제스처·owner/source/recovery 세대를 요구한다. 기존 copy의 충돌 차단을 유지하며 이 API를 호출하는 사용자 버튼은 아직 없다.

최신: [복구 백업 명세](../specs/recovery-backup.md), [검증](../verification/recovery-backup/README.md), [성능](../verification/recovery-backup/performance.md). 전체418테스트/42파일·타입/lint/경계·43페이지 build 통과. 실제 OPFS/Worker 신규16검사+3추가 실행(16MiB 경계 포함), 기존 복사26·보관함 연결14 통과. 네이티브 디스크/외부 경쟁·실물 입력은 미검증이다. 서버3013을 사용했다.

다음 단위는 충돌 파일 비교/계속·중단/백업 실행의 사용자 흐름과 최종 덮어쓰기 경고·실행이다. 성공 기록은 당시 관측이며 이후 덮어쓰기 권한이 아니므로 보관본과 현재 목적지 재검증이 선행돼야 한다. 복원/삭제·보존 기간/자동 삭제는 후속이다. 이전 절의 백업 미구현/다음 작업 설명은 이 절로 대체한다.

---

사용자의 다음 기능 시작 요청으로 [복구 보관함 생성·연결](../specs/recovery-vault-connection.md)을 구현했다. 기존11월3일 UI/코드 기준을 유지한다. [검증/한계](../verification/recovery-connection/README.md), [코드 읽기](../code-map.md), [성능](../verification/recovery-connection/performance.md).

위치 관계 검증 → 명시적 UUID 하위 폴더 생성/식별 재읽기 → 기존 보관함 연결 → owner별 recovery 참조 저장 → 새로고침 뒤 명시적 재연결/해제까지 완료했다. 생성 실패/취소 시 남은 새 폴더를 자동 삭제하지 않는다. 실제 백업·덮어쓰기·복원·삭제는 구현하지 않았다.

전체396테스트/39파일·타입/lint/경계·43페이지 build 통과. 신규 브라우저14, 기존 복사26·반복 피드백37 통과. OPFS/합성 권한 결과이며 네이티브 디스크/외부 경쟁은 미검증이다. 서버는 이번 세션에서3012로 실행했다. 다음 세션에는 생존/빌드를 확인한다. commit/PR/배포하지 않았다.

다음 단위: 기존 목적지 파일의 백업 manifest/immutable bytes/close 후 재읽기/hash 검증과 실패 계약. 검증된 백업 이전에는 대상 파일을 변경하지 않는 실패 테스트가 우선이다. 보존 기간/자동 삭제는 미정이다.
