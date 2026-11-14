# 첫 사용과 채팅 사용성 보완 검증

2026-11-14 사용자 피드백을 [명세](../../specs/chat-usability.md)와 [DESIGN.md](../../../DESIGN.md)의 같은 날짜 개정에 반영했다. 전체 사용 구조의 재설계는 후속 사용자 설계를 기다린다.

## 변경과 읽는 순서

1. server/auth/session-guards.ts: 비로그인 작업 공간 진입을 /start 소개로 연결한다. 소개에서 로그인/가입으로 이어진다.
2. features/conversation-workspace/LiveConversation.tsx와 material-work/ConversationStart.tsx: 작업 선택 뒤 입력하며 데모도 같은 선택 표시를 공유한다. 데스크톱 자료 버튼은 기존 트리로 초점을 옮긴다.
3. material-work/useWorkspaceConversation.ts와 conversation-store.ts: 선택 작업을 페이지 왕복에도 보존하고 새 대화·인증 해제에서 초기화한다. 다른 작업으로 바꾸면 이전 찾기/정리 후속 질문이 새 요청을 가로채지 않는다.
4. features/ai-records/library와 editing/RecordEditor.tsx: 미연결 저장 위치는 직접 picker로 이어진다. 저장 파일 생성과 비암호화 안내는 남기고, 대화 저장은 별도로 켠다. 관리 정책은 접고 목록 복귀/초점 복귀와 입력창 아래 저장 조작을 분명히 한다.
5. local-folders/search/documents: 일반적인 날짜 기준, 명확한 범위 radio, 맨 아래 실행, 후보의 판정과 접힌 근거를 제공한다. 마지막 수정일은 실제 File.lastModified를 사용한다. 같은 날짜 표현을 초기 요청/후속 답변에서 공유하고 기간 안팎의 본문 날짜와 섞지 않는다. OS 생성일은 제공되지 않아 비활성 표시한다.
6. features/onboarding/WorkspaceTour.tsx: native modal dialog로 네 부분을 설명한다. 건너뛰기/이전/다음/완료, 설정의 다시 보기, 계정·작업 공간별 이 브라우저의 완료 표시를 지원한다. 파일 연결/AI 동의/저장을 자동 실행하지 않는다.
7. styles/globals.css와 공통 토큰: 개별 검은 outline만 지정하던 CSS를 제거하고 부드러운 공통 초점 표시와 forced-colors의 Highlight를 적용한다.
8. shared/auth-contract.ts와 auth 폼/서버/Better Auth: 새 비밀번호8~30자. 과거 비밀번호로 로그인/기존 계정 확인하는 입력은1~128자를 유지한다.

## 실행 증거

- 최종 pnpm check: Prisma 검증·타입·린트·155파일1415테스트·서버 경계26·web32/domain6/layout3·22경로 빌드 통과.
- tests/browser/check-chat-usability.mjs: 실제 컴포넌트+격리 OPFS20개 통과. 첫 안내/한 번 표시/다시 보기/작업 선택/초안과 모드의 왕복 보존/직접 picker/자동 저장 미활성/겹침과 복귀 초점/트리 초점/검색/390·1440·1920px/IME를 확인했다.
- tests/browser/check-ai-records.mjs:61개 통과. 저장 실패·dirty 이탈 보호·native reload와 Back 취소/재개·부분 삭제 재시도·현재 대화 보존·계정 격리·100/500턴·용량 경계·UI 정리 후 복구를 확인했다. 기존 검증기의 선택/관리 펼치기 동작을 새 UI에 맞췄다.
- S0 module graph:168모듈 통과.
- 별도 architect 검토: 작업 전환 후 이전 조건 처리와 수정일 파서 연결 누락을 지적받아 수정했다. 마지막 재검토 CLEAR.
- Ego 실제 로컬 production build: 기존 로그인 상태에서 첫 안내, 작업 선택 뒤 입력, 간소화 설정, 전체 설정의 다시 보기와 데모 선택 후 입력·390px 표시를 확인했다. DB 네트워크가 sandbox EACCES일 때의 로컬 실패는 정상 네트워크 권한으로 같은 서버를 재시작해 해소했다. 제품의 인증 우회는 추가하지 않았다.
- [비로그인11경로의 전후132표본과 전체 자산](performance.md).

재현 가능한 판정 목록: [브라우저 결과](browser-checks.json). 합성 브라우저 원자료와 화면은 .omx/verification/chat-usability-20261114/에 보관한다. 이전 실패 시도 파일과 최종 통과 파일은 구분하며 최종 판정은 records/records-checks.json 및 browser/checks.json이다.

## 범위와 남은 부분

메일은 운영14:14:17 발송403과 로컬resend.dev 테스트 발신을 확인했다. 테스트 수신 제한 가능성은 공식 정책과 일치하지만 운영 발신 값은 비밀 설정이라 확인하지 못했다. 도메인 설정과 재발송은 사용자가 제외했다. 재요청 실패 문구만 발송 문제임을 설명하며 내부 응답을 노출하지 않는다.

미리보기 독립 창/Back·Forward 구조, 실제 개인 원본 쓰기, 신규 OAuth/인증 메일/비밀번호 재설정 요청, 유료 AI 호출은 실행하지 않았다. 데모는 가상 자료 정리 체험이며 실제 계정의 모든 기록 기능과 동일한 범위로 표시하지 않는다. 기능 안내 완료는 서버 동기화가 아닌 이 브라우저의 표시다.
