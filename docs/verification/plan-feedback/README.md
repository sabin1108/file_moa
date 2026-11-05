# 목적지 구획·반복 확인·가독성 검증 — 2026-11-03

앞선 요구사항26~33 작업을 완료한 뒤 추가된34~38번을 처리했다. [명세/정리 계획](../../specs/plan-feedback-and-code-readability.md)을 먼저 작성하고, 별도 읽기 검토가 지연 후 세대 확인과 이전 계획의 실행 차단 조건을 검토했다.

## 결과

- 목적지의 현재 폴더 선택, 새로 만들기, 하위 폴더 목록을 테두리·배경·제목으로 구분했다. NewEntryForm을 새로 복제하지 않았다.
- 재확인 중 이전 계획을 유지하고 복사 전 검사 버튼을 차단한다. 계획과 검사는 공통 `waitForPendingFeedback`으로 성공 공개 시점만 최소360ms 유지한다. 느린 읽기에 추가 지연을 붙이지 않으며 취소/오류는 즉시 처리한다.
- 검사 시작에서 중간idle 발행을 없앴다. 이후 기존 실제 성공→순차 체크 효과를 유지한다. 지연 중 취소/닫기/입력·연결 변경은 세대 검사로 늦은 성공을 폐기한다.
- 항목/선택 콜백 타입을 공유하고 쓰이지 않는 선택모드 setter와 중복 취소 메서드, 해당 버튼 CSS를 제거했다. 일반 선택 해제 한 경로를 사용한다.
- 관련22개 파일의 독립 선언·조건문·예외 처리·JSX 속성을 줄바꿈하고 의미 있는 문단으로 나눴다. 생성자 인자 등 기계적 출력이 길어진 곳은 직접 정리했다. 새 코드 포맷터 의존성은 추가하지 않았다.
- 사용자 허용에 따라 Zod4.6.7을 정확한 web 직접 의존으로 고정했다. 복구 보관함 식별 JSON만 strictObject/safeParse로 검증하고 VaultIdentity를 추론한다. 날짜/소문자 식별자/추가 키 거부와 기존 서비스의 크기·권한·UTF-8·재읽기 계약을 유지한다.

## 검증

최소 표시시간 테스트2개가 기존 즉시 완료 상태에서 실패하는 것을 확인한 뒤 구현했다. 취소 중 timer 해제, 느린 작업 무추가대기, 기존 스키마 경계 테스트를 추가했다. 정리 전378개 통과를 기준으로 코드를 정리하고 `pnpm check`를 다시 통과했다:378테스트/37파일,타입,lint 경고0,서버 경계21,구조 검사,43페이지 빌드.

브라우저320검사:

| 구분 | 통과 | 근거 |
| --- | ---: | --- |
| 목적지 구획·반복 확인·중간 취소 | 37 | [프레임과 검사](browser/checks.json) |
| 직전 선택/검색/경로/순차 체크 | 26 | [검사](workspace/checks.json) |
| 기존 팝업 안정성 | 52 | [14개 프레임 구간](stability/checks.json) |
| 기존 탐색/길게 누르기 | 66 | [검사](navigation/checks.json) |
| 파일 작업 UI/접근성/실패 경로 | 69 | [검사](actions/checks.json) |
| 실제 복사/저널/재연결/64MiB | 26 | [검사](copy/checks.json) |
| 생성 기록/현재 상태/취소/권한 | 44 | [검사](history/results.json) |

목적지390/768/1440/1920px 화면을 캡처했고390/1440px 구획을 직접 확인했다. 반복 계획5회는 이전 결과 DOM을 유지하고 비활성 실행 버튼/360ms 이상 로딩/고정된 dialog 상단/opacity1을 확인했다. 재검사5회는 목적지 단계로 되돌아가지 않고 loading→ready만 표시했다. 단계 전환 테스트는 실제 검사 결과를 기반으로 하며 표시 최소시간을 가짜 진행률로 해석하지 않는다.

## 타입·재사용·정리 근거

[구문 검사 결과](type-audit.json): 웹 source148개에서 TypeScript AnyKeyword0,strict=true. `export const unsafe: any = 1`을 파일을 만들지 않는 ESLint stdin으로 검사했을 때 `@typescript-eslint/no-explicit-any`,severity2,errorCount1로 거부했다. 이는 명시적any 사용과 해당 규칙의 증거이며 모든 외부 경계의 완전한 안전성을 보장하지 않는다.

공유 타입: `types.ts`의 FolderListEntry/FolderEntrySelection. 기존 source-folder-listing의 타입 import 경로는 재수출로 호환한다. source/navigation을 통해 선택을 소유하고 UI에 핸들을 전달하지 않는다. 작은 최소표시시간 함수는 계획/검사 두 실제 소비처만 공유한다. 기존 버튼/StatusNotice/NewEntryForm/길게 누르기 훅은 계속 재사용한다.

정리 전 스냅샷은 `.omx/readability-before/`, 일회성 정리 도구는 설치된 TypeScript를 사용한 `.omx/preview-readable-code.cjs`다. 제품에 포맷터/변환기를 추가하지 않았다. 정리 범위는 명세에 기록한 source/listing/navigation/search/plan/inspection/path/history 구성이다. 기존 의도된 부분 검색과 잘못된 목적지 입력의 루트 탐색은 실패 정보를 보존하는 계약이므로 유지했고 오류를 성공으로 숨기는 fallback을 추가하지 않았다. 독립 읽기 검토에서 현재 차단 결함은 발견하지 못했다.

## Zod 선택과 범위

[Zod 공식 API](https://zod.dev/api)의 strictObject는 추가 키를 거부하고, [safeParse/추론 타입](https://zod.dev/basics)은 외부unknown 값의 성공/실패 분기와 타입을 한 스키마로 정의한다. 기존의 긴 수동 조건문과 별도 타입이 서로 어긋나는 위험을 줄이기 위해 식별JSON 경계에만 적용했다. 파일 접근/보안/복구 승인 전체를 Zod로 처리한다고 주장하지 않는다.

아직 복구 기반은 실제 client 경로에서 import되지 않는다. client 자산의ZodError/ZodString 등 표식 검색은0이며, 이 문자열 검색만으로 번들 포함 여부를 단정하지 않는다. 실제 자산/초기 전송 변화는 [성능 기록](performance.md)을 따른다. 실제 이동/복구 보관함UI/백업/덮어쓰기/복원/삭제는 이번 범위에서 구현하지 않았다.

OPFS·합성 권한·CDP 증거이며 물리IME/실물 모바일/OS 권한창/개인 디스크/외부 프로그램 경쟁·실사용INP는 미검증이다. 사이트는localhost3011의production build이며 전체untracked 상태라 commit/PR/배포는 만들지 않았다.
