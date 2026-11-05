# 브라우저 복사 실행 — 2026-11-01 최신 요구

사용자는 실제 복사와 진행/결과·기록·재접속 확인 구현을 요청했다. 추가 설명: 최종 사용자에게 별도 프로그램 설치를 요구하지 않고, AI에게 맡긴 폴더의 원본 보호가 핵심이다. 이 구현은 이전의 외부 OS 경쟁까지 포함한 원자적 no-clobber 전제를 브라우저에서 보장한다고 주장하지 않는다. AI 호출은 없고 검토 계획 뒤 사용자가 직접 누른 실행만 처리한다.

- APPLY-001: copy만, 읽기 검사를 완료한 동일 계획만 실행. 실행 동작에서 쓰기 권한 요청을 시작한다. 원본 쓰기/삭제·자동 실행·자동 재시도·네트워크 전송 없음.
- APPLY-002: 권한 뒤 같은 계획을 다시 검사하고 승인 metadata/hash와 비교한다. 원본 File bytes를 private immutable File로 캡처해 그 bytes의 hash도 확인한다. writer가 source를 다시 열어 다른 내용을 쓰지 않는다. 전체100개/파일16MiB/합64MiB 상한, 순차 처리.
- APPLY-003: 목적지와 원본 부모 identity를 재확인한다. 대상마다 전체 직계 이름을 다시 검사해 NFC/대소문자 충돌을 중단한다. create 직후0바이트 확인, exclusive writable 뒤 다시0바이트·동일 entry 확인, 쓰기/close 뒤 실제hash 확인. 알려진 기존 파일은 writable을 열지 않는다. Web Lock은 앱 참여 작업만 직렬화한다. 외부 프로그램의 조회→생성 사이 경쟁을 원자적으로 차단하는 API는 없으며 사용자 폴더를 OS 잠금한 것으로 표현하지 않는다.
- APPLY-004: 목적지 .moa-history에 copy 전용 version1 이벤트를 append하고 재읽기 검증한다. prepared/started는 대상 쓰기 전에, verified는 close/내용검증 뒤에 기록한다. 기록 이름 충돌은 중단, 기존 기록 수정/삭제 없음. 앞선 계획의 이벤트 전이·capacity 예산을 따른다.
- APPLY-005: 실패/취소 시 후속 파일 시작0. started 이후 확정 못한 항목은 uncertain, 후속은 not-run. abort가 성공해도 흔적 삭제/rollback 없음. 결과 정산 중 팝업을 유지하고 취소를 알린다. 연결/owner 교체 뒤 새 UI에 늦은 결과0; 남은 started는 재접속 뒤 미확인.
- APPLY-005 표시 보완(2026-11-02): 실행 전에는 미적용 계획임을 표시한다. 실행을 시작한 뒤에는 같은 계획을 `검토한 계획`으로 표시하고 파일별 복사 결과를 안내한다. 완료·실패·취소 결과 옆에 ‘아직 적용하지 않았습니다’라고 단정하지 않는다.
- APPLY-006: 복사 기록은 같은 작업 기록 화면에서 생성 기록과 별도 섹션으로 읽는다. 누락/손상/불법 전이/일부 읽기는 미확인. 앱 재연결 후에도 자동 쓰기 없이 저장된 기록을 읽는다. 현재 파일 상태와 과거 기록을 구분한다.
- APPLY-007: `현재 복사본 내용 대조`에서 기록을 다시 읽고 owner/부모/그룹 동일성을 확인한 뒤 대상만 읽는다. 크기 일치 파일만 Worker SHA-256을 계산하며 재열기/identity/metadata/두번째 hash로 변경을 감지한다. 없음/폴더도 두 번 조회한다. 끝에서 부모와 기록을 다시 확인한다. 현재 관측은 기록상 성공/실패를 수정하지 않으며 취소·닫기·다른 작업 선택은 늦은 결과를 폐기한다.

최종 기록 형식은 operation/canonical UUID/revision/previousEventId/owner/sourceParent/destinationParent/createdAt/type/payload다. prepared의 itemId와 metadata/hash/경로 전체를 검증하고 이벤트 전이로 정합성을 확인한다. 앞선 계획의 별도 manifestFingerprint 필드는 구현하지 않았다. fingerprint를 실행 권한으로 사용할 필요가 없으며 실제 실행 snapshot은 session private 메모리에 보관하고 전체 값을 다시 비교한다. 기록 데이터는 신뢰된 인증/생성 주체의 증명이 아니다.

책임: lib/copy-journal은 파싱/상태 집계, services/copy-journal-storage는 append·읽기, services/copy-execution은 실제 순차 작업, copy-history-inspection은 읽기 대조, 각 controller는 취소/세대, 표시 컴포넌트는 입력·결과만 담당한다. 재사용한 Web Lock은 기존 생성 작업과 같은 앱 참여 범위를 직렬화한다. source 루트 쓰기 권한 상속이 가능하지만 앱은 source의 파일 내용/이름/위치를 변경하지 않는다.

SDD/TDD: 계약/fixture 실패→순수 기록 parser/집계→브라우저 서비스·controller→UI→단위/타입/lint/경계/build/실제 OPFS 브라우저. 개인 폴더를 검증에 사용하지 않는다. 계획 문서의12개 시나리오와 실제 실행 테스트 수를 구분한다. 기존 생성 기록은 변경하지 않는다.
