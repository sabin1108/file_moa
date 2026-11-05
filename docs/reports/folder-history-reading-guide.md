# 작업 기록 기능 코드 읽기 — 2026-10-31

테스트 파일을 제외한 기능 구현 읽기 순서다. 모든 경로의 기준은 `E:/project/ai_folder_project/apps/web/src/features/local-folders`이다. 기존 전체 기능 가이드 다음에 이 흐름을 읽으면 된다.

## 먼저 흐름 잡기

`작업 기록 클릭 → dialog 열기 → controller.open → session.readSourceHistory → .moa-history 읽기 → JSON 검증·ID별 묶기 → controller 결과 게시 → 목록 표시`

닫기·취소·새 요청은 이전 응답을 무효화한다. 디스크에서 읽는 것은 이 폴더의 기록 JSON이며, 생성된 파일의 현재 존재나 내용은 읽지 않는다.

## 읽을 시작과 끝

| 순서 | 파일·읽을 범위 | 알아야 할 책임 |
| --- | --- | --- |
| 1 | [SourceFolderBrowser.tsx](E:/project/ai_folder_project/apps/web/src/features/local-folders/components/listing/SourceFolderBrowser.tsx)의 `historyControls`부터 전달 props 끝까지 → [FolderListingView.tsx](E:/project/ai_folder_project/apps/web/src/features/local-folders/components/listing/FolderListingView.tsx)의 `styles.tools` 영역 | 현재 경로·연결 세대를 key로 잡고 준비된 목록에서만 기록 버튼을 활성화한다. 목록의 선택/검색 상태를 건드리지 않는다. |
| 2 | [FolderHistoryDialog.tsx](E:/project/ai_folder_project/apps/web/src/features/local-folders/components/history/FolderHistoryDialog.tsx) 전체 | 클릭·Escape·닫기·초점·상태별 표시를 조합한다. 이 파일에서 디스크를 직접 읽지 않는다. |
| 3 | [folder-history-controller.ts](E:/project/ai_folder_project/apps/web/src/features/local-folders/store/folder-history-controller.ts) 전체 | `open → loading → ready/error`, 취소와 재시도, generation/AbortController로 늦은 응답을 막는 흐름을 읽는다. |
| 4 | [use-source-folder-connection.ts](E:/project/ai_folder_project/apps/web/src/features/local-folders/hooks/use-source-folder-connection.ts)의 반환 객체 `readHistory` → [connection-session.ts](E:/project/ai_folder_project/apps/web/src/features/local-folders/services/connection-session.ts)의 `readSourceHistory` 전체 | 화면에는 메서드만 노출한다. session은 소유자·핸들·연결 세대·취소 여부를 확인한다. |
| 5 | [services/folder-history.ts](E:/project/ai_folder_project/apps/web/src/features/local-folders/services/folder-history.ts) 전체 | 읽기 권한 확인 → 부모 경로 이동 → 기록 폴더 조회 → 한도 안에서 파일 읽기 → 검증/소유자/경로 필터 → 최종 권한 확인 순이다. 없는 기록 폴더를 만들지 않는다. |
| 6 | [lib/folder-history.ts](E:/project/ai_folder_project/apps/web/src/features/local-folders/lib/folder-history.ts) 전체 | `parseHistoryRecord`는 외부 JSON을 신뢰하지 않는다. `groupHistoryRecords`는 같은 ID의 시작/결과가 일치할 때만 완료·실패로 묶는다. 부분 조회·모순은 미확인으로 남긴다. |
| 7 | [FolderHistoryView.tsx](E:/project/ai_folder_project/apps/web/src/features/local-folders/components/history/FolderHistoryView.tsx) 전체와 [folder-history.module.css](E:/project/ai_folder_project/apps/web/src/features/local-folders/components/history/folder-history.module.css) | 검증된 DTO를 일반 텍스트·목록·날짜·details로 표시한다. 파일 접근이나 복구 실행은 없다. |

## 마지막에 작성자와 연결하기

[folder-creation-journal.ts](E:/project/ai_folder_project/apps/web/src/features/local-folders/services/folder-creation-journal.ts)의 `put`만 읽는다. 현재 writer가 만드는 `version/id/path/kind/status/time/owner`가 reader로 어떻게 돌아오는지 비교한다. 이어 [create-entry.ts](E:/project/ai_folder_project/apps/web/src/features/local-folders/services/create-entry.ts)의 첫 `journal.put(record)`부터 catch 끝까지 읽으면 pending/ready/failed/uncertain이 언제 생기는지 연결된다.

이번 조회는 재실행·자동 복구·삭제를 하지 않는다. `완료 기록`은 과거 저장된 결과이고 지금도 파일이 존재한다는 뜻은 아니다.
