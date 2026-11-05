# 파일 관리1~6 구현·검증 — 2026-11-04

요구사항55~61. 사용자가 제시된 기능1~6 구현 후 테스트 재개·오류 수정을 승인했다. 이전54번의 테스트 보류를 이번 범위에서 해제하고, 미검증이던 복원 기록 조회도 포함했다. [전체 계약](../../specs/managed-files.md).

## 실제 연결한 기능

| 기능 | 화면 경로 | 결과 |
| --- | --- | --- |
| 복원 파일 현재 확인 | 작업 기록→복원→현재 파일 확인 | 현재 일치/변경/없음/같은 이름 폴더, 과거 완료 기록 유지 |
| 단일 파일 이동 | 선택→이동→기존 목적지→검사→보존 후 이동 실행 | 보존·목적지 검증 뒤 원본 비재귀 제거 |
| 폴더 복사 | 폴더 포함 선택→복사 | 재귀 트리·빈 폴더·충돌 차단·새 항목 생성 |
| 폴더 이동 | 폴더 포함 선택→이동 | 전체 목적지 확인 후 leaf-first 원본 처리 |
| 복구 가능한 삭제 | 선택→휴지통→검사→최종 실행 / 휴지통·보존 기록→복구 | 원래 bytes·트리 보존, 선택 위치/새 이름 복구, 보존본 유지 |
| MD/TXT 편집·저장 | 미리보기→문서 편집→변경 전 검사→보존 후 저장 | 별도 초안/외부 변경 차단/BOM·CRLF/명시적 버림 |

파일16MiB/전체64MiB/500항목/선택100/깊이16, 편집 UTF-8 bytes2MiB다. 목적지는 기존 폴더만 선택하며 기존 항목 merge/overwrite는 차단한다. 보관함과 `.moa-*`는 복사에서 제외하고, 이를 포함한 폴더의 이동·휴지통은 사전 차단한다. 원본 변경 기능은 연결된 앱 보관함이 필요하다. 앱 휴지통이며 OS 휴지통/영구 삭제/자동 purge는 구현하지 않았다.

## 구조와 재사용

표시는 `ManagedFilesDialog/ManagedOperationView/ManagedArchivesView`, 상태·수명은 `ManagedFilesController`, private 승인/owner/연결 세대/상호배제는 session, 읽기 proof는 `managed-inspection/managed-tree`, 변경은 `managed-execution`, 양쪽 JSON/사본은 `managed-archive/lib/managed-files`가 맡는다. 기존 dialog/picker/버튼/StatusNotice/해시 Worker/BackupDirectory를 재사용했다. 기존 파일 복사·충돌 백업·덮어쓰기와 기존 새 파일 복원은 유지한다. 새 의존성/아토믹 전면 변경은 없다. [읽는 순서](../../code-map.md).

## 실행 증거

최종 `pnpm check`: **556테스트/54파일**, 타입·lint 경고0·서버/구조 경계·43페이지 build 통과. 직전514에서42개 추가: managed 서비스29·복원 기록/현재 대조7·session4·controller2. 새 source-removal 기록 파일명만 기존 불변 저장소 whitelist에 추가했고 기존 검사도 통과했다. 현재 코드에 대한 결과이며 과거 통과 수치를 재사용하지 않았다.

실제 Chromium/OPFS/Worker, production localhost3030 **349브라우저 검사**:

| 묶음 | 수 | 근거 |
| --- | ---: | --- |
| 새 관리 기능/4폭/편집·외부 변경·취소·충돌 |31|[결과](browser-edges/checks.json)|
| 실제 복원과 현재 상태·4폭 |45|[결과](restore-current-final/checks.json)|
| 기존 작업·선택·목적지 UI |69|[결과](regression/actions/checks.json)|
| 실제 덮어쓰기 |38|[결과](regression/overwrite/checks.json)|
| 기존 새 파일 복원 |43|[결과](regression/restore/checks.json)|
| 실제 복사 |26|[결과](regression/copy/checks.json)|
| 보관함 목록·상세 |37|[결과](regression/archive/checks.json)|
| 보관함 연결·생성 |23|[결과](regression/connection/checks.json)|
| 계획/반복 확인 |37|[결과](regression/plan/checks.json)|

폴더 copy/move는16MiB 실제 파일을 각각256×64KiB로 써서 총512개 chunk를 관측했고 source/destination hash와 빈 폴더를 확인했다. 단일 move와 tree move의 비재귀 제거, trash 실제 원본 부재/정확 bytes 복구/보존본 유지, 실제 편집 저장/preview 갱신·BOM/CRLF, IME 초안,390/768/1440/1920px 넘침, 최종 취소 초점, dirty 편집 닫기, 외부 편집 후 재읽기, 쓰기 중 Escape 정산, 실행 직전 빈 파일 충돌 차단을 확인했다. BOM/CRLF 보존은 실제 서비스/SHA-256의 합성 FS 테스트로, 브라우저는 UTF-8 실제 저장·미리보기 갱신으로 검사했다. 현재 파일 확인은 원래 기록을 유지하며 일치/변경/부재/폴더와 쓰기·추가 권한 요청0을 검사했다. 추가 경계5개는500항목/깊이16/64MiB, 보존 payload 손상, 제거 실패,8MiB metadata 한도를 확인한다.

## 발견·수정한 문제

- 원본 제거 후 목적지 파일 상실/예상 밖 자식을 완료로 판정할 여지: 마지막 정확한 트리/identity/hash 검사를 추가했다.
- 제거 직전 부모 경로 교체: 원본 검증 뒤 제거 직전·직후 부모 identity를 다시 확인한다.
- vault stopped만 저장된 경우 재접속 완료 오판: manifest의 검증된 historyParent에서 양쪽 prepared/preserved/stopped를 대조한다.
- 편집 검사 실패 후 복구 행동 부족: ‘편집 내용 버리고 다시 읽기’를 추가해 외부 버전에서 새 기준을 잡는다.
- 화면 effect의 동기 setState lint 오류는 native close 이벤트 처리로 수정했다.

위 고위험 반례4개는 서비스 테스트로 고정했다. 읽기 전용 설계/최종 코드 검토에서도 수정 누락이나 새 고위험 결함은 발견되지 않았다. 브라우저 초기 `browser-final`의 미리보기 대기 및 `browser-retry`의 dirty 경고 즉시 판정 실패는 화면 반영 전 검사하던 타이밍 문제였다. 클릭 전2프레임·경고 출현 대기를 테스트에 추가하고 제품 지연은 넣지 않았다. 초기/실패 원자료와 최종 `browser-edges`를 함께 보존했다.

## 한계

개인 note/보관함에는 접근·삭제하지 않았다. 합성 FS/OPFS와 합성 권한·CDP 입력이며 Windows 실제 디스크/네이티브 권한창·물리 IME·외부 OS 동시 수정은 미검증이다. API가 원자적 파일·트리 이동이나 외부 create-if-absent를 제공하는 것으로 보고하지 않는다. 부분 목적지/원본/기록은 자동 삭제/rollback/재시도하지 않고 보존본에서 별도 복구한다. 큰 트리의 실물 성능·복원 peak memory는 미측정이다. [성능 원자료·조건](performance.md).
