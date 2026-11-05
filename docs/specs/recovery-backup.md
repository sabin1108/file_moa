# 복구 백업 — 2026-11-04

목적지의 기존 파일을 전용 보관함에 실제 백업하고 크기/SHA-256/기록을 검증한다. 서비스/session 실행 API 이후 실제 충돌 검사·백업 실행·결과 UI를 연결했고, 후속 [덮어쓰기](recovery-overwrite.md)도 구현했다. 기존 copy v1의 충돌 차단을 유지하며 덮어쓰기는 독립 최종 승인과 내부 백업 snapshot을 요구한다.

- BACKUP-001: 자료 루트 내부의 서로 다른 출발/목적지 폴더에서 정확히 같은 이름의 기존 파일만 취급한다. path 탈출·중복·대소문자/유니코드 모호성·폴더 충돌·불완전 목록은 차단한다. 최대100파일, 각16MiB, 출발+기존 목적지 합계64MiB. 모든 metadata 한도를 검사한 뒤 본문을 읽는다.
- BACKUP-002: 읽기 검사는 source/target size/mtime/hash와 vault 식별을 반환한다. 매 await 전후 취소와 owner/source/recovery 연결 수명을 확인한다. 실행은 session이 보관한 동일 검사 결과와 새 사용자 제스처를 요구한다. 브라우저 해시는 기존 전용 Worker를 재사용한다.
- BACKUP-003: 실행 시작에서 자료/보관함 쓰기 권한을 명시적으로 요청하고, 잠금 안에서 재검사한다. 목적지는 `.moa-history/moa-backup-UUID/`, 보관함은 `moa-backup-UUID/` 아래에만 새 항목을 만든다. 백업 bytes를 고정하고 두 prepared.json을 쓰고 재읽기한 후 payload를 저장한다. 검증 정보는 owner/vaultId/operationId/itemId/recoveryId, 원래 상대 경로, 출발/목적지 size/mtime/hash, createdAt, 보존정책 미정(null 만료)다.
- BACKUP-004: 보관함 payload는 고유 recoveryId.bin이다. close→동일 핸들 재열기→size/hash 확인→현재 source/target identity/metadata/hash 재검사→양쪽 item-verified 기록 저장·재읽기를 마친 뒤에만 항목 verified로 게시한다. 목적지 파일 writable/삭제0. 실제 bytes와 JSON의 성공 문구는 구별한다.
- BACKUP-005: 첫 실패/취소 뒤 다음 항목을 시작하지 않는다. 시작 전은 not-run, 쓰기/검증/양쪽 기록 중 실패한 현재 항목은 uncertain, 이미 검증한 항목은 verified다. 가능한 경우 양쪽 stopped.json으로 상태와 실패 코드를 남기며 기록 실패는 journalComplete=false다. source/recovery/owner 교체 뒤에는 추가 기록·늦은 성공 게시를 하지 않는다. 취소 뒤 실패 기록은 원본과 보관함의 연결 수명이 유효한 동안만 허용한다.
- BACKUP-006: owner/vault JSON·경로·해시·이벤트를 strict Zod 스키마로 검증하고 제한된 크기로 재읽는다. 각 파일을 불변 신규 이름으로만 추가하며 기존 파일/임의 파일을 덮어쓰거나 삭제하지 않는다. 원자적 두 저장소 transaction·외부 프로세스 잠금·rollback을 약속하지 않는다. 생성/쓰기 실패 시 부분 폴더·파일은 남긴다. 보존 기간/자동 삭제 정책을 임의로 정하지 않는다.
- BACKUP-007: 완료시 prepared/verified/stopped 양쪽 기록을 다시 읽어 모순·교체가 없는지 확인한다. 기록된 성공은 당시 관측이며 향후 덮어쓰기 실행 권한이 아니다. 이후 덮어쓰기는 백업과 현재 목적지를 다시 검증해야 한다.

- BACKUP-008: 복사 계획의 정확한 이름 충돌 파일만 별도 검사한다. 혼합 선택에서는 충돌 없는 파일을 백업에서 제외하고, 다른 위험 신호가 있으면 전체 진입을 막는다. 보관함 연결 필요를 안내한다. 새 파일/기존 목적지 경로·크기·내용 동일 여부를 비교하고, 별도 `기존 파일의 복구 사본 만들기` 제스처에서만 쓴다. 검사는 기존360ms 최소 피드백을 재사용하며 취소는 즉시다. 실행 중 계획/목적지 변경을 막고 Escape/닫기는 중단 요청 후 정산 결과를 유지한다. source/owner 해제는 이전 보고를 폐기한다. 결과는 파일별 verified/uncertain/not-run을 표시하며 재실행에는 새 검사가 필요하다.

실패 core: 정상/빈 파일·한글 경로, stale snapshot, source/target/vault/부모 교체, write/close/readback/hash/한쪽 기록 실패, 권한 거부, 취소·owner 전환,2번째 실패 후3번째 미실행, 한도/모호 충돌 거부, 미지원 필드/타 owner/상태 모순. 합성 FS 단위와 실제 OPFS/Worker·production UI 검증을 구별한다.
