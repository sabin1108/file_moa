# 미확인 작업 대상 확인 — 기능 코드 읽기

2026-10-31 추가 구현. 테스트 파일을 제외한 읽기 순서다. 기존 작업 기록 조회 흐름을 읽은 뒤 아래 범위만 이어 읽으면 된다.

| 순서 | 읽을 파일과 범위 | 따라갈 흐름 |
| --- | --- | --- |
| 1 | [HistoryTargetView.tsx](E:/project/ai_folder_project/apps/web/src/features/local-folders/components/history/HistoryTargetView.tsx) 전체 | 확인 버튼·진행·취소·오류·현재 결과 표시. 경로/종류 불일치면 대상을 임의로 고르지 않는다. |
| 2 | [FolderHistoryView.tsx](E:/project/ai_folder_project/apps/web/src/features/local-folders/components/history/FolderHistoryView.tsx)의 `group.status === "uncertain"` 영역 → [FolderHistoryDialog.tsx](E:/project/ai_folder_project/apps/web/src/features/local-folders/components/history/FolderHistoryDialog.tsx)의 controller 생성과 view props | 미확인 행에만 버튼을 넣고 현재 확인 중인 ID에만 관측 상태를 전달한다. |
| 3 | [folder-history-controller.ts](E:/project/ai_folder_project/apps/web/src/features/local-folders/store/folder-history-controller.ts)의 `TargetInspectionState` → `cancelInspection`부터 `inspectTarget` 끝까지 → 기존 `invalidate/open/close` | 다른 항목·새로고침·닫기·취소와 같은 세대/AbortController를 사용한다. 현재 확인과 과거 기록 결과는 별개다. |
| 4 | [use-source-folder-connection.ts](E:/project/ai_folder_project/apps/web/src/features/local-folders/hooks/use-source-folder-connection.ts)의 `inspectHistoryTarget` → [connection-session.ts](E:/project/ai_folder_project/apps/web/src/features/local-folders/services/connection-session.ts)의 `inspectSourceHistoryTarget` 전체 | 화면에 핸들을 넘기지 않고 현재 소유자·연결 세대·취소 여부를 검사한다. |
| 5 | [history-target-inspection.ts](E:/project/ai_folder_project/apps/web/src/features/local-folders/services/history-target-inspection.ts) 전체 | 현재 기록 다시 읽기 → 선택 당시 기록과 비교 → 현재 부모 열기 → 대상 종류/존재 확인 → 부모/대상 다시 비교 → 마지막 권한 확인 → 시각 포함 DTO 반환. |

핵심 분기 세 가지를 따라가면 된다. directory 조회의 TypeMismatch는 file 조회로 이어지고, 동일 대상이 확인되면 현재 존재/종류를 표시한다. 기록 자체가 바뀌면 다른 경로를 몰래 확인하지 않고 기록 새로고침을 요구한다. 권한·부모·대상 교체 오류는 ‘대상 없음’으로 취급하지 않는다.

대상 파일의 본문·크기·hash를 읽지 않으며 대상 폴더를 열거하지 않는다. 기록 JSON은 이전 reader의 한도 안에서 다시 읽는다. 현재 존재를 관측해도 생성 주체나 과거 성공을 알 수 없어 원래 미확인 상태는 그대로 둔다. 재접속 뒤 명시적으로 재연결하면 저장된 기록에 이 흐름을 다시 적용할 수 있다.
