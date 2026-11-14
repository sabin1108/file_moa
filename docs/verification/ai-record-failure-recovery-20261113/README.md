# AI 기록의 목록·삭제 실패 복구 수정

2026-11-13. 사용자에게 전달된 두 재현 버그와 현재 상태 문서 불일치를 수정했다. 기존 미커밋 구조 개편은 보존했다. 커밋·푸시·배포·운영 DB·유료 AI 호출은 수행하지 않았다.

## 문제와 바뀐 흐름

### 불완전한 기록 하나가 정상 목록을 막던 문제

이전에는 빈 기록 폴더·메타데이터 오류가 `list()` 전체 실패로 이어지고 controller가 정상 기록까지 빈 목록으로 바꿨다. 이제 [repository.list](../../../apps/web/src/features/ai-records/storage/ai-record-repository.ts)는 정상 `records`, 개별 `unreadable`, 기존 삭제를 재개할 `pendingDeletes`를 구분한다. 정상 기록은 표시하고 읽지 못한 수를 알린다. 손상된 파일은 자동 수선하거나 삭제하지 않는다.

owner manifest 검증은 개별 기록의 오류를 분류하는 catch 바깥에 둔다. 기록 내부의 명시적인 형식·해시·revision 오류만 격리한다. 읽기 권한·연결 세대·소유권·알 수 없는 I/O 오류는 계속 전체 실패로 처리한다. 잘못된 UTF-8은 디코딩 경계에서 식별해 개별 기록 오류로 분류한다.

### 부모 대화를 지운 뒤 연관 삭제를 재시도하지 못하던 문제

기존 `cascade:true` 삭제 표식을 재개 근거로 사용한다. 새 작업 원장이나 DB 스키마는 추가하지 않았다. [controller.refresh](../../../apps/web/src/features/ai-records/ai-records-controller.ts)는 목록에 남은 삭제를 이어 가고 다시 목록을 확인한다. 부모 대화가 화면에서 이미 빠졌어도 같은 삭제 확인 버튼으로 남은 작업을 재시도할 수 있다. 다시 읽기·재연결·새 controller에서도 파일의 표식을 확인한다.

삭제 표식은 썼지만 실제 디렉터리 제거가 실패한 기록도 재개 대상이다. 파생 기록은 [resumeDelete](../../../apps/web/src/features/ai-records/storage/ai-record-repository.ts)에서 대화 잠금→기록 잠금 순으로 잡고, 최신 버전의 원본 대화 참조와 유효한 cascade 표식을 다시 검사한다. 목록을 읽은 뒤 다른 탭에서 참조를 제거한 새 버전을 저장했다면 보존한다. 이미 시작한 삭제 범위를 묵시적으로 확대하지 않는다.

삭제 쓰기만 실패했지만 읽기는 가능한 경우 정상 목록과 경고를 유지한다. 이후 읽기 권한이나 소유권 검증도 실패하면 보호된 목록을 비운다. 참조를 판별할 수 없는 손상 기록은 자동 삭제하지 않고 경고한다.

## 문서와 비용 정책

[README](../../../README.md), [PRD](../../PRD.md), [AGENTS](../../../AGENTS.md)의 초기 환경·AI 후속 설명을 현재 코드와 맞췄다. 과거 설계 결정은 날짜가 붙은 기록으로 보존했다. 구현 경로·합성 검증·과거 실제 실행·현재 운영 검증을 구분했다. [전체 코드 흐름 설명서](../../모아_전체_코드_흐름_설명서.md)의 19-6절과 [로컬 기록 계약](../../specs/workspace-nine.md)에도 새 흐름을 반영했다.

정식·데모 AI의 전역 60초 1회·3,600초 12회 공유는 [기존 비용 보호 정책](../../architecture.md)으로 유지했다. 이 작업에서 상한을 높이거나 분리하지 않았다. 같은 DB·서버 비밀값 환경에서 데모가 정식 요청을 제한할 수 있다는 제약을 README·PRD에 명시했다.

## 최초 수정 검증

| 검사 | 결과 |
|---|---|
| 새 동작 테스트를 먼저 실행 | 구현 전 두 파일에서 17 실패·7 통과. 새 반환 계약과 실패 복구 조건을 먼저 고정 |
| 기록 기능 집중 검사 | 6파일·40테스트 통과 |
| 전체 `pnpm check` | 154파일·1,354테스트, Prisma 검증, 타입 검사, 린트, 서버 경계26, 구조32+6+3, Next 빌드 통과 |
| 실제 제품 UI·격리된 브라우저 OPFS | 35검사 통과. 빈 폴더/빈 JSON 경고·정상 기록 유지·삭제 실패·새로고침 재개·같은 삭제 버튼 재클릭·계정 전환 포함 |
| S0 모듈 연결 | 168개 모듈과 브라우저 export 검사 통과 |
| 독립 코드 리뷰 | 목록·삭제·connect/reconnect 범위의 정적 리뷰에서 수정할 중대한 문제 없음 |
| 코드 설명서 | 30장·이동 표식31·로컬 링크474·원문 발췌20 통과 |
| README·PRD·기록 계약 링크 | 로컬 링크48개 누락 없음 |

