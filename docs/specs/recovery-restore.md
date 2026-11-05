# 복구 사본의 새 파일 복원 — 2026-11-04

- RESTORE-001: 현재 보관함 목록의 한 항목에서 복원 위치 선택→사본/위치 검사→별도 최종 실행→결과로 이어진다. 기존 자료 루트 안의 기존 폴더만 고르며 새 폴더/이동/삭제/기존 파일 덮어쓰기는 범위 밖이다. 기존 이름과 충돌하면 확장자를 유지한 `이름 (복원 1).확장자` 등 빈 새 이름을 제안하고 최종 경로를 승인한다. 실행 중 충돌이 새로 생기면 이름을 몰래 바꾸지 않고 중단한다.
- RESTORE-002: 보관함 내부 prepared/item-verified/stopped의 owner/vault/operation/item/recovery ID와 완료 상태, 현재 payload identity/size/mtime/SHA-256를 검사한다. 원래 자료 폴더/옛 .moa-history가 없어도 검증된 보관본은 다른 위치로 복원할 수 있다. 손상/불완전 사본은 차단한다. 과거 상세의 정상 DTO는 실행 권한이 아니며 session이 보관한 현재 proof와 복원 검사/목적지 핸들을 한 번 소비한다.
- RESTORE-003: 권한 요청0의 사전 검사는 기존1000항목 목록·원래 이름의 이식 가능성·대소문자/NFC 이름 충돌·경로 탈출/예약 .moa- 경로·폴더 동일성을 확인한다. payload16MiB와 JSON 한도를 유지한다. 새 실행 제스처에서 자료/보관함 쓰기 권한을 요청하고 동일 Web Lock 안에서 사본·부모·이름을 다시 검사한 뒤에만 새 파일을 생성한다. 보관본 bytes는 고정하고64KiB씩 쓴다.
- RESTORE-004: 보관함/목적지 .moa-history의 새 UUID 작업 폴더에 recovery-restore v1 prepared→target-started→target-verified→stopped를 양쪽 저장·재읽기한다. 기록 확인 실패 시 대상 파일 생성0. 새 파일 생성 시도부터 실패/취소는 uncertain, 이전 실패는 not-run이다. close 후 identity/크기/hash 및 기록/보관본을 최종 감사해야 verified/completed다. 부분 파일·기록은 자동 삭제/재시도/rollback하지 않는다.
- RESTORE-005: 원본·기존 목적지·보관 bytes/기존 기록은 유지한다. 실행 중 위치 변경/재검사/새로고침·중복 실행을 막는다. Escape/닫기는 중단 요청 뒤 결과를 유지하고 owner/source/recovery 교체는 늦은 결과와 추가 기록을 차단한다. 복원 실패는 새 검사 없이는 재시도하지 않는다. 표시/상태/승인/파일 접근/기록 책임을 분리하고 기존 picker/dialog/버튼/Worker/불변 기록 검증을 재사용한다.
- RESTORE-006: 파일 이름 검사/빈 파일 확인/exclusive writable/Web Lock은 앱 내부 충돌 보호이며 외부 OS 작성자와 원자적인 create-if-absent/transaction이 아니다. 브라우저 API의 제한을 구별하고 실제 개인 파일로 시험하지 않는다. 합성 FS 실패 주입·실제 OPFS/Worker/키보드·4폭/IME 입력으로 검증한다. Windows 네이티브 권한창·외부 경쟁은 별도 미검증이다.

실패 선행 core: 원래 위치 없음, 이름/폴더/대소문자·NFC/빈 파일 충돌, 검사 뒤 생긴 충돌, 손상/교체/삭제/과대 payload·기록·부모 변경, 권한/한쪽 기록/write/close/readback/마지막 감사 실패, 취소/owner 변경, 위조/재사용 승인, 빈 파일/한글/16MiB 경계. 기존 overwrite의 journal 동작을 테스트로 유지한 채 공통 불변 기록 쓰기에 parser만 주입해 restore와 재사용한다.
