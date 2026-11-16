# 자료 창 진입·폴더 선택·복원 안내 보완

기준 `cdf512e`. 사용자는 작업 선택 아래의 중복 설명 제거, 선택 안내와 버튼의 간격, 자료 창 자동 열기 제거, 데모 폴더 길게 누르기 선택 복원, 복원 알림 축소·반투명을 요청했다.

## 원인과 변경

- 공통 `ConversationTaskControls`에서 grounded 설명만 숨긴다. 첫 작업 선택 카드/시작 안내의 기능 설명과 나머지 작업 설명은 보존한다. 정식·데모가 같은 표시 함수를 사용한다.
- `SampleConversation.chooseTask`가 grounded 선택 때 자료 창을 강제로 열던 호출을 제거했다. 기본 웹사이트 문서 7개는 유지하며 ‘질문할 자료 선택’을 눌러 창을 연다. 안내 문장과 버튼을 별도 flex 항목으로 배치하고 가로12px/세로8px 간격을 둔다.
- 데모는 파일 ID만 보관하고 폴더 선택 콜백이 없어서 공통 폴더 행의 긴 누르기/Space가 막혔다. `fileSelectedFolders`와 `select-file-folders`로 폴더 경로를 별도 보관하고 존재·중복·길이를 검증한다. `/demo/files`에서만 폴더 선택 콜백을 연결하며 질문 자료 선택은 파일만 허용한다. 선택 종료·전체 해제·검색 결과·새로고침 복원도 연결했다. 빈 예시 폴더도 공통 목록에 표시한다.
- 정리 취소/back·되돌리기/undo로 새 폴더가 제거되면 선택 경로가 남아 복원이 실패할 수 있었다. 반례2개를 확인하고 사라진 폴더 선택만 제거해 남은 선택과 세션 기록을 보존한다.
- 공통 `StatusNotice`에 compact 표시를 추가했다. ‘이 탭에서 보관한…’ 복원 안내에만 8px 패딩·13px 제목·12px 본문과 배경72%를 적용한다. 텍스트 opacity는1이며 오류·만료 표시에는 적용하지 않는다. 폴더 선택 수는 파일+폴더를 합산한다.
- 작업 콜백이 없는 폴더 선택 도구는 폴더 포함 수만 표시한다. 실제 하위 자료 검사·계획 실행이 있는 것처럼 안내하지 않는다.

## 실제 검증

| 실행 | 결과 |
| --- | --- |
| 추가 반례 | 설명 잔존·자료 창 자동 열림·폴더 선택 부재/보관·compact 표시·back/undo 복원 회귀의 실패 로그 보존 후 수정 |
| 관련 단위·서버 | 17파일·237개 통과 |
| 전체 `vitest run --maxWorkers=1` | 180파일·1,628개 통과 |
| 타입·린트·빌드 | 통과. 기존 `_count` 경고1 유지 |
| 경계·구조·S0 | 서버 경계26·구조 검사·S0180 통과 |
| AI action 대체 UI | 40개 통과. 실제 공급자 호출 아님 |
| 로컬 production | 데모49·진입21 통과. 긴 누르기/클릭 억제·Space·F5 복원·자료 창 명시 열기·반투명/간격 확인 |
| 실제 Ego 브라우저 | 390/768/1440/1920px 채팅 간격·선택 복원 안내 확인, 실제 긴 누르기/Space/질문 선택 보존 확인 |
| 독립 정적 재검토 | 별도 explore가 두 번 읽기 검토. 부모가 발견한 back/undo 위험 보완 뒤 새 의미 있는 지적 없음. 전체 EGM 프로토콜 아님 |
| 성능 관측 | 로컬 공개/예시6경로×2폭×3회 36표본. JS/CSS54파일·4,592,221bytes. 동일조건 전후/개선율/field INP/실계정 성능 주장은 없음 |

증거는 `.omx/verification/grounded-task-copy-20261116/`의 로그·checks.json·screens·ego-local.json·performance-after.json에 있다. 배포 결과는 최종 `current-check.json`과 `deployment.json`으로 구분한다.

기본 병렬 `pnpm check`는 이전 변경에서 기록 저장 테스트의 시간 초과가 있었고 이번에는 반복하지 않았다. 이번 직렬 전체 통과를 기본 check 통과로 표시하지 않는다. 기존 화면2실패/taste20, 실제 로그인/물리 IME/운영 한도 경계는 미해결·미검증을 유지한다.

## 읽을 파일과 남은 범위

1. `sample-state.ts`: 폴더 선택 검증·구세션 기본값·back/undo 정리.
2. `SampleWorkspace.tsx`, `files/SampleFolderPanel.tsx`: 공통 폴더 행과 독립 파일/폴더 선택 연결.
3. `SampleConversation.tsx`, `ConversationTaskControls.tsx`, `conversation-options.module.css`: 명시 진입과 문장/버튼 배치.
4. `StatusNotice.tsx`, `status-notice.module.css`, `sample-workspace-store.ts`: 복원 알림과 수 표시.
5. `FileSelectionToolbar.tsx`, `product-ui.test.ts`, 브라우저3개: 실제 기능 범위를 설명하는 공통 도구와 회귀.

폴더를 선택하는 기능을 복원한 것이며 데모 원본 연결·편집·복사·이동·휴지통·복구 전체를 구현한 것은 아니다. 폴더 선택을 질문 자료 전체 자동 전송이나 재귀 작업 승인으로 취급하지 않는다. 사용하지 않는 분류 서버 계약/테스트는 보존했다. 개인 폴더·운영DB 직접 작업·새 모델/패키지·유료 생성은 사용하지 않았다. 유료 검증 누적 추정13회/$0.0011481은 계정 전체 청구가 아니다.

후속 전달문: 이 보고서와 `.omx/verification/grounded-task-copy-20261116/current-check.json`, `E:/memory/chatbotfolder/HANDOFF.md` 최신 절을 읽고 이후 diff/새 요청만 진행한다. 자료 창을 초기 진입에서 자동으로 열지 말고 기본 선택7개·선택 분리·빈 선택 복원·폴더 경로 검증/제거 정리·동의 경계를 보존한다. 이미 해결한 F1–F3를 반복 수정·검사하지 않는다. 실패·미검증·미연결 파일 기능을 완료로 바꾸지 않는다.
