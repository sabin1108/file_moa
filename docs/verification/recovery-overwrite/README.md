# 백업 후 실제 덮어쓰기 검증 — 2026-11-04

같은 이름의 기존 목적지 파일 백업→덮어쓰기 검토→최종 확인→실제 교체→파일별 결과를 구현했다. 원본을 유지하고 기존 파일의 복구 사본을 자동 삭제하지 않는다. 혼합 선택에서 정확한 충돌만 처리하며 나머지는 이번에 복사하지 않는다고 표시한다. 복원/삭제/만료 관리/보관함 목록·실제 이동/폴더 재귀는 후속이다. [명세](../../specs/recovery-overwrite.md).

## 검증 근거

- 최종 `pnpm check`:458테스트/45파일, 타입·lint 경고0·서버/구조 경계·43페이지 build 통과. 새 서비스21, session 추가4, controller 추가2로 기존431에서27개 증가했다.
- 실패 선행: 서비스 API 부재와 session/확인 상태 미구현 RED→GREEN. 후속 동일 bytes/size/mtime의 다른 파일 핸들 교체2개는 실제로 completed가 나오는 RED를 확인한 뒤 내부 identity receipt를 추가해 GREEN으로 바꿨다.
- 최종 production localhost3023: [덮어쓰기 UI38](ui-final/checks.json), [백업23](backup-final/checks.json), [기존 복사26](copy-final/checks.json), [보관함 연결23](connection-final/checks.json), [계획 피드백37](plan-final/checks.json), 합계147검사 통과. OPFS·실제 Worker SHA-256·실제 stream/close/readback, 합성 picker/권한·CDP 입력이다. 개인 디스크는 사용하지 않았다.
- 실제 기존 파일의 내용 교체·복구본 보존·양쪽 overwrite 기록 일치, 실행 직전 변경 차단(대상 writable0), 최종 확인 기본 중단 초점·Tab·Escape 중단 정산,390/768/1440/1920px를 확인했다. [390 경고](ui-final/overwrite-warning-390.png), [1440 경고](ui-final/overwrite-warning-1440.png), [완료](ui-final/overwrite-completed.png).
- 실제16MiB 원본을256×64KiB로 쓰고 목적지 SHA-256 일치/원본 hash·metadata 불변을 확인했다. [시간 원자료](ui-final/timing.json)는 작은 파일1회/16MiB1회이며 대표 성능·p95가 아니다. 페이지 로딩36표본은 [별도 기록](performance.md).
- 화면은 기존 앱 dialog/경고/버튼/행 토큰을 재사용했다.4폭 스크린샷을 직접 확인해 경고→대상/보관 위치→실행 순서를 유지했고, 긴 보관함 이름과 경로가 줄바꿈되며 모바일에서도 중단/실행이 보인다. 합계/용량은 실제 검사 결과에서 계산한다. 승인된 채팅 화면은 변경하지 않았다.

| 경계 | 실행한 반례/정상 사례 |
| --- | --- |
| 백업 선행 | payload 손상, 양쪽 stopped 위조/누락, 미완료 backup DTO, 시작 기록 실패 → 대상 writable0 |
| 현재 입력 | 같은 metadata의 다른 내용, 같은 bytes의 다른 핸들, 부모 교체, 경로 탈출, 나중 파일 크기 초과 → 차단 |
| 실행/중단 | 두 번째 write/close/readback 실패 → 첫 항목 verified/현재 uncertain/세 번째 not-run, 쓰기 중 외부 변경, 취소 abort, owner 무효화 뒤 추가 기록0 |
| 완료 감사 | 앞서 쓴 목적지의 뒤늦은 변경, 최종 prepared 손상 → 성공 금지/확인 필요/기록 불완전 |
| 정상 | 한글 경로·기존 빈 파일·새 빈 파일, source 보존/백업 보존, 실제16MiB 분할 쓰기/재읽기 |
| 승인 | 내부 완료 snapshot 없음/위조 DTO/재실행/새 활성 제스처 없음/보관함 재연결/늦은 결과 → 거부·폐기 |

테스트 데이터는 직접 만든 합성 FS/OPFS core다. 임의 생성·holdout/외부 벤치마크가 아니며 파일 수와 테스트 수를 구별한다. Vitest는 FS·Worker 경계만 fixture로 교체하고 실제 서비스/스키마/SHA-256/실패 상태를 실행한다. 브라우저는 OPFS 경계까지 실행하며 Windows picker/권한창·네이티브 디스크·외부 프로그램 경쟁·물리IME/실물 모바일·field INP는 미검증이다.

## 구조와 리뷰

표시/상태/session/입력 검사/쓰기/기록을 분리했다. `RecoveryOverwriteView` → `RecoveryBackupController` → `connection-session` → `recovery-overwrite-input` → `recovery-overwrite` → `recovery-overwrite-journal` → `lib/recovery-overwrite` 순으로 읽는다. 기존 BackupDirectory의 불변 새 파일 쓰기/읽기를 재사용했고 읽기 전용 open과 새 기록 이름만 확장했다. copy v1의 충돌 차단은 유지하며 새 의존성은 없다.

백업 DTO는 승인 권한으로 신뢰하지 않고 session이 보관한 계획/검사/완료 결과와 파일·부모 identity를 대조한다. 실행은 동일 Web Lock 안에서 현재 보관본과 양쪽 기록을 다시 읽고, 대상 시작 기록을 확인한 뒤 create:false/exclusive 스트림을 연다. close 전 재검사와 close 후 identity/크기/hash, 최종 전체 감사까지 마쳐야 성공이다. 기록은 `moa-overwrite-UUID`와 목적지 `.moa-history/moa-overwrite-UUID`에 새 recovery-overwrite v1 JSON으로 남기며 백업 기록을 수정하지 않는다.

Zod는 새 외부 기록 JSON의 strict 필드/UUID/owner/상태 형식을 검사하고 타입을 추론한다. 기존 파일 권한·UTF-8/크기·identity·hash 경계는 별도로 유지한다. 설치된 Node24/Next16.4.3/TypeScript5.9.3 및 기존 Zod/브라우저 API를 사용했고 업그레이드하지 않았다. 현재 lib.dom은 exclusive mode 옵션을 선언하지 않아 기존 서비스와 같은 옵션 객체 전달 방식을 유지하고 실제 Chromium에서 실행했다.

원자적 두 폴더 transaction/외부 OS compare-and-swap/자동 rollback을 약속하지 않는다. 뒤늦은 기록 감사 실패 시 이미 바뀐 파일이 있을 수 있으므로 확인 필요로 남긴다. 복구본과 양쪽 기록은 자동 삭제/자동 재시도하지 않는다. 새 overwrite 기록의 별도 과거 내역 조회/보관함 목록 UI는 아직 없고 현재 작업 결과를 표시한다.

외부 오류 원장은 `E:/memory/chatbotfolder/Requirements/오류_정리.md`, 요구사항은 같은 폴더46번. 긴 분석·재개 위치는 memory/HANDOFF 맨 위 최신 절에 저장한다. commit/PR/배포는 하지 않았다.
