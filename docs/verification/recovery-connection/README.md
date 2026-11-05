# 복구 보관함 생성·연결 검증 — 2026-11-04

11월4일 후속 백업 구현 뒤 연결 회귀14개를 재실행하며 `browser/` 원자료를 갱신했다. 신규 백업의 최종 회귀 원자료는 [별도 경로](../recovery-backup/connection-regression/checks.json)에 보존한다. 아래 최초 검증 설명/성능 자료와 후속 실행을 구별한다.

## 결과와 범위

설정 페이지/폴더 연결 관리 창에서 새 전용 보관함 생성, 기존 보관함 연결, 저장된 참조의 명시적 재연결, 연결 해제를 구현했다. 브라우저의 `isSameEntry`와 양방향 `resolve`로 전체 자료 루트와 동일/상하위인 위치를 차단한다. 현재 목적지는 자료 루트 안에서만 선택하므로 해당 루트가 목적지도 보호한다. 외부 목적지를 추가할 때 보호 루트 입력 확장이 필요하다.

생성은 쓰기 picker로 고른 부모에 UUID 이름의 새 하위 폴더와 `.moa-vault.json`만 만든다. 기존 이름/비어 있지 않은 식별 파일을 거부하고 close 후 기존 Zod reader로 재읽는다. 일반 폴더/다른 owner는 기존 보관함으로 채택하지 않는다. owner/workspace/kind별 기존 IndexedDB 어댑터에 `recovery` 참조만 저장한다. 로드시 권한 요청/식별 읽기 없이 `needs-permission`이다. 자료 연결 변경은 recovery 준비 상태도 무효화한다.

## 실행한 검증

- `pnpm check`: 396개 테스트/39파일, 타입 검사, lint 경고0, 서버 경계21개·기능 구조 검사, 43페이지 production build 통과.
- 신규 위치 검사: 구현 모듈 부재로 RED 확인 → 동일/상하위/동명이지만 다른 위치/권한·관계 오류/취소 GREEN.
- 권한 상실 시 새 폴더를 먼저 만들던 실패를 테스트로 재현 → 생성 전 source 권한 확인 추가 → GREEN.
- 신규 생성/연결 tests: write·close 실패, 취소 후 abort, 충돌, readback 손상, 타 owner, 저장 실패, 늦은 owner 응답, 참조 복원과 명시적 재연결. 기존 식별 테스트도 포함한 전체 회귀 통과.
- `pnpm exec node tests/browser/check-recovery-connection.mjs http://127.0.0.1:3012`: 격리 Chromium OPFS에서14검사 통과. 잘못된 위치 쓰기0, 생성/식별, 해제 후 파일 보존, 일반 폴더 거부, 기존 연결, 새로고침 뒤 자동 권한·본문 읽기0, 사용자 제스처 재연결, source sentinel hash/size/mtime 유지, Escape/초점 복귀,390/768/1440/1920px 넘침 검사와 캡처.
- 기존 복사26개 및 계획/검사 피드백37개 브라우저 검사 통과. 신규14개와 합계77개다. 회귀 원자료는 `copy-regression/`, `feedback-regression/`, 신규는 `browser/checks.json`이다.
- 마지막 코드 변경(최종 관계 재검사/오류 접근성/가독성) 뒤 전체 check와 새 production 서버3012에서 신규 브라우저 검사를 재실행했다. 복사/피드백 회귀는 앞선 production3011 빌드 결과다.

## UI와 읽기 순서

기존 승인된 폴더/채팅 구성을 유지하고 연결 설정 내부에 보관함 행동을 추가했다. 기존 공통 버튼과 간격/서체 토큰을 사용한다. 입력 필드를 추가하지 않아 새로운 IME 입력 흐름은 없다.390/1440px 캡처를 직접 열어 확인했다. 좁은 화면은 dialog 내부 스크롤을 사용한다. 파일별 역할과 읽기 순서는 [코드 지도](../../code-map.md)의11월4일 절이다. [명세](../../specs/recovery-vault-connection.md), [성능](performance.md).

## 한계와 다음 단위

합성 picker/permission과 실제 OPFS/IndexedDB/브라우저 입력을 사용했다. 네이티브 권한창, 개인 디스크, 외부 프로그램 경쟁, 심볼릭 링크/별칭, 물리 IME·실물 모바일, field INP는 미검증이다. File System Access는 원자적 exclusive 폴더 생성 옵션이 없으며 UUID/사전 확인/Web Lock으로 외부 프로세스를 잠글 수 없다. [File System Standard](https://fs.spec.whatwg.org/#api-filesystemdirectoryhandle-resolve)를 기준으로 핸들 관계를 해석했다.

쓰기 시작 후 실패·취소는 새 폴더/빈 식별 파일을 남길 수 있다. 자동 삭제/rollback하지 않고 UI에서 알린다. 이미 시작한 IndexedDB 저장은 원자적 transaction 완료까지 진행될 수 있으나 취소된 UI를 connected로 게시하지 않으며, 참조만으로 파일을 읽거나 변경하지 않는다. 새로운 인증 구현이 아니며 기존 localhost 개발 owner/DB 제한을 유지했다.

다음 단위는 백업 manifest와 실제 백업·재읽기/hash 검증이다. 백업/덮어쓰기/복원·삭제, 실제 이동, 재귀 작업은 미구현이다. 보존 기간과 자동 삭제 정책은 미정이다. 독립 구현/리뷰 역할 런타임은 계정의 모델 미지원으로 실행되지 않아 리더가 구현·검증했다.
