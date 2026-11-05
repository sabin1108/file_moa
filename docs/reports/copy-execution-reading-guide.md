# 복사 기능 코드 읽기 — 2026-11-01

사용자 기능 코드만 설명한다. 테스트 파일과 실행 증거는 별도 검증 보고서에 있다.

1. `apps/web/src/features/local-folders/components/plan/SourcePlanDialog.tsx`의 SourcePlanDialog: 계획/검사/실행 상태를 구독하고 실행 중 입력을 잠근다. `CopyExecutionView.tsx`는 실행·중단 조작과 파일별 결과 표시를 맡는다.
2. `store/source-plan-controller.ts`의 executeCopy: 현재 열린 동일 계획과 검사 결과만 실행 controller로 전달한다. `store/copy-execution-controller.ts`의 start/cancel/reset: 중복 실행 차단, 취소 정산 보존, 소유자/연결 종료 후 늦은 결과 차단.
3. `services/connection-session.ts`의 inspectSourceCopy→executeSourceCopy: 메모리에 승인 snapshot을 보관하고 현재 owner/root/세대/계획을 대조한다. 명시적 사용자 실행 제스처를 확인한다.
4. `services/copy-execution.ts`의 executeCopy 전체: 권한→앱 잠금→원본/목적지 재검사→immutable bytes 고정→prepared journal→파일마다 충돌 검사/started→쓰기/close→내용 확인/verified→stopped. 실패는 현재 항목 미확인/후속 미실행으로 정산한다. source write/delete 코드는 없다.
5. `services/copy-journal-storage.ts`의 CopyJournalWriter: 읽기 한도 내 최악 이벤트 수·bytes 예산을 확인하고 .moa-history에 새 이벤트를 append한다. 부모·기록 폴더·파일 identity와 실제 payload를 다시 확인한다. 같은 파일을 덮어써 갱신하거나 삭제하지 않는다.
6. `lib/copy-journal.ts`의 parseCopyEvent→summarizeCopyEvents: 외부 JSON을 좁혀 읽고 이벤트 순서/중복/모순/종료를 판정한다. 완료 기록이 있어도 현재 존재를 단정하지 않는다. partial/corrupt/missing tail은 미확인이다.
7. `services/copy-journal-storage.ts`의 readCopyHistory→`store/folder-history-controller.ts`→`components/history/CopyHistoryView.tsx`: 현재 목적지 기록만 읽어 기존 생성 기록과 구별해 보여준다. readSourceHistory가 두 record family를 조합한다.
8. `services/copy-history-inspection.ts`의 inspectCopyHistoryTargets: 사용자 요청으로 현재 target bytes/hash만 대조한다. 앞뒤 기록 검증, 파일/부모 교체 감지, 권한 확인 후 관측을 반환한다. 기록 수정/자동 복구는 하지 않는다.

UI에는 raw handle이나 파일 본문을 넘기지 않는다. 최종 사용자 설치/외부 서비스/새 의존성은 없다. 외부 프로그램의 동시 파일 생성까지 원자적으로 차단하는 기능은 아니며 실제 AI 호출도 아직 없다.