최초 수정 검증은 기존 1,332개에 회귀22개를 더한 1,354개였다. 과거 검토용 `.omx/verification/ai-records-bug-repro-20261113.test.ts`는 버그 발생을 성공으로 확인하던 일회성 파일이다. 수정 후 자동 회귀 검사와 섞이지 않게 내용은 보존하고 `.repro.ts`로 이름을 바꿨다. 제품 회귀 검사는 `apps/web/tests/ai-records`에 둔다.

브라우저 원자료는 `.omx/verification/ai-records-failure-fix-20261113/browser/records-checks.json`이다. 실제 제품 컴포넌트와 OPFS를 사용하고 SSE 응답·권한 실패를 합성했다. 유료 모델 생성은 없다.

## 리뷰할 파일 순서

1. [repository](../../../apps/web/src/features/ai-records/storage/ai-record-repository.ts): 개별 오류 분류, 소유권 경계, 표식 기반 삭제 재검사.
2. [record-store](../../../apps/web/src/features/ai-records/storage/record-store.ts): 디코딩 오류의 명시적 분류.
3. [controller](../../../apps/web/src/features/ai-records/ai-records-controller.ts): 조회·재개·재조회와 실패 상태 게시.
4. [기록함](../../../apps/web/src/features/ai-records/library/AiLibraryPanel.tsx), [기억 조회 호출자](../../../apps/web/src/features/conversation-workspace/LiveConversation.tsx): 재시도 안내와 새 목록 반환형 연결.
5. [repository 테스트](../../../apps/web/tests/ai-records/storage/ai-record-repository.test.ts), [controller 테스트](../../../apps/web/tests/ai-records/ai-records-controller.test.ts), [브라우저 검사](../../../tests/browser/check-ai-records.mjs).

## 한계

실제 개인 폴더·Windows 파일 시스템 장애·운영 DB·실제 OAuth/비밀번호 변경·유료 공급자 호출을 재실행하지 않았다. 브라우저 쓰기 실패와 탭 간 최신 관계 재검사는 각각 OPFS 실패 주입과 메모리 저장소로 검증했다. 외부 프로그램과의 완전한 파일 시스템 트랜잭션을 보장하지 않는다. 원본 자료 폴더를 자동 정리하는 범위로 확장하지 않았다.

삭제 표식 자체가 손상된 경우에는 기존 의도를 추측해 자동 삭제하지 않는다. 읽지 못한 기록으로 안내하고 파일을 보존하며 별도 수동 복구가 필요하다.

기존 인증 점검의 CSP 부재와 운영 세션 무효화 미검증은 이번 기록 버그 수정의 완료 범위에 포함하지 않는다.

## 후속 UX 수정 — 저장 뒤 미해결 경고 유지

정상 기록을 저장하면 기존 `save()`가 `notice:null`로 덮어 아직 남아 있는 손상 기록 경고도 지웠다. 저장소 경고를 `storageWarning`으로 별도 보관하고, 저장 성공 시 이 경고를 다시 표시하도록 했다. 일시적인 저장 오류는 재시도 성공으로 해제할 수 있고, 저장소 경고는 목록 재검증 결과에 따라 갱신한다. 연결 종료와 전역 조회 실패 때는 이전 경고를 초기화한다. 다른 폴더 선택을 취소해도 현재 경고를 유지한다. 저장마다 전체 목록을 다시 읽는 작업은 추가하지 않았다.

구현 전에 ‘정상 저장 뒤에도 손상 경고 유지’ 회귀가 실패하는 것을 확인했다. 경고 유지·깨끗한 재조회 뒤 해제, 일시적 저장 오류 뒤 성공한 재시도, 폴더 선택 취소의 회귀3개를 추가했다. 격리된 실제 브라우저 OPFS에서도 불완전한 기록2개를 남기고 대화 초안 자동 저장을 완료한 뒤 경고 유지와 파일 잔류를 확인했다.

후속 검증: 전체154파일·1,357테스트, Prisma 검증·타입·린트·서버 경계26·구조32+6+3·Next 빌드, 브라우저36검사 통과. 코드 설명서 링크474개·실제 발췌20개도 통과했다. 브라우저 원자료는 `.omx/verification/ai-record-warning-lifetime-20261113/browser/records-checks.json`이다. S0 graph는 이 후속 UI 상태 수정에서 재실행하지 않았다.

사용자가 지정한 `.omx/verification/vidlab-egm-review-20261113/COMPARISON.md`는 참고 자료로 읽었다. 이 파일은 이번 수정 전 경고 소실을 관찰한 기록으로 보존했다. CI·PR·배포 정책 변경이나 EGM 재실행으로 범위를 확대하지 않았다.

## 후속 한도 경계 수정

이후 독립 검토에서 확인한 기록501개와 대화501turn 문제는 [별도 수정·검증 보고서](../record-limits-repair-20261113/README.md)에 기록했다. 신규 생성500개 상한과 최대501개 복구 창, 요청/저장 공통500turn, 명시적 미저장 전환 및 같은 대화 재선택 보호를 추가했다. 후속 전체1,380테스트와 기록 브라우저46검사 결과는 해당 보고서를 따른다.
