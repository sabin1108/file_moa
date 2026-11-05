# 복원 작업 기록 조회 — 2026-11-04

후속: 사용자가 기능1~6과 테스트 재개를 승인해 복원 기록 조회/현재 파일 대조를 포함한 검증을 수행했다. 최신 근거는 [556테스트·349브라우저 검사](../file-management-six/README.md)다. 아래 보류는 최초 구현 당시의 기록이며 현재 테스트 보류 지시가 아니다.

복원 목적지 폴더의 `작업 기록` → `복원`에서 파일명/원래 위치/복원 위치/기록 시각/용량/완료·중단·실패·확인 필요를 표시하도록 연결했다. 기존 작업 기록 controller/dialog/상태 표시/CSS를 재사용했다. [명세](../../specs/recovery-restore-history.md).

## 구현과 읽는 순서

1. `components/history/FolderHistoryView`의 복원 분류 → `RestoreHistoryView`: 기존 평면 행·펼치기·상태 표시를 재사용한다. 좁은 폭에서 분류 버튼이 줄바꿈되도록 공통 CSS를 조정했다.
2. session의 `readSourceHistory`: 기존 생성/복사 조회 뒤 복원 조회를 연결한다. 취소·닫기·새로고침·연결 교체는 기존 controller/session 수명을 유지한다. 새 controller나 별도 실행 API는 추가하지 않았다.
3. `services/recovery-restore-history`: 현재 목적지의 `.moa-history/moa-restore-UUID` 안에서 허용된 JSON만 읽는다. 기존 `parseRestoreRecord`의 strict Zod 스키마를 재사용하고 owner/workspace·경로·작업 식별 정보/부모/파일 identity와 읽기 크기를 확인한다.
4. `lib/recovery-restore-history`: 저장된 레코드의 일관성만 요약한다. 완료는 일치하는 prepared/started/verified/stopped가 필요하다. 누락/손상은 확인 필요이며 중단·실패의 미실행/부분 결과를 구분한다.

현재 폴더에 저장된 과거 결과이며 현재 파일/보관함 쪽 기록 검증과 다르다. 보관함 연결 없이도 읽을 수 있다. JSON 외 사용자 본문/payload를 읽거나 권한을 요청하지 않고 생성·쓰기·삭제·복원 재실행도 하지 않는다. 목록1000항목/복원100작업, JSON 하나는 기존 쓰기와 같은1MiB/누적2MiB(재읽기 포함)로 제한한다. 긴 합법 경로의 기록을 작은 별도 한도로 거부하지 않도록 기존 쓰기 상수를 재사용한다. 새 의존성은 없다.

## 이번에 실행한 확인

- `pnpm typecheck`: 통과.
- `pnpm lint`: 통과.
- `pnpm build`:43페이지 생성 통과.

사용자의 최신 지시로 단위/브라우저 테스트 작성·실행과 성능 측정을 보류했다. 실제 기록 조회/재접속/한도·손상·취소/4폭 화면·키보드의 동작 검증은 아직 하지 않았다. 직전514테스트/204브라우저 결과는 이전 복원 구현의 근거이며 이번 변경이 통과했다는 의미로 사용하지 않는다. 요청 시 이 명세의 실패 조건부터 확인한다.
