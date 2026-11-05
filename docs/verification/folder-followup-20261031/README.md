# 어제 추가 요청 재개 — 연결 위치·확장자 우선

2026-10-31. 전날 세션 마지막 사용자 요청과 [추가 요청 인수인계](../../handoff/2026-10-30-additional-folder-requests.md)를 대조해 재개했다. 최신 소스에 두 수정이 반영되지 않았고 마지막 세션이 사용량 한도로 종료된 것을 확인했다. 과거 검증 수치를 재사용하지 않고 아래 검사를 새로 실행했다.

## 결과와 읽을 순서

1. [명세](../../specs/folder-workspace-revision.md)의 CONNECT-UX-001/NEW-005/006: 연결 버튼 위치와 확장자 우선 수용 기준.
2. `apps/web/src/features/local-folders/lib/new-entry.ts`: `resolveNewEntry`가 이름과 종류를 함께 결정한다. 끝의 `.txt`/`.md`가 선택 종류보다 우선하고 대소문자를 보존한다. 없는 확장자는 기존 선택 종류대로 보완하며 이름 검증을 재사용한다.
3. 같은 feature의 `components/listing/NewEntryForm.tsx` → `store/entry-creation-controller.ts` → `services/create-entry.ts`: 최종 미리보기, 완료 문구, 파일/폴더 API 선택, journal의 kind를 일치시킨다. service 직접 호출에도 같은 규칙을 적용한다. 기존 파일의 writable stream을 열지 않는 보호와 충돌/권한/기록 오류 처리를 유지한다.
4. `components/listing/SourceFolderBrowser.tsx` → `FolderWorkspaceFrame.tsx` → `folder-workspace.module.css`/`source-folder-browser.module.css`: 기존 연결 팝업을 현재 목록 새로고침 옆으로 전달하고 전역 controls 슬롯을 제거했다. 권한 안내와 상위 이동 조작이 길면 줄바꿈해 제목을 덮지 않는다.
5. `apps/web/tests/local-folders/services/create-empty-file.test.ts`, `tests/browser/check-folder-workspace.mjs`: 실제 결과·기록·부작용·화면 조작 검증. 의존성/lockfile 변경 없음.

`폴더 + aaa.txt → 빈 TXT aaa.txt`, `텍스트 + 기록.MD → 빈 MD 기록.MD`. 입력한 확장자가 없으면 기존 폴더/TXT/MD 선택을 따른다. 사용자가 보고한 확장자 제거 후 `aaa` 폴더 생성은 재현하지 못했다. 확인한 결함은 선택 종류대로 폴더 생성 분기를 타고 종류 충돌 시 `.md.txt`처럼 이중 확장자를 붙이던 동작이다.

## 새로 실행한 검증

- **실패 먼저:** 13:10 KST, 기존 구현에서 생성 테스트 21개 중 5실패/16통과. 폴더 선택의 TXT/MD, 상충하는 선택 종류, NFC/확장자 사례였다. 수정 후 관련 3파일 47개 통과. 이후 서비스 직접 호출 회귀를 추가했다.
- **최종 `pnpm check` exit 0:** 13:17 KST, 24파일 **247테스트**, 타입 검사, ESLint, 서버 경계21, 구조 web25/domain6/layout3 및 실제 domain import, production43페이지 모두 통과.
- **최종 Chromium 57개 확인 통과:** [원자료](final/browser/result.json). 연결 버튼의 목록 내부 위치/44px, 연결 전 접근, Escape 초점 복귀, 목적지 폼과 주 목록의 TXT/MD 생성, 실제 OPFS 빈 파일과 pending/ready JSON kind, 충돌·쓰기 거부, 선택/미리보기, 새로고침 위치, Tab/Enter/IME, sentinel 보존, 하위 폴더 권한 오류 시 제목 겹침 방지. 57은 독립 단위 테스트 수가 아닌 브라우저 확인 항목 수다.
- **화면:** 390/768/1440/1920 캡처. [명시적 TXT 입력](final/browser/explicit-extension-390.png), [하위 폴더 권한 오류 390](final/browser/permission-390.png), [1440](final/browser/permission-1440.png). 네 폭의 목록/미리보기와 변경 폼·오류 화면을 직접 확인했다.
- **taste:** 승인된 ZIP 시안과 기존 achromatic-ledger(seed 2044201404)의 적용 기준·시스템 서체를 유지했다. 새 방향 추첨/폰트/테마 교체 없음. 변경 표시 소스5파일 lint 0 FAIL/0 WARN. [최종 inspect](final/inspect/report.json) 0 FAIL/3 WARN. 미연결 상태에서 목록과 빈 미리보기 면이 유지되어 blank-gap/hero-void/unused-canvas가 남는다. 실제 파일을 선택하면 해당 면을 쓰므로 이번 버튼 위치 수정에서 합성 데이터나 장식으로 채우지 않았다. 화면 전체 디자인 경고가 사라졌다고 보고하지 않는다.
- **성능:** [전후 기록](performance.md), 전/후 각각 36표본, console 오류0. 정적 배포 자산 +432bytes. `/files` LCP 중앙값은 데스크톱64→148ms, 좁은 폭60→128ms로 증가했다. 병렬 브라우저 부하·적은 표본·측정 변동이 있어 무회귀/최적화 성공을 단정하지 않는다.

## 발견·수정과 검증 한계

처음 55개 확인은 가로 넘침만 검사해 제목을 가리는 문제를 놓쳤다. [수정 전 캡처](child-permission-attempt/permission-390.png)를 직접 보고 flex 줄바꿈을 고쳤다. 추가 검사의 고정 제목 폭80px 가정은 실제 짧은 제목에 맞지 않아 실패했다. [시도 기록](final/browser/harness-title-width-attempt.json)을 보존하고 실제 한 줄 높이와 조작 겹침으로 판정한 최종57개 결과를 사용한다. 검사기를 약화해 겹침을 허용한 것이 아니다. inspect 첫 실행은 PowerShell의 쉼표 인자 전달 오류였고 따옴표로 수정했다. Chromium은 샌드박스 Page.enable timeout 후 샌드박스 밖에서 실행했다.

OPFS·JSON은 실제 브라우저 저장소이며 picker/권한 응답은 fixture, 키보드·한글 조합은 CDP다. OS 권한창, 개인 디스크, 물리 키보드/OS IME, 모바일 실기기, 외부 프로그램의 원자적 배제는 검증하지 않았다. 개인 자료를 테스트에 사용하지 않았다.

## 삭제와 다음 범위

[삭제 계약 초안](../../specs/entry-deletion.md)은 대상·권한·기록·부분 실패·재접속·복구 및 구현 전 실패 테스트를 정리한 문서다. 실제 삭제는 미구현이며 휴지통/영구 삭제 방식이 미정이다. 기록 조회/미확인 결과 확인 후 해당 결정을 거쳐 구현한다. 실제 복사·이동·본문 저장도 이번 완료 범위가 아니다.

직접 확인: http://127.0.0.1:3010/files → 연결 → 목록의 새로고침 옆 설정 → 새로 만들기에서 폴더 선택 + `aaa.txt` → 빈 파일 미리보기 → 만들기. 원본 개인 자료 대신 검증용 폴더 사용을 권한다. [다음 세션 인수인계](../../handoff/2026-10-31-folder-followup.md).
