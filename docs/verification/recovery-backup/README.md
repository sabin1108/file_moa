# 기존 목적지의 검증된 복구 백업 — 2026-11-04

## 구현 결과

source/target의 정확한 이름 충돌 파일을 읽어 검토한 뒤, 기존 target bytes를 UUID 기반 보관본에 저장하고 재검증하는 service/session API와 실제 사용자 화면을 구현했다. 복사 계획의 `충돌 파일 검사` → 새/기존 파일 비교 → `기존 파일의 복구 사본 만들기` → 파일별 결과로 이어진다. 최종 덮어쓰기는 후속이며 기존 copy v1의 충돌 차단은 유지했다.

## 가장 최신 — production UI까지 검증

사용자의 “작업 이어서 하고 있어” 지시 후 실제 화면 연결까지 진행했다. `RecoveryBackupController`를 별도 추가하고 SourcePlanController의 기존 선택/연결 수명에 결합했다. 정확한 이름 충돌만 백업 대상으로 좁히며 혼합 선택의 무충돌 파일은 백업하지 않는다. 검사360ms 피드백, 실행 중 계획 변경 차단, 명시적 쓰기 버튼, Escape 중단 정산, owner/source 해제 뒤 늦은 결과 폐기를 검증했다.

최종 전체424테스트/43파일(이번 단위 신규28개), 타입/lint 경고0·경계·43페이지 build 통과. 마지막 CSS 보완 뒤 build와 실제 UI를 재실행했다. `pnpm exec node tests/browser/check-recovery-backup-ui.mjs http://127.0.0.1:3016`의23개 검사: 실제 OPFS/production Worker 백업,4폭 넘침·제목 너비,source/target 무변경,양쪽 기록·payload,Escape 중단·미확인 표시,디스크 오류·재검사 요구,닫기 초점 복귀. [UI 원자료](ui/checks.json), `ui/review-{390,768,1440,1920}.png`, `ui/completed.png`를 보존했다.390/1920 캡처를 직접 확인했다. 기존 rows의40px 라벨 규칙이 새 비교 영역까지 전파된 것을 발견해 해당 비교 블록의 표시 책임에서 수정하고 너비 회귀 검사를 추가했다.

UI 연결 후 production3015에서 기존 복사26개·반복 피드백37개를 다시 통과했다. [copy-regression-ui/checks.json](copy-regression-ui/checks.json), [feedback-regression-ui/checks.json](feedback-regression-ui/checks.json). 이후 수정은 비교 블록 CSS 한정이며3016 UI23개를 다시 통과했다. 아래 최초 API 단계의418/42와 UI 미구현 설명은 과거 단계의 결과다. 최종 브라우저 합계는 backend16+UI23+복사26+피드백37+앞선 연결14=116개 named 검사이며 서로 다른 단계의 실행 범위를 구별한다.

직접 확인: `/files`의 폴더 연결 관리에서 자료/보관함 연결 → 기존 목적지에 같은 이름 파일이 있는 자료 선택 → 복사/목적지 확정/계획 만들기 → 충돌 파일 검사 → 비교 확인 → 복구 사본 만들기. 새/기존 파일은 유지되고 보관함에 사본이 생긴다. 이번에는 입력 필드를 추가하지 않아 새로운 IME 경로는 없으며 기존 경로 입력/키보드 회귀를 함께 실행했다.

입력은100파일, 각16MiB, source+target 합계64MiB로 제한한다. 모든 metadata 한도를 먼저 검사하고, 원본/목적지의 size/mtime/hash와 핸들·부모 identity를 읽기 검사한다. 모호한 이름·중복·동일 경로·폴더 충돌·목록 상한을 차단한다. 보관함 위치와 owner/vault 식별도 재확인한다. hash는 기존 Worker를 재사용한다.

실행은 session 내부 snapshot과 동일 계획/검사 결과, 새 사용자 제스처, source/recovery 연결 수명을 요구한다. 양쪽 쓰기 권한 요청은 첫 await 전에 시작한다. bytes를 고정한 뒤 전용 작업 폴더에 양쪽 prepared.json을 저장·재읽기한다. payload는 보관함의 recoveryId.bin이며64KiB 단위로 쓴다. close 후 같은 핸들로 두 번 재열기·size/hash 확인, 현재 source/target 재확인, 양쪽 item-verified 기록을 저장한 뒤 항목 verified를 게시한다. 완료 직전 모든 payload와 prepared/verified/stopped 기록을 재검사한다.

