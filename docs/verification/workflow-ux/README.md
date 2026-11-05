# 편집·공통 목적지·단계·F5 복원 검증

2026-11-04 사용자 요구62~67. 기존 기능1~6 뒤의 UX 정정이다. [명세](../../specs/workflow-ux.md), [사용자 코드 설명서](../../코드_이해하기.md), [성능](performance.md).

## 변경과 실제 확인

- 복원 위치는 연결 루트에서 시작하며 경로 입력에 루트 이름을 표시한다. 원래 부모 삭제 후에도 다른 위치 복원이 가능하다.
- 문서 편집은 기존 미리보기 면에서 전환한다. 첫 직접 저장의 원본 사본1개를 반복 수동/주기 저장이 재사용한다. 설정은 기본30초·끄기/15/30/60/120초다. 타이머는 권한을 요청하지 않는다.
- 폴더 copy/move와 복원도 기존 DestinationFolderPicker/NewEntryForm을 사용한다. 실제 생성 후 같은 picker 갱신·선택·실행을 확인했다.
- 공통 Stepper가 보존·덮어쓰기 단계를 계속 표시한다. URL은 표시 단계만 소유하고 원본 파일명/본문 없이 로컬 초안 ID를 연결한다.
- F5는 이미 허용된 연결·선택·목적지·편집·검토·완료 결과를 복원한다. 실제 쓰기 승인을 재생하거나 중단 작업을 자동 재실행하지 않는다. 파일 버전/보존본이 달라졌으면 초안을 유지하고 저장을 중지한다.
- AGENTS/guidelines에 기능뿐 아니라 폼·화면·상호작용의 재사용을 명시했다. 아토믹 전면 전환·새 의존성은 없다.

## 실행 결과

`pnpm check` exit0: **566테스트/56파일**, 타입 검사, lint, server 경계21, feature/domain/layout 경계34, production43페이지 build 통과. [전체 로그](check.log). PowerShell이 네이티브 stderr 안내를 NativeCommandError 형식으로 붙였지만 실제 명령 종료값은0이며 아래 각 단계 완료를 읽어 확인했다.

최종 production `http://127.0.0.1:3034`의 실제 Chromium OPFS·Worker·IndexedDB 검사 **188개**:

| 스크립트 | 검사 | 근거 |
| --- | ---: | --- |
| check-workflow-ux.mjs | 29 | [결과](browser/checks.json) |
| check-managed-files-ui.mjs | 20 | [결과](managed-final/checks.json) |
| check-restore-current-ui.mjs | 45 | [결과](current-final/checks.json) |
| check-recovery-connection.mjs | 21 | [결과](connection-final/checks.json) |
| check-recovery-overwrite-ui.mjs | 38 | [결과](overwrite-final/checks.json) |
| check-restore-resume.mjs | 35 | [결과](restore-resume-final/checks.json) |

F5 편집 초안과 기존 backup checkpoint·수동 후속 저장, 타이머 권한 요청0, 백업 사본1개, 외부 편집 충돌, 실제 설정 변경/새로고침, 폴더 목적지 생성과 검토·완료 F5, 충돌 검사 F5와 단계 변화, 복원 검토·결과 F5 및 실행 query로 재실행 불가를 확인했다. 16MiB 폴더 copy/move·64KiB 분할·비재귀 원본 처리·중단 정산·늦은 충돌·보관본 유지도 회귀 검사했다.

단위 반례는 저장 중 추가 입력을 dirty로 유지, 조합 중/첫 보존 전 자동저장 차단, dirty 버림 확인, 반복 저장/기존 checkpoint/외부 변경/보존본 손상·권한 상실, 복원 결과/중단 단계를 승인 없이 복원하는 조건을 확인한다.

390/768/1440/1920px의 편집·작업/복원 검토, 390/1440px 설정과 권한 안내를 검사했다. [데스크톱 편집](browser/inline-editor-1440.png), [모바일 편집](browser/inline-editor-390.png), [단계 표시](browser/shared-picker.png), [설정](browser/editor-settings-1440.png)을 직접 확인했다. 콘솔 예외0. 전체 웹 TS의 명시적 any와 소스 식별은 [정적 확인](static-review.json).

## 발견한 오류와 수정

1. 복원 기본값이 원래 부모였고 입력은 빈 상대경로였다. 루트 기본 선택과 루트 이름 표시로 정정했다.
2. 별도 편집 dialog와 매 저장마다 보존/검토가 반복됐다. 미리보기 전환·편집 세션별 최초 사본·공유 검증 writer를 사용한다.
3. 폴더 작업에서 공유 picker의 생성 기능을 껐었다. 기존 생성 폼을 다시 제공한다.
4. F5 후 연결 참조만 남고 진행이 소실됐다. 현재 허용된 연결 재개와 owner/root에 묶인 로컬 초안을 연결했다.
5. 충돌 복사 F5 복원 중 최초 루트 목록 읽기 전에 선택을 복원해 plan.open이 거부됐다. 목록의 준비/경로 확인 후 선택하고, 복원 후 주소를 현재 재검사 단계와 동기화했다. 실패한 개발 실행은 최종 결과로 세지 않는다.

## 재현

```powershell
pnpm check
pnpm --filter @personal-ai/web start --port 3034
pnpm exec node tests/browser/check-workflow-ux.mjs http://127.0.0.1:3034 docs/verification/workflow-ux/new-run
pnpm exec node tests/browser/check-restore-resume.mjs http://127.0.0.1:3034 docs/verification/workflow-ux/new-restore-run
```

나머지 스크립트도 같은 base/out 인수를 사용한다. 테스트는 별도 Chromium profile의 합성 OPFS 자료에만 접근한다. 사용자 note 자료는 사용하지 않았다.

## 한계

Windows의 실제 폴더 선택/권한창, 실제 외부 디스크·물리 키보드 IME·외부 프로그램의 원자적 동시 수정은 미검증이다. 브라우저 저장소 삭제/권한 철회·다른 기기에는 같은 초안/핸들이 없을 수 있다. URL 공유는 파일 권한이나 본문 공유가 아니다. 로컬 completed 결과는 과거 작업 표시이며 현재 존재 검사가 아니다.

F5는 보존·덮어쓰기의 one-shot 쓰기 승인을 되살리지 않는다. 이 단계는 현재 자료 재검사로 돌아가며 이전 사본과 기록은 남는다. 반복 편집은 최초 원본만 보존하며 모든 자동저장의 별도 버전 복구 기능은 아니다. 브라우저 강제 종료 순간의 마지막 입력 영구 보장은 없다. 순수 로딩 성능과 실제 디스크 작업 성능을 구분한다.
