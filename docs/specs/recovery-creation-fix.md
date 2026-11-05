# 복구 보관함 생성 오류와 기록 체계 — 2026-11-04

사용자 보고: note 내부는 현재 위치 규칙에 걸렸고, 외부 위치도 일반 오류가 표시됐다. 앱 생성 폴더는 없었으며 사용자가 선택 창에서 새 폴더를 직접 만들었다. 당시 실제 exception/stage는 수집되지 않아 OS 원인을 확정하지 않는다.

- CREATE-001: `새 보관함 만들기`는 앱 안의 생성 영역을 연다. `만들 위치 선택`은 read picker로 부모 위치만 선택하며 쓰기0이다. 부모가 자료와 같거나 자료 하위면 거부하고, 자료 상위는 새 자식의 실제 관계를 생성 단계에서 재확인한다.
- CREATE-002: 별도 `이 위치에 보관함 생성` 클릭에서 await 전 requestPermission(readwrite)를 시작한다. prompt→허용을 처리하고 거부면 생성0. 자동 재시도/수동 식별 파일 생성을 요구하지 않는다. 기존 보관함 연결은 읽기 전용 검증이다.
- CREATE-003: 단계 select-location/check-location/request-write/create-directory/write-identity/verify-identity/save-connection과 제한된 오류 코드/예외 이름을 표시한다. 원본 예외의 경로·본문은 출력하지 않는다. 생성 전 실패에 무조건 ‘폴더가 남을 수 있다’를 붙이지 않는다.
- CREATE-004: 취소·owner/source 변경은 선택 위치와 늦은 생성 결과를 무효화한다. 생성 중단 시 이미 생성된 항목을 자동 삭제하지 않는다. 기존 읽기/원본 보호 경계는 유지한다.
- LOG-001: 요구사항은 기존 `E:/memory/chatbotfolder/Requirements/요구사항.md`에 번호별1~3줄로 누적한다. 오류는 `E:/memory/chatbotfolder/Requirements/오류_정리.md`에 원인→해결→검증을 짧게 쓴다. 상세 내용·불확실성은 memory/HANDOFF 최신 절에 둔다. project-work-log와 AGENTS 라우팅으로 작업 시작/수정/마감에 확인한다.

실패 선행: staged API 부재 RED → 위치 선택 쓰기0/별도 권한 요청/권한 거부 stage GREEN. 기존 query-only 경로의 prompt 중단을 코드/합성 권한으로 재현했다. 사용자 OS에서 같은 원인이었다는 증거와 구별한다.