목적지 기존 파일의 writable/삭제는0이다. 목적지 아래에는 `.moa-history/moa-backup-UUID`의 새 기록만 추가한다. 보관함에도 `moa-backup-UUID`의 새 파일만 쓴다. 기존 copy/생성 기록 형식은 바꾸지 않는다. 새 의존성 없이 기존 위치 reader·hasher·폴더 열기·Zod와 공통 owner/time/UUID 스키마를 재사용했다.

## 실패와 완료의 의미

첫 실패 후 다음 파일은 실행하지 않는다. 시작 전 not-run, 실행 중 실패/취소는 uncertain, 이미 검증한 사본은 verified다. 양쪽 기록 실패/불일치는 journalComplete=false다. 연결/owner가 바뀌면 추가 오류 기록도 쓰지 않으며 session은 늦은 성공을 반환하지 않는다. 사용자 취소 후 연결이 유효할 때만 중단 기록을 시도한다. 부분 폴더/파일을 자동 삭제하거나 rollback하지 않는다.

retention은 undecided/expiresAt:null이다. 보존 기간·자동 삭제·복원 정책을 정하지 않았다. 완료는 당시의 관측이며 이후 덮어쓰기를 허용하는 토큰이 아니다. 후속 덮어쓰기는 보관본과 현재 목적지를 다시 검증해야 한다. 마지막 검증 이후에도 외부 프로그램이 파일을 바꿀 수 있다.

## 실행한 검증

- `pnpm check`:418개/42파일, 타입 검사, lint 경고0, 서버 경계21개와 실제 기능/도메인 구조 검사,43페이지 production build 통과.
- 신규22개 단위 검사: strict 계획/JSON·모순된 완료·중복 ID 거부, 빈/한글 파일, metadata/총량 한도, 변경 snapshot, write/open/close/readback/한쪽 기록 실패,2번째 실패 후3번째 미실행, source/target/부모/vault 교체, 취소·owner 전환, 내부 승인 소비·사용자 제스처·재연결 무효화.
- 실패 선행 증거: schema 모듈 부재 RED→GREEN. 완료 기록에 오류가 섞인 JSON 허용 RED→strict refine GREEN. 마지막 hash 실행 도중 보관본을 같은 크기/mtime으로 교체해도 completed가 나오던 실패 RED→재열기/hash 이중 관측 GREEN.
- `pnpm exec node tests/browser/check-recovery-backup.mjs`: 실제 Chromium OPFS/session/Worker16개 named 검사 통과. 작은3파일(한글/빈/1MiB)3회와16MiB 경계1회, 총4개 작업을 수행했다. source/target hash·size·mtime 유지, 원래 파일명 writable0, 양쪽 기록 동일,8개 생성 Worker 전부 terminate 확인. 원자료 [browser/checks.json](browser/checks.json).
- 새 production3013에서 기존 복사26개와 보관함 연결14개 통과. [copy-regression/checks.json](copy-regression/checks.json), [connection-regression/checks.json](connection-regression/checks.json). 신규16+기존40=56개 named 브라우저 검사이며 반복 작업 수와 섞어 세지 않는다.
- UI를 변경하지 않아 새 IME/키보드 흐름은 없다. 기존 연결 회귀가4폭/키보드/초점을 다시 검사했다. 최초 회귀 실행은 기존 recovery-connection/browser 원자료도 갱신했으며, 이후 이 단위 전용 출력 경로 옵션을 추가해 별도 저장했다.

## 브라우저 도구의 범위

`tests/fixtures/backup-probe-server.mjs`는 실제 session 진입점의 닫힌 모듈 그래프125개만 localhost 임시 포트에서 제공한다. TypeScript를 transpile하고 Worker의 TS-only 빈 export 표식을 production bundler처럼 제거한다. 해시 로직/Worker 메시지/서비스는 바꾸지 않는다. Browser CDP의 실제 클릭으로 session의 userActivation gate를 통과한다. production에 probe/window/test route를 추가하지 않았다. 이 검사는 OPFS 실행 근거이며 production 번들의 신규 백업 UI E2E는 아니다. 기존 product 회귀는 별도 production3013 서버에서 실행했다.

실제 디스크·네이티브 권한창·심볼릭 링크·외부 OS 경쟁·물리IME/실물 모바일·field INP는 미검증이다. UUID/Web Lock/exclusive stream은 원자적 exclusive 폴더 생성이나 외부 프로세스 잠금이 아니다. 권한창 두 개의 실기기 사용자 경험도 별도 확인이 필요하다. [성능/비용](performance.md), [명세](../../specs/recovery-backup.md), [코드 읽기 순서](../../code-map.md).
