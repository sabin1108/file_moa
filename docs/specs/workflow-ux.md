# 파일 작업 흐름·편집·새로고침 복원

2026-11-04 사용자 후속 요구. 기존 책임별 컴포넌트 구조를 유지하며 새 의존성은 추가하지 않는다. 현재 원본 변경은 사용자가 승인한 파일 관리 범위에서만 허용한다.

## 요구와 처리 계약

1. 복원 위치는 연결한 자료 루트로 시작하고 입력창에 루트 이름을 표시한다. 사용자가 변경할 수 있으며 원래 부모가 사라져도 기본 탐색이 실패하지 않는다.
2. 문서 편집은 기존 미리보기 영역을 전환한다. 첫 직접 저장 때 원본을 한 번 보존하고 같은 편집 세션의 반복 저장은 그 사본을 검증해 재사용한다. 편집 종료 후 새로 열면 별도 세션이다.
3. 직접 저장은 항상 제공한다. 자동저장은 기본30초, 설정에서 끄기/15/30/60/120초를 고른다. 첫 보존 전·IME 조합 중·저장 중·변경 없음·숨긴 탭에서는 자동 쓰기하지 않는다. 자동 권한창을 열지 않으며 권한 상실·외부 변경 시 초안을 남기고 중지한다.
4. 파일/폴더 복사·이동·복원은 DestinationFolderPicker와 NewEntryForm의 폼·탐색·생성 기능을 재사용한다. 반복 UI에서 정당한 이유 없이 공통 기능을 누락하지 않는다.
5. 단계 표시는 공통 WorkflowStepper를 사용한다. useSearchParams로 표시 단계를 읽고 useRouter.replace로 query를 갱신한다. URL 표시 단계와 실제 실행 권한은 구별한다. 컨트롤러의 업무 상태를 임의 query로 건너뛰지 못한다.
6. F5 뒤 이미 허용된 연결은 queryPermission과 실제 보관함 식별 검사로 재개한다. 권한 요청·생성·쓰기·삭제를 자동 실행하지 않는다. 작업 초안은 사용자/workspace/실제 연결 루트와 대조한 뒤 선택·경로·편집·검토를 복원한다. 실행 중이었다면 중단 안내하며 재실행하지 않는다.
7. URL에는 flow/step/불투명 draft ID만 저장한다. 파일명·본문·핸들은 IndexedDB에 둔다. 링크를 다른 기기에 보내도 로컬 접근 권한과 초안은 전달되지 않는다. 없는 로컬 초안 안내를 제공한다.
8. 저장 중 추가 입력을 허용하고 저장 시작 당시 text만 savedText로 갱신한다. 저장 도중 입력한 나머지는 dirty로 유지한다. dirty 닫기는 계속 편집/명시 버림을 제공한다.
9. 코드 설명서는 화면의 시작점과 실제 호출 경로를 연결한 한글 Markdown으로 작성한다. 짧은 코드·용어·수정 위치·한계를 설명하고 장식 이모티콘을 넣지 않는다.

## 처리와 데이터 경계

- URL: 표시 단계. `use-workflow-url.ts`.
- 초안: `workflow-drafts.ts` strict Zod 형식, owner/root 동일성 확인, IndexedDB 구조화 복사. pagehide 직전 편집문은 sessionStorage 보조 사본.
- 연결: `FolderConnectionSession.resumeGrantedConnections`는 권한 조회만 한다. 계정/연결 세대가 바뀐 결과는 폐기한다.
- 화면 수명: `use-workspace-workflow.ts`, `use-recovery-workflow.tsx`. `/files` 이탈 정리가 새 URL을 덮지 않게 제한한다.
- 편집 상태: `InlineEditorController`. 실제 파일 기준·보존 사본은 `InlineEditorSession` 내부.
- 최초와 반복 편집은 `writeVerifiedText`의 동일성·metadata/hash·64KiB 쓰기·완료 재읽기를 공유한다. UTF-8 바이트2MiB와 BOM/CRLF 형식을 처리한다.
- 반복 저장은 보존본 무결성·양쪽 JSON·현재 권한을 확인하고 저장별 started/verified 이벤트를 추가한다. 최초 사본만 유지하며 모든 중간 저장의 독립 복구본을 만드는 기능은 아니다.
- 현재 Web Lock은 앱의 origin 간 조정이다. 외부 편집기에 대한 OS 전체 원자적 잠금이 아니며 최종 검사와 실제 OS 변경 사이의 경쟁을 완전히 제거하지 못한다.

## 실패와 검증 기준

| 상황 | 기대 |
| --- | --- |
| 루트 기본 입력 | 비어 있지 않으며 내부 상대경로[]로 변환 |
| 원래 복원 부모 없음 | 루트 탐색·다른 기존 위치 복원 가능 |
| 폴더 작업의 새 항목 | 기존 생성 폼으로 생성 후 같은 picker 갱신 |
| 첫/두 번째/주기 저장 | 실제 본문 갱신, 최초 원본 사본1개 유지 |
| 조합 중·첫 보존 전 타이머 | 쓰기0 |
| 저장 중 추가 입력 | 새 입력 보존, savedText는 저장한 버전 |
| 외부 파일 변경·보존본 손상 | 쓰기 중지, 초안 유지 |
| F5 검토/편집/결과 | 로컬 상태 복원, 권한창·자동 재실행0 |
| F5 충돌 검사 | 목록 읽기 완료 후 선택 복원·현재 재검사 |
| 다른 기기의 링크 | 로컬 자료 미연결/초안 부재 안내 |
| 실행 단계 query 위조 | 준비된 private 근거·새 사용자 실행 없으면 쓰기 불가 |

구현·실행 근거는 [검증 기록](../verification/workflow-ux/README.md), 사용자를 위한 설명은 [코드 이해하기](../코드_이해하기.md).

Next API 근거: [useRouter](https://nextjs.org/docs/app/api-reference/functions/use-router), [useSearchParams와 Suspense](https://nextjs.org/docs/app/api-reference/functions/use-search-params). App Router에 Pages Router의 shallow 옵션을 적용하지 않는다.
