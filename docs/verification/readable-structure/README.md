# 읽기 쉬운 기능 구조·테스트 분리 검증

2026-10-28. 사용자는 components/layout/ui·기능별 컴포넌트·hooks/services/store/types/lib 형태의 구조, 제품 코드와 테스트의 분리, 주요 기능의 역할·사용처·작동 흐름 주석을 요청했다. Next의 라우팅 규칙을 유지하면서 이 프로젝트의 실제 사용처에 맞춰 적용했다.

## 무엇을 어디서 읽나

[src 안내](../../../apps/web/src/README.md) → [local-folders 안내](../../../apps/web/src/features/local-folders/README.md) → [전체 호출 지도](../../code-map.md) 순서로 읽는다. 기능 코드와 CSS만 검토하려면 src의 app/components/features/styles를 보면 된다. 테스트는 [별도 안내](../../../tests/README.md)에서 관리한다.

| 위치 | 현재 책임 |
| --- | --- |
| src/app | Next page/layout/route·아이콘. 라우트와 화면 조합 |
| src/components/layout | WorkspaceShell: 실제 여러 경로의 공통 메뉴·작업 프레임 |
| src/components/ui | 실제 공유하는 UI/feedback. 기능 상태/파일 접근 없음 |
| features/local-folders/components/connection | 연결 표시·조작·설정 팝업과 CSS |
| features/local-folders/components/listing | 폴더 목록·파일 선택·화면 조합과 CSS |
| features/local-folders/components/preview | 원문 미리보기와 CSS |
| features/local-folders/providers·hooks | 경로 간 수명 공유·React 구독·기능 조립 |
| features/local-folders/store | 연결·목록/선택·본문 controller |
| features/local-folders/services | 연결 session·읽기 reader·핸들 저장소 |
| features/local-folders/types.ts·lib | 타입 계약과 실행되는 경계 검증 |
| src/styles | 전역/공통 작업면·조작 CSS |
| src/prototypes | 합성 시안. 테스트나 제품 업무 로직과 구분 |
| apps/web/tests, packages/domain/tests | 각 패키지의 단위 테스트 |
| tests/browser·architecture·fixtures·performance·s0 | 브라우저/경계/자료 준비/측정/독립 검증 도구 |

