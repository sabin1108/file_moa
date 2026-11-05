# 파일 관리 기능1~6 — 2026-11-04

사용자가 제시된 목록의1~6 구현과 이후 테스트·오류 수정을 승인했다. 이전 테스트 보류는 이번 범위에서 해제한다. 기존 기능별 컴포넌트 설계를 유지하고 의존성을 추가하지 않는다.

## 사용자 흐름

1. 작업 기록→복원→현재 파일 확인: 완료/검증된 복원 기록과 현재 파일의 크기·SHA-256/동일성/두 번째 읽기를 대조해 일치·변경·부재·같은 이름 폴더·권한 문제를 표시한다. 마지막 기록/부모도 재확인하며 과거 결과는 바꾸지 않는다.
2. 파일 선택→이동→기존 목적지→검사→별도 최종 실행: 검증된 보존본과 새 목적지가 모두 있어야 원본을 제거한다. 기존 파일을 덮거나 합치지 않는다.
3. 폴더 포함 선택→복사: 완전한 한도 내 재귀 트리를 검사하고 빈 폴더를 포함해 새 최상위 항목으로 복사한다. 관리 표식/`.moa-*`는 제외 사실을 표시한다.
4. 폴더 포함 선택→이동: 같은 검사/보존/복사 후 모든 목적지를 검증하고 파일·빈 폴더를 역순 처리한다. 관리 폴더가 포함된 원본 제거는 검사 단계에서 차단한다.
5. 선택→휴지통으로 보내기→검사→최종 실행: 앱 보관함에 원래 bytes/트리를 보존한 뒤 원본을 제거한다. ‘휴지통·보존 기록’에서 원래 부모 또는 선택한 기존 폴더로 복구한다. 이름 충돌 시 새 최상위 이름을 제안하고 merge/overwrite하지 않는다.
6. MD/TXT 미리보기→문서 편집→별도 초안→변경 전 검사→보존 후 저장: 별도 로딩 receipt에 묶인 handle/hash 기준으로 외부 변경을 차단한다. UTF-8 BOM과 일관된 CRLF를 보존한다. 변경한 초안을 닫으면 계속 편집/명시적 버림을 고르게 한다.

## 검사·변경 경계

- 보관함이 필요하다. 목적지 탐색 자체는 자료 연결만으로 읽을 수 있으며 보관함 미연결은 실제 검사에서 수정 안내한다. private one-shot 승인/새 사용자 제스처/소유자·자료·보관함 세대와 기존 생성 Web Lock을 사용한다.
- 파일16MiB/전체64MiB/500항목/선택100/깊이16/전체 상대 경로32조각, 편집 UTF-8 bytes2MiB다. 한도 초과는 전체 변경 전에 차단한다. 대소문자/NFC 충돌·위험 경로·같은 위치/선택 폴더 내부 목적지를 거부한다.
- `managed-tree`는 순서 있는 노드/파일 hash/핸들/크기/수정 시각과 빈 폴더를 캡처한다. UI에는 핸들을 보내지 않는다. 원래 bytes를 고정하고64KiB로 저장한다.
- 보관함 `moa-managed-UUID`와 유효한 기존 부모의 `.moa-history/moa-managed-UUID`에 strict prepared/preserved/항목 intent/verified/removal/stopped JSON을 저장·재읽기한다. binary는 보관함에만 둔다. 보존 후에야 원본 변경으로 진행한다. 기존 `BackupDirectory`와 해시 Worker를 재사용하고 앱은 기존 보존 파일을 덮거나 지우지 않는다.
- 이동은 모든 목적지를 검증한 뒤 원본을 다시 확인한다. 각 파일의 목적지/보존본·원본 hash와 핸들, 제거 직전/직후 부모 identity를 확인한다. 제거는 `removeEntry(name)`의 비재귀 호출만 사용하고 부재를 두 번 관측한다. 새 외부 항목이 있으면 빈 폴더 제거를 멈춘다.
- 목적지는 파일 hash뿐 아니라 정확한 child name/kind/핸들 집합도 비교한다. 원본 제거 후 최종 트리를 다시 검사한다. 한쪽 최종 기록만 성공하면 재접속 목록에서 완료로 표시하지 않는다.
- 최초 목적지 생성/편집/원본 제거 시도부터 오류·취소는 확인 필요다. 성공한 목적지 수와 원본 제거 확인 수를 따로 보이고, 보존본·부분 파일·기록을 유지한다. 첫 실패 뒤 중단하며 자동 재시도/rollback/부분 파일 정리는 없다. Escape는 실행을 중단하고 정산 결과를 같은 창에 유지한다.

## 보관·복구 정책

OS 휴지통이 아닌 앱 보관함 기반이다. 기존 recovery-vault.md의 자동 정리/보관 기간 가정보다 **영구 삭제·자동 purge 없음**을 우선한다. 복구 후에도 보존본을 소비/삭제하지 않는다. 영구 삭제 UI와 보관 기간은 이번 범위 밖이다. 외부 앱이 보관함을 수정할 수 있으므로 OS 차원의 불변성을 주장하지 않고 실행 전 재검증한다.

목록은500항목/100작업/metadata8MiB 한도이며 일부 목록·읽기 실패를 표시한다. 완료 표시는 양쪽 prepared/preserved/stopped의 일치 기록이고, payload 현재 검사는 복구 위치 검사에서 수행한다. 원래 부모/기록이 없어도 보관함 사본이 검증되면 다른 기존 위치로 복구할 수 있다.

## 공식 API와 한계

비재귀 제거는 기본값이며 빈 디렉터리만 제거한다. [MDN removeEntry](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemDirectoryHandle/removeEntry). 단일 writable은 close 시 반영되며 exclusive는 전체 트리/외부 OS 작성자와의 transaction이 아니다. [MDN createWritable](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle/createWritable). 핸들 동일성과 시점의 File snapshot은 내용 버전/외부 원자적 create-if-absent를 보장하지 않는다. [getFile](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle/getFile), [isSameEntry](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemHandle/isSameEntry). 사용자 제스처 권한은 [Chrome 공식 문서](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)를 따른다.

테스트는 합성 FS/실제 Chromium OPFS와 합성 권한에 한정한다. 사용자 개인 note에는 접근·삭제하지 않는다. 네이티브 권한창·실제 디스크/물리 IME·외부 프로그램 동시성은 별도 미검증이다. 구현→실패 테스트→수정의 이번 사용자 지정 순서를 기록하며 SDD/TDD 선행 완료로 보고하지 않는다.

> 2026-11-04 후속: 편집 UI와 반복 보존 정책·목적지 기본값·URL/F5 복원은 [workflow-ux.md](workflow-ux.md)를 우선한다. 편집은 미리보기 안에서 첫 보존 한 번 후 직접/주기 저장을 제공하고, 모든 작업의 목적지 picker가 기존 생성 폼을 공유한다. 아래 최초 구현 시점의 별도 편집 검토 흐름은 일반 UI 진입에서 대체됐다.
