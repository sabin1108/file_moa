# 자료 루트의 보관함과 현재 연결 확인 — 2026-11-04

- PLACE-001: 최신 사용자 요구로 `note/보관함` 같은 자료 루트 바로 아래 보관함을 허용한다. 자료 루트 자체/자료의 상위/자료 내부 두 단계 이상은 계속 거부하고 외부 별도 보관함도 허용한다. 생성 부모는 자료 루트 또는 자료 밖이다. 기존 분리 전용 위치 명세/오류 문구보다 이 정정을 우선한다.
- PLACE-002: `.moa-vault.json` 예약 표식이 있는 폴더는 손상 표식도 포함해 관리 영역으로 취급한다. source listing/search/destination 선택에서 제외하고 직접 경로의 preview/copy/backup/create/restore destination 접근도 공통 source directory 경계에서 차단한다. 표식 확인은 metadata lookup만 하며 body/permission request/write0이다. 보관함 자체의 전용 reader/journal은 일반 source 경계를 사용하지 않는다.
- LIVE-001: 저장된 핸들과 connected boolean은 현재 디스크 존재의 증거가 아니다. 명시적 연결 뒤 읽기 전용 식별/위치 검사를 설정 열기·창 focus/visibility 복귀·보이는 탭의5초 간격·‘보관함 상태 확인’에서 실행한다. 권한 요청/자동 재생성/자동 재연결0. 작업 중 설정과 생성 위치 선택은 자동 검사로 방해하지 않는다.
- LIVE-002: missing/invalid/권한 상실이면 연결을 비활성화하고 backup/archive/restore 승인을 폐기한다. 저장된 이름은 과거 연결임을 표시하고 재선택/새 생성 행동을 제공한다. owner/source/vault 세대가 바뀐 뒤 늦은 probe 결과는 새 연결에 적용하지 않는다. 폴더 부재와 권한 상실을 구분한다. 외부 삭제 감지는 focus 또는 다음 읽기 검사 시점이며 OS 실시간 감시를 보장하지 않는다.

검증: direct-child 생성·연결·백업/복원, 깊은 위치 거부, 일반 자료 경로의 우회 차단, OPFS 실제 디렉터리 삭제 뒤 focus/수동 상태 확인과 생성0·추가 권한0. Windows 디스크/권한창·외부 경쟁은 별도 미검증이다.