Next가 components/hooks/store라는 이름을 강제하는 것은 아니다. 이 프로젝트는 app을 진입점으로 제한하고 기능 전용 코드를 feature 안에 둔다. /preview의 진입점은 유지하되 시안 구현은 prototypes 한 곳에 보존했다. 없는 기능·서버 구현을 표시하기 위한 빈 폴더나 신규 상태관리 라이브러리는 추가하지 않았다. [공식 규칙](https://nextjs.org/docs/app/getting-started/project-structure), [정리 계획](../../planning/readable-feature-structure.md).

## 주석과 동작 보존

주요 모듈22곳에 담당 기능·호출자·다음 계층을 설명하는 주석을 넣었다. 예를 들어 connection-session은 UI가 아니라 controller에서 호출하고, 핸들 저장과 파일 읽기를 각각 repository/reader에 맡긴다고 설명한다. 단순 버튼 선언을 풀어 쓰거나 모든 줄에 주석을 붙이지 않았다.

[이동 기록](moves.json)83건과 변경 전 hash, 로컬 작업 백업을 남겼다. [구현 비교](behavior-preservation.json)는 import/주석을 제외한 제품 구현94개가 동일하고 CSS29개는 바이트 단위로 같음을 확인한다. types에서 lib로 분리한 검증 함수 본문도 동일하다. 이 비교는 실제 모듈 로딩 검증을 대신하지 않으므로 아래 회귀 검사를 추가했다.

이동 도구의 초기 문자열 변환이 경로 검증의 점(.) 문자열까지 바꾼 문제를 코드 대조와 기존 테스트가 잡았다. 원본 백업에서 재적용하며 변환을 import·명시적인 파일 URL/검증 서버 소스 경로로 제한했다. 최종 본문 비교와121개 테스트가 통과했다. 오류를 숨기는 호환 wrapper나 테스트 제외는 추가하지 않았다.

## 최신 검증

| 검사 | 결과·근거 |
| --- | --- |
| 변경 전 pnpm check | 121개 단위 검사·기존 경계·build 통과. [before.txt](before.txt) |
| 새 경계 red | 새 components의 잘못된 의존을 기존 규칙이 차단하지 못해 실패. [boundary-red.txt](boundary-red.txt) |
| 최종 pnpm check | 타입·lint·단위121개/11파일·서버 경계21개·웹 import fixture25개·domain fixture6개·배치3개·실제 domain import·build43페이지 통과. [check-final.txt](check-final.txt) |
| 테스트 발견/분리 | 기존11개 테스트 파일이 새 위치에서 발견되고 src 안 test/spec0개. [파일 목록](test-files.json) |
| S0 | 새 tests/s0 경로 typecheck 통과. pnpm test:s0-graph에서 HTTP 모듈9개와 브라우저 export 평가 통과 |
| 선택/팝업 | [39개](browser/checks.json) 통과 |
| 연결·이동 | [연결51개](connection/browser-checks.json), [자동 이동13개](navigation/checks.json) 통과 |
| 목록·본문 | [목록46개](listing/browser-checks.json), [미리보기53개](preview/checks.json) 통과 |
| 실제/시안 화면 | [69개](screens/screen-checks.json) 통과 |
| 화면 보존 | 선택4개 폭·dialog3개 폭의 총7개 PNG가 직전 기능 구현과 바이트 단위 동일. [비교](screenshots-comparison.json) |

브라우저271은 확인·측정 기록 합계이며 서로 다른 시나리오271개를 뜻하지 않는다. 실제 UI/controller/session/IndexedDB/Web Locks/OPFS를 쓰되 OS picker·권한·실패만 합성 경계다. 개인 자료를 읽지 않고 제품 쓰기·외부 요청0과 sentinel 보존을 확인했다. 최신 실행 주소는 http://127.0.0.1:3010 이었다.

주요 구현·CSS를 보존하는 구조 변경이므로 Lighthouse를 반복해 점수 개선을 주장하지 않는다. 전체 정적 자산786,309 bytes로 직전786,407보다98 bytes 작지만 import/chunk 구성 변화이며 성능 개선 증거가 아니다. 새로 실행한 선택/목록/본문의 CDP 포함 시간은 각 원자료에 기록했다. 실사용 INP·OS picker·실제 로그인·스크린리더는 미검증이다.

## 검토 결과와 한계

독립 architect 검토가83건의 누락0/구경로 파일 잔존0, Next route group과 Provider 수명, 역할 주석의 호출 관계를 확인했다. domain 테스트 경계 누락·미존재 server 폴더 표기·구경로 fixture·빈 폴더 지적을 반영했다. 코드 지도와 새 검증 문서 링크도 점검한다. 초기 quota로 실패한 검토는 승인 근거에 포함하지 않는다.

보완 후 별도 읽기 전용 재검토는 CLEAR(명확한 blocker 없음)로 종료했다. 현재 안내15개 문서의 [링크 검사](link-check.json)는 누락0이다. 이동한 Lighthouse PowerShell wrapper는 경로와 pnpm 실행을 갱신하고 구문 오류0을 확인했으며, 이 구조 변경에서 Lighthouse 자체를 재실행한 것은 아니다.

구조 검사 범위는 현재 상대 import와 명시적인 TS 모듈 참조다. 별칭·동적 경로 계산·새 테스트 도구를 도입하면 규칙도 확장해야 한다. server-only 규칙은 폴더 이름만으로 인증을 보장하지 않는다. 실제 원본 쓰기/AI/로그인은 이번 구조 변경에 포함되지 않는다.
