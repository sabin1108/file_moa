# 새 파일 복원·보관함 위치/삭제 감지 — 2026-11-04

보관함 상세의 `복원 위치 선택` → 기존 폴더 탐색 → 읽기 전용 검사/새 이름 제안 → `이 위치에 복원` → 실제 쓰기/재읽기 검증을 구현했다. 기존 자료와 보관본은 유지한다. 요구사항49~51과 [복원 계약](../../specs/recovery-restore.md), [위치·현재 연결 계약](../../specs/recovery-vault-placement.md)을 따른다.

## 수정한 오류와 위치 정책

저장된 폴더 핸들/connected 값만 유지하던 화면에 현재 식별/위치 확인을 추가했다. 설정 열기·창 복귀·보이는 탭의5초 간격·수동 상태 확인에서 읽기로 검사한다. 외부 삭제/식별 손상/권한 상실 시 연결과 과거 실행 승인을 폐기하고 저장된 이름은 `저장된 연결`로 표시한다. 자동 권한 요청/재생성은 없다. OS 실시간 감시가 아니라 다음 검사 시점에 반영한다.

`note/보관함`처럼 자료 루트 바로 아래를 허용했다. 자료 루트 자체·상위·깊은 하위는 연결 대상으로 거부하며 외부 별도 보관함도 유지한다. 일반 목록/검색과 직접 경로의 미리보기·생성·복사·백업·복원 대상은 공통 `source-directory` 경계에서 관리 폴더 접근을 막는다. `.moa-vault.json`은 예약 표식이며 손상된 표식도 관리 영역으로 취급한다. 표식 본문을 읽지 않고 metadata만 확인한다. 유효한 보관함인지 여부는 별도 전용 연결 검사가 결정한다.

## 구현 읽는 순서

1. `RecoveryArchiveDialog/View` → `RecoveryRestoreView`: 기존 dialog/목적지 picker/StatusNotice/버튼 재사용, 기존 폴더만 선택, 최종 취소 버튼 초점, 결과 유지.
2. `RecoveryRestoreController` → session의 prepare/execute: 취소 수명, private 승인/한 번 소비, 사용자 제스처, owner/source/vault 세대 검사.
3. `recovery-restore-input.ts` → `recovery-restore.ts`: 보관함 완료 기록/사본·부모 동일성·충돌 검사, 고정 bytes,64KiB 쓰기, close 후 hash 및 기록 감사.
4. `recovery-operation-journal.ts`: 기존 overwrite 불변 양쪽 기록 검증을 parser 주입으로 재사용. overwrite adapter는 기존 계약을 유지한다. Zod는 복원 외부 JSON/경로 경계의 런타임 검증과 타입 추론을 함께 제공하며 권한/크기/hash 검사를 대체하지 않는다.

새 의존성은 없다. marker 조회를 추가하면서 기존 읽기 테스트의 최소 fake에 예약 표식 부재를 명시했다. 제품 코드에 테스트 예외를 넣지 않았다.

## 실행한 검증

`pnpm check`: **514테스트/51파일**, 타입·린트·서버/구조 경계·43페이지 build 통과. 직전481에서33개를 추가했다. 복원 pure8/service16/controller3/session2, 위치1/presence2/보호1이다. 파일/폴더·대소문자/NFC 충돌, 빈 파일, 원래 위치 상실, payload/기록/핸들/부모 변경, 권한·기록·write/close/readback 실패, 취소/owner 변경, 승인 변조/재사용을 확인했다. 공유 journal 변경 뒤 기존 overwrite 검사도 통과했다.

최종 production `http://127.0.0.1:3026` 실제 Chromium/OPFS/Worker 브라우저 **204검사**:

| 묶음 | 검사 수 | 근거 |
| --- | ---: | --- |
| 새 복원/직접 하위 보관함/외부 삭제 |43|[결과](browser/checks.json)|
| 보관함 목록·상세/권한 안내 |37|[결과](regression/archive/checks.json)|
| 보관함 연결/생성 실패 |23|[결과](regression/connection/checks.json)|
| 실제 덮어쓰기 |38|[결과](regression/overwrite/checks.json)|
| 실제 복사 |26|[결과](regression/copy/checks.json)|
| 계획/반복 확인 |37|[결과](regression/plan/checks.json)|

복원 브라우저는 실제16MiB를256×64KiB로 쓴 뒤 bytes/양쪽 prepared/started/verified/stopped를 읽었다. 검사 뒤 생긴 빈 파일은 쓰기0·미실행, 원래 폴더가 없어도 다른 위치 검사 가능, 쓰기 중 Escape는 창/중단 결과를 유지하며 부분 파일은 확인 필요였다. 직접 하위 보관함 백업/복원과 실제 OPFS 디렉터리 삭제 뒤 연결 해제·재생성0·권한 요청0도 확인했다. 390/768/1440/1920px 화면 넘침0, 취소 초점, Escape, CDP 조합 입력/Enter 억제를 검사했다. [화면](browser/restore-review-390.png), [완료](browser/restore-completed.png), [삭제 후 안내](browser/deleted-vault.png).

## 한계

개인 note/보관함은 시험·삭제하지 않았다. 합성 권한/fixture와 CDP 입력을 사용했으므로 Windows 실제 디스크/네이티브 권한창·물리 IME·외부 프로그램의 동시 생성은 미검증이다. 브라우저 API에는 외부 OS와 원자적인 create-if-absent가 없어 앱 잠금/재검사/exclusive writable을 절대적인 외부 경쟁 방지로 보고하지 않는다. 부분 파일/기록 자동 삭제·rollback·자동 재시도는 없다. 실제 이동/폴더 재귀/삭제/보관 기간/로그인·AI/API/본문 저장은 후속이다. 성능 원자료와 조건은 [별도 문서](performance.md)에 기록한다.
