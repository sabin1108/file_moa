# 현재 위치에서 폴더·TXT·MD 생성

2026-10-30. 사용자의 후속 정정과 Windows식 새로 만들기 요청을 반영했다. 이전 folder-workspace 검증의 별도 기록 폴더 선택 계약을 대체한다.

## 결과와 읽을 순서

`새로 만들기` → 폴더/텍스트(.txt)/마크다운(.md) → 이름 입력 → 만들기. 현재 탐색 위치에 생성한다. 확장자가 없으면 선택 종류에 맞게 붙이고 이미 있으면 중복하지 않는다. 파일은 0바이트이며 본문 편집 기능은 포함하지 않는다. 목록과 목적지 탐색이 같은 폼·상태·서비스를 재사용한다.

별도 기록 폴더 선택 창은 열지 않는다. 작업 시 현재 부모의 `.moa-history`에 pending/ready 또는 failed/uncertain JSON을 보관한다. 쓰기 권한 확인, 이름 충돌, 연결 변경, 부모/결과 핸들 확인과 기록 실패 처리는 유지했다. `.moa-history`라는 파일이 있으면 덮어쓰지 않고 거부한다. 기존에 별도로 지정했던 기록 폴더는 수정하지 않는다.

[명세](../../specs/folder-workspace-revision.md) → [코드 지도](../../code-map.md) → `lib/new-entry`(이름·확장자) → `NewEntryForm`(입력) → `EntryCreationController`(상태) → session(연결 수명) → `create-entry`(파일 접근) → `folder-creation-journal`(현재 위치의 기록). 기존 폴더 생성 모듈을 확장·이름 변경했고 파일 전용 중복 서비스나 의존성은 추가하지 않았다.

## 실행한 검증

- `pnpm check` exit 0: 24파일/240테스트, 타입, ESLint, 서버 경계 21개, 구조 25+6+3개와 domain import, production 43페이지. [로그](pnpm-check.log)의 첫 NativeCommandError 표기는 PowerShell의 stderr 리다이렉션 포장이며 실제 명령 종료 코드는 0이다.
- 새 파일 테스트 15개: 자동/이미 있는 대소문자 확장자, 예약 이름·경로·최종 길이, TXT/MD 빈 파일, 기존 이름 충돌, 외부에서 생긴 비어 있지 않은 파일을 절삭하지 않고 미확인으로 남김. 기존 폴더/기록/상태 테스트에 현재 하위 폴더, 기록 폴더 파일 충돌, 자료 연결 교체 검증을 보강했다.
- [브라우저 결과](browser/result.json) 34개 통과. 실제 Chromium OPFS 핸들·빈 파일·JSON을 사용했다. 루트/하위 폴더, 자동 기록 위치, OS picker 추가 호출 없음, 권한 거부, 중복 이름, 목적지 선택, TXT 미리보기, 체크 선택·취소, 갱신 행 위치, Tab/Enter, IME 조합 중 제출 방지를 확인했다.
- 390/768/1440/1920 폭에서 미리보기와 구조/넘침 확인. 새 생성 폼의 [390px](browser/new-file-390.png)·[1440px](browser/new-file-1440.png) 및 생성 폴더 화면은 별도 캡처했다. 생성 폼 두 폭을 직접 시각 확인했다.
- [성능](performance.md): 6경로 × 2폭 × 3회 = 36표본, console error 없음. 정적 자산 836,349 → 837,201 bytes (+852). 초기 화면과 연결 후 파일 작업 성능을 구분했다.

검사 도구의 scrollIntoView 때문에 새로고침 기준 좌표가 바뀌던 문제는 클릭 직전 같은 스크롤 위치에서 측정하도록 수정했다. CDP Enter 검사에는 실제 문자 이벤트를 포함했다. 이전 키보드 검사 실패는 [시도 기록](keyboard-input-attempt.json)에 남겼고 최종 결과와 구분한다.

## 검증 한계

폴더 picker와 권한 응답은 fixture이므로 native OS 권한창, 사용자 개인 디스크, 물리 키보드·OS IME·모바일 실기기를 검증했다고 주장하지 않는다. CDP 키보드/IME 자동화 결과다. File System Access API는 외부 프로그램과의 원자적 create-only를 제공하지 않아 빈 항목의 생성 주체까지 보장하지 않는다. 파일 내용에 writable stream을 열지 않으며 외부 파일을 절삭하지 않는다. 기록 전용 임의 UUID 파일에는 JSON을 쓴다. 실패 후 자동 재생성·삭제·롤백은 하지 않는다. 기존 파일 이동·복사 실행, 본문 저장, 작업 기록 UI/재시작 복구는 미구현이다.
