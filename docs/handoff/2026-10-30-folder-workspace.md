# 2026-10-30 폴더 작업 화면·실제 새 폴더 완료

프로젝트: `E:/project/ai_folder_project`. 최신 사용자 요청 범위를 마무리하고 memory에 저장한다. 이전 인수인계의 ‘계획/검색/목적지 미구현’은 현재 상태가 아니다.

## 최신 사용자 결정

- 선택 UX 지적은 목적지 확정이 아니라 파일 ‘선택/선택 취소’였다. 색만으로 선택·목적지를 구분하지 않는다.
- 기존 폴더 관리 디자인을 `%USERPROFILE%/Downloads/최종안_시안.zip`으로 교체한다. 채팅은 요청 없이 재디자인하지 않는다.
- 새 폴더는 **실제 디스크 생성**까지 구현한다고 명시적으로 답했다. 이동/복사 실행 전체가 승인·완료된 것으로 확대하지 않는다.
- memory와 실제 로그를 찾아 세부 개발 기준을 바탕화면 Markdown으로 정리하라고 했다. 59개 요구사항·원문/기록 출처·적용 해석을 구분해 저장했다.
- 마지막에 “작업 이어서해 그리고 다하면 memory에 저장해놔”라고 명시적으로 요청했다.

## 완료 상태

연결/재연결/해제, 직계 목록·탐색·새로고침, MD/TXT 원문, 파일 선택, 이름 검색/IME, 브라우저 방문 기록, 변경 계획, 목적지 탐색, 복사 전 내용 검사를 유지한다. 이번 폴더 화면은 경로/상위 열/현재 목록/미리보기로 바꾸고 모바일은 하단 native dialog로 표시한다. 색 외에 checkbox/선택됨/개수/열린 폴더/경로를 표시한다. 선택 취소는 검색 밖 선택도 비운다.

새 폴더: 목록과 목적지에서 입력 → 별도 작업 기록 폴더 선택 → 클릭 직후 쓰기 권한 → 연결/부모/충돌 확인 → 디스크 pending JSON과 재읽기 → 생성 → 동일 entry/연결 재검사 → ready JSON. 결과 불명확은 uncertain, 자동 재생성·삭제 없음. 기록 연결은 기존 ai-records 핸들 저장을 사용한다. 외부 앱의 동시 생성까지 원자적으로 배제하지는 못한다. 기록 폴더는 앱 기록용으로 선택된 위치이며 암호학적 무작위 파일명으로 상태별 기록을 쓴다. 기존 기록 갱신/일반 원본 파일 쓰기는 하지 않는다.

## 읽을 순서

1. DESIGN.md 최신 절 → `docs/specs/folder-workspace-revision.md`.
2. `docs/code-map.md` → `components/listing/FolderWorkspaceFrame.tsx`, `FolderListingView.tsx`, `SourceFolderBrowser.tsx`.
3. `store/folder-trail-controller.ts`, `source-listing-controller.ts`, `components/preview/FilePreviewPane.tsx`.
4. `components/listing/NewFolderForm.tsx` → `store/folder-creation-controller.ts` → `services/connection-session.ts` → `create-folder.ts` → `folder-creation-journal.ts`.
5. `docs/verification/folder-workspace/README.md`, `performance.md` 및 원자료.

복사 전 검사 읽기 단위는 `docs/specs/copy-inspection.md`, `docs/verification/copy-inspection/README.md`를 따른다. SHA-256은 Worker, 파일당16MiB/총64MiB/100파일, 실제 파일 복사는 아직 하지 않는다.

## 검증과 한계

- 최종 pnpm check: 220개/23파일, 타입·lint, 서버 경계21, 구조25+6+3, production43페이지 통과.
- 최종 실제 브라우저: 폴더 생성/화면23 + 탐색/history/IME23 + 목적지29 + 복사 검사27 = 102개 확인 통과. 독립 사용자 시나리오102개는 아니다.
- 390/768/1440/1920 PNG 직접 확인. 모바일/태블릿 여백 FAIL 수정 후 재실행. desktop 미선택 미리보기/모달 뒤 배경의 빈 면 WARN과 inset 선택 선의 소스 shadow WARN은 의미를 기록했다.
- 실제 Chromium/OPFS/Worker/WebCrypto/기록 파일을 사용한다. OS picker/권한은 fixture이므로 네이티브 OS 창·실제 개인 디스크·물리 IME·실기기 인증과 구분한다.
- 성능 6경로×2폭×3회, 이전 복사 검사 빌드를 기준선으로 보존. `docs/verification/folder-workspace/performance.md` 참조. 점수나 순수 최적화 성공으로 요약하지 않는다.
- 자동 승인 검토 서비스 사용량 한도로 한때 실행이 거절됐다. 20:52 갱신 안내 이후 정상 승인되어 21시 이후 검증을 완료했다. 현재 미해결 권한 blocker로 이어받지 않는다.

## 저장 위치와 실행 환경

- 바탕화면: `%USERPROFILE%/Desktop/사용자_개발_요구사항_정리_2026-10-30.md`.
- 저장소 사본: `docs/reports/사용자_개발_요구사항_정리_2026-10-30.md`.
- ZIP 참조: `docs/design-reference/final-folder-20261030/`. 정적 HTML에 실제 기능이 구현됐다고 보고하지 않는다.
- 마지막 production URL: `http://127.0.0.1:3010/files`. 다음 세션에 생존 확인한다. origin이 바뀌면 IndexedDB 연결도 달라진다.
- pnpm 프로젝트 런타임 Node24.22.1, 시스템 단독 node와 구분. git은 이전부터 전체 untracked이며 커밋/배포 요청은 없었다.

## 다음 작업

완료 기능을 처음부터 다시 구현하지 않는다. 사용자 화면 피드백이 오면 이번 시안/선택 계약을 기준으로 작은 수정부터 진행한다. 로그인은 별도 요청 때까지 보류한다.

후속 실제 파일 복사는 단순 create:true+writer로 무덮어쓰기 보장을 할 수 없으므로 `.omx/specs/copy-api-evidence-20261030.md`와 이전 copy-apply 명세의 남은 계약을 먼저 검토한다. 새 폴더 생성 성공을 복사 실행 준비 완료로 판정하지 않는다. native helper 도입이나 원자성 보장 변경은 별도 제품 결정이다. 자동 기록 복구 UI/기록 폴더 관리/OS 권한 통합 검증도 별도 작은 단위로 계획할 수 있다.

구조로 해결, 의미 있는 HTML, 불필요한 any 회피, 주요 책임 주석, 테스트 src 밖, 실제 API/버전/테스트 증거 검토, 동일 조건 성능 측정 기준을 유지한다. 일반적인 로컬 검사와 실행을 사용자에게 넘기지 않는다.
