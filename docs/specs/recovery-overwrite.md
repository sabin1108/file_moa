# 검증된 복구 사본 후 덮어쓰기 — 2026-11-04

- REPLACE-001: 기존 충돌 백업의 성공 뒤 별도 최종 경고→사용자 실행 제스처를 요구한다. 대상 경로/파일/용량과 보관함을 표시한다. 기본 초점은 중단. 보관 기간 미정·자동 삭제 없음. 혼합 선택은 정확한 충돌만 처리하고 나머지는 실행하지 않음을 표시한다. 원본/폴더/이동/복원/삭제는 범위 밖이다.
- REPLACE-002: session 내부의 완료된 백업/동일 계획/검사 snapshot만 한 번 소비한다. 호출자 성공 DTO·과거 기록만으로 실행하지 않는다. owner/source/recovery 세대 변경·재검사·재연결·사용자 활성 없음은 거부한다. 실행 중 계획 변경/중복 실행을 막고 Escape는 중단 정산 결과를 유지한다.
- REPLACE-003: 동일 Web Lock 안에서 자료·보관함 쓰기 권한, 현재 source/target/vault, 양쪽 prepared/verified/stopped와 실제 보관본 크기/SHA-256를 재검증한다. 백업 불완전/변경/권한/기록 실패·취소이면 target writable0. 기존 한도100파일/16MiB/출발+목적지64MiB와 Worker 해시를 유지한다.
- REPLACE-004: source bytes를 고정하고 항목별 시작 직전 및 close 전 source/target identity/metadata/hash, 보관본/기록을 다시 확인한다. 정확한 기존 파일만 create:false/exclusive 스트림으로64KiB씩 쓰고 close 후 동일 위치의 identity/size/hash를 검증한다. 원본 쓰기/삭제/자동 재시도/자동 rollback0. 새 파일 생성으로 충돌 차단을 우회하지 않는다.
- REPLACE-005: 별도 recovery-overwrite v1 기록을 새 UUID 작업 폴더로 보관함과 목적지 .moa-history에 남긴다. prepared→target-started→target-verified→stopped를 양쪽 쓰기/재읽기로 확인한다. 시작한 항목 실패/취소는 uncertain, 이전 검증 완료 verified, 후속 not-run. 첫 실패 후 중단하며 기록 불완전은 성공으로 표시하지 않는다. owner/source/recovery 무효화 뒤 추가 기록/늦은 결과 게시0.
- REPLACE-006: 외부 OS 경쟁·두 폴더 원자성·원복을 보장하지 않는다. exclusive 스트림과 앱 Web Lock은 외부 작성자의 compare-and-swap이 아니다. 개인 파일 시험 대신 합성 실패 주입 및 실제 Chromium OPFS/Worker로 성공/거부/변경/부분 실패/취소를 검증하고 네이티브 미검증을 구별한다.

실패 선행 core: 백업 payload/양쪽 기록 손상, 현재 대상/원본/부모/보관함 변경, 권한 거부, 시작 기록 실패, write/close/readback 오류, 마지막 감사 불일치, 취소/owner 변경, 두 번째 실패 뒤 세 번째 미실행, 빈 파일·한글 경로, 한도·위조/재사용 승인 거부.
