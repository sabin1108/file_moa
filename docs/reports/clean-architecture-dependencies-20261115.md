# 클린 아키텍처 의존성·순수성 검토

검토일: 2026-11-15. 기준: 현재 로컬 소스, 확인 시점 HEAD `2a10c9c`와 소스 해시. 제품 코드 수정 없이 분석했다. 이전 검토의 결론을 현재 코드의 증거로 재사용하지 않았다.

## 결론

`packages/domain/src`의 두 파일에서는 요청한 여섯 종류의 강한 위반을 찾지 못했다. 주요 문제는 기능별 폴더와 서버의 **유스케이스가 구체 저장소·모델·프레임워크 문맥·시각 생성까지 직접 조립하는 지점**이다. 도메인 패키지가 순수하다는 사실만으로 전체 업무 흐름의 의존성 역전이 완성된 것은 아니다.

다만 브라우저 어댑터의 `navigator`, UI 수명 hook의 React, DB 어댑터의 Prisma 사용 자체는 위반이 아니다. 아래에서는 실제 결합, 부분적으로 주입 가능한 경우, 의도된 외곽 의존성을 구분했다. 실행 장애·취약점을 새로 재현한 보고서가 아니라 정적 구조 분석이다.

최종 독립 검토에서는 우선 검토할 문제를 **세 묶음**으로 정리했다: 편집 workflow의 브라우저 capability 직접 참조(V03), 의미 검색·스냅샷의 구체 어댑터 생성(V01–02), 숨은 clock/ID 공급(V05–07). 모듈 limiter 수명(V08)은 낮은 우선순위이며, 프레임워크 간접 의존(V04)과 앱 소유 SSE 계약(C01)은 강한 직접 import/원시 DTO 누수로 세지 않는다. V번호는 증거를 묶은 항목이지 서로 독립적인 제품 오류 개수가 아니다.

## 점검 범위와 판정 기준

- 대상: `packages/domain/src`, `apps/web/src/features`, `apps/web/src/shared`, `apps/web/src/server`의 업무 규칙·유스케이스·모델·순수 유틸리티.
- 제외: `app/` 라우터·Action 구현의 품질 평가, UI 컴포넌트, CSS, 생성 코드, 테스트·fixture, 의존성 내부 코드, 개인 문서. 호출 경로를 입증하는 데 필요한 진입점 참조만 확인했다.
- TypeScript/TSX 328개 파일을 AST로 조사했다. JSX가 있는102개는 UI 후보로 제외했고,226개 비JSX 파일에서 정적 후보를 수집했다. 이226개에는 정당한 UI 수명 hook과 인프라 어댑터도 포함되므로 ‘업무 로직226개’라는 뜻은 아니다.
- 지역 매개변수 `document`와 실제 브라우저 전역을 TypeScript 심볼로 구분했다. 주석·문자열, 타입 전용 import, 입력 날짜 변환과 현재 시각 읽기도 구분했다.
- 의존성 역전: 유스케이스가 필요한 능력을 계약으로 요구하고 구체 구현은 바깥에서 조립하는가.
- 순수성: 순수 규칙의 결과를 바꾸는 시각·식별자·상태가 명시적 입력인가. 유스케이스 전체를 순수 함수로 바꾸거나 필요한 I/O를 없애야 한다는 뜻은 아니다.

## 요청한6개 항목별 결과

| 항목 | 판정 | 핵심 근거 |
| --- | --- | --- |
|1. 브라우저 전역|혼합 유스케이스에서 확인|편집 저장 workflow가 `navigator.userActivation`과 `navigator.locks`를 직접 사용한다. 실제 저장소/Worker 어댑터의 API 사용은 제외했다.|
|2. React/Next 직접 import|순수 업무 규칙의 직접 import는 미확인, 간접 결합은 확인|`organizeLive → requireWorkspace → next/headers·next/navigation`. 직접 import와 전이 의존을 같은 것으로 세지 않았다.|
|3. 외부 라이브러리/구체 구현|구체 어댑터 결합 확인|의미 검색이 IndexedDB 구현을 직접 만들고 모델 controller에 의존한다. 서버 유스케이스도 DB/AI/usage 구현을 직접 조립한다. 지정 예시인 axios/TanStack Query/Zustand/Redux 직접 사용은 없었다.|
|4. API DTO 무매핑 사용|강한 원시 DTO 누수는 미확인, 앱 SSE 계약 결합은 조건부|공급자/DB 객체가 도메인 패키지로 그대로 유입되는 경로는 확인하지 못했다. 앱 소유 `ChatEvent`가 reducer까지 들어오는 결합은 별도로 설명한다.|
|5. 비결정적 요소|확인|공유 요청 검증의 `Date.now()`, 검색 확인의 현재 연도, 작업/이벤트 ID와 시각의 내부 생성.|
|6. 전역 상태|유스케이스 조립 수명 결합 확인, 일부는 의도된 어댑터|서버 사용 사례의 모듈 `quota` 생성/읽기. 탭 인증 bus와 DB client singleton은 별도 평가했으며 도메인 상태 누수로 단정하지 않았다.|

## 우선 검토할 구조·순수성 문제

### V01 — 의미 검색의 사용 사례가 구체 저장소와 모델 controller에 묶임

범주:3의 구체 구현 의존,5의 숨은 시각. 확신도 높음. 순수 규칙 문제가 아니라 유스케이스와 어댑터의 경계 문제다.

- [semantic-source.ts:23](/E:/project/ai_folder_project/apps/web/src/features/local-folders/search/semantic/semantic-source.ts:23)의 `prepareSemanticSource`와 [같은 파일:52](/E:/project/ai_folder_project/apps/web/src/features/local-folders/search/semantic/semantic-source.ts:52)의 `semanticSourceMatches`가 각각 `new LocalTextIndex()`를 실행한다.
- 같은 파일2·6줄은 구체 `LocalTextIndex`와 `SemanticModelController`를 알고,39줄은 `Date.now()`로 저장 시각을 만든다.
- 흐름: `FolderConnectionSession`의 의미 검색 준비/조회 → 위 사용 사례 → IndexedDB 읽기·쓰기 및 모델 Worker controller 호출. 호출자는 `connection-session.ts:1082–1088,1107–1123`에 있다.

원하는 의존 방향은 ‘검색 사용 사례 → 필요한 저장/모델 능력’인데, 현재는 ‘검색 사용 사례 → 브라우저 저장·모델 구현’이다. 대체 저장소/모델로 정책만 검증하려면 모듈 대체나 구체 클래스 형태의 가짜 객체가 필요하다. 모델 controller에 private 필드도 있어 단순 객체가 자동으로 대입 가능한 포트가 아니다.

모델 controller import는 **type-only**이고 실제 객체는 인자로 주입된다. 따라서 모델을 이 함수가 직접 생성한다거나 runtime import가 고정돼 있다고 표현하면 틀리다. 강한 실행 의존은 `LocalTextIndex`의 내부 생성이고, 모델 쪽은 구체 타입에 대한 컴파일 단계 결합이다.

작은 개선 방향은 실제 사용하는 저장 메서드와 `document/score/evidence` 능력, 시각 공급만 바깥에서 전달하는 것이다. 새 범용 저장소 계층이나 모델 서비스가 필수는 아니다. `SemanticModelController` 자체의 Worker·Cache·잠금은 정당한 어댑터 책임이다.

### V02 — 자료 스냅샷 정책과 파일·Worker·색인 I/O가 한 함수에 결합

범주:3의 구체 구현 의존,5의 숨은 시각. 확신도 높음. 브라우저 전역 직접 참조와 플랫폼 타입 의존은 구분한다.

- [source-snapshot.ts:24](/E:/project/ai_folder_project/apps/web/src/features/local-folders/organization/source-snapshot.ts:24)의 `readSourceSnapshot`이 범위·문서/바이트 한도·제외 사유·후보 유지·체크포인트 전이를 계산한다.
- 같은 함수63줄은 시작 시각을 읽고,69–70줄은 `createCopyHasher()`와 `new LocalTextIndex()`를 직접 만든다.97·102줄의 시간 예산과349–364줄의 체크포인트/정리도 같은 흐름에 있다.
- 파일 열거·권한·파일 읽기가 정책 반복문에 들어간다. 호출자는 `connection-session.ts:936,1022`다.

정책 테스트가 브라우저 파일 핸들, Worker 또는 해당 모듈 대체와 함께 움직인다. 이는 코드가 잘못된 결과를 낸다는 뜻이 아니라 정책 변경과 플랫폼 변경의 이유가 같은 함수에 모였다는 뜻이다.

분리하더라도 권한·hash·세대·중단 검사를 유지해야 한다. 이미 외부 입력으로 받는 `assertCurrent/signal`은 유지하고, 열거/본문/색인 접근과 clock만 좁은 능력으로 제공하는 방향을 검토할 수 있다. 파일 전체 재작성은 필요하지 않다.

### V03 — 편집 저장 사용 사례가 브라우저 사용자 활성화와 잠금을 직접 읽음

범주:1. 확신도 높음. 외부 접근만 하는 저장소가 아니라 저장 순서를 결정하는 workflow와 브라우저 어댑터가 섞인 경우다.

- [inline-editor-session.ts:107](/E:/project/ai_folder_project/apps/web/src/features/local-folders/documents/editing/inline-editor-session.ts:107): `InlineEditorSession.save`가 `navigator.userActivation.isActive`를 직접 확인한다.
- [같은 파일:170](/E:/project/ai_folder_project/apps/web/src/features/local-folders/documents/editing/inline-editor-session.ts:170): 후속 저장이 `navigator.locks.request`를 직접 실행한다.
- 같은 메서드가 첫 저장 전 백업, 자동 저장 허용 여부, 기존 baseline·충돌·복구 보관본 검사 순서도 결정한다. 중앙 연결 session이 편집 준비/저장을 이 객체에 위임한다.

따라서 저장 순서의 업무 규칙을 독립 검증할 때도 ambient `navigator`를 준비해야 한다. 사용자 활성화 검증과 배타 잠금 자체는 필요한 안전 장치다. 이를 삭제하거나 미리 캡처한 부정확한 boolean으로 바꿀 것이 아니라, **원래 실행 시점에 검사하는 능력과 잠금 실행 능력**을 전달하는 쪽이 의존성 역전에 맞다.

반례: `executeCopy`는 이미 lock 인자를 받을 수 있다(`copy-execution.ts:26–29`). 기본값에 `navigator`가 남아 있지만 테스트 대체점은 있으므로 같은 강도의 하드 의존으로 세지 않았다. `AiRecordRepository` 안의 File System/Web Locks 사용도 어댑터 책임이므로 이 항목과 구분한다.

### V04 — 정리 사용 사례가 Next의 ambient 요청·페이지 이동 가드에 간접 의존 [조건부]

범주:2의 **간접 프레임워크 결합**,3의 구체 인증 구현 의존. 직접 React/Next import 위반이라는 판정은 하지 않으며, 강한 위반 묶음과 별도인 구조적 관찰이다.

- [live-organization.ts:4](/E:/project/ai_folder_project/apps/web/src/server/organization/live-organization.ts:4)가 `requireWorkspace`를 가져오고,124·244줄에서 `organizeLive` 내부 인증과 재검사에 사용한다.
- [session-guards.ts:3](/E:/project/ai_folder_project/apps/web/src/server/auth/session-guards.ts:3)는 `next/headers`, `next/navigation`을 가져오며,`requireWorkspace`는 현재 요청 헤더와 redirect 동작을 포함한다.
- 흐름: Action 진입 → 정리 사용 사례 → 페이지/요청 가드 → Next 문맥과 인증·DB 구현.

정리 정책이 실행되려면 Next 요청 문맥이 필요하고, 인증 실패를 페이지 이동 예외로 표현하는 어댑터 계약까지 알아야 한다. 현재 `organizeLive`는 이 예외를 catch해 세션 실패로 바꾼다. 이를 실제 보안 우회나 캐시 오류라고 주장하지 않는다.

입력 헤더를 인자로 넘기는 것만으로 완전한 역전이 되지는 않는다. 인증 actor와 최신 권한 재검사 능력을 사용 사례의 계약으로 제공하고 Next의 헤더/이동 처리는 바깥에 두는 것이 경계의 핵심이다. 기존 최신 세션·owner 검사를 약화하면 안 된다.

### V05 — 공유 요청 스키마의 시간 검증이 숨은 현재 시각에 의존

범주:5. 확신도 높음. 순수 입력 검증과 시간 기반 정책이 결합돼 있다.

- [general-chat.ts:27](/E:/project/ai_folder_project/apps/web/src/shared/general-chat.ts:27)의 `chatRequestSchema`가 requestId 검증 중 `Date.now()`를 두 번 읽는다.
- `grounded-chat.ts:10–12`, `search-query.ts:5–7`이 이 필드 검증을 재사용한다. 서버 정리의 `live-organization.ts:53–67`에도 비슷한 시각 창 검사가 있다.
- 일반 채팅 흐름은 브라우저의 시각/UUID 생성 → 공유 schema 검증 → 서버에서 같은 schema 재검증이다. 관련 호출은 `useGeneralChat.ts:98,134–140`, `server/chat/chat.ts:93–103`이다.

같은 값의 검증 결과가 호출 시각에 따라 달라지며, client/server clock도 서로 다른 환경이다. 미래30초·과거5분 창 때문에 기기 시계 차이가 요청 거부 조건에 포함된다. 이는 소스에 드러난 조건이며 실제 기기 시계 오류를 재현한 것은 아니다.

형식 검증과 freshness 정책을 구분하고 정책에 `nowMs`를 명시하는 방향이 맞다. anti-replay·멱등성·비용 제한은 그대로 유지해야 한다. 시계 주입으로 테스트 가능해지는 것과 프로토콜의 client/server 시계 차이를 해결하는 것은 서로 다른 문제다.

### V06 — 검색 확인 규칙이 함수 안에서 현재 연도를 다시 읽음

범주:5. 확신도 높음. 순수 규칙에 숨은 환경 입력이 남은 사례다.

- [document-find.ts:126](/E:/project/ai_folder_project/apps/web/src/features/local-folders/search/documents/document-find.ts:126)의 `confirmFindQuery`가 `new Date().getFullYear()`를 읽어 원래 요청의 상대 연도를 다시 해석한다.
- 같은 파일67줄의 `inferFindRequest`는 이미 `referenceYear`를 받을 수 있다. 그런데 시작/답변 controller도 각각 현재 연도를 읽는다(`document-find-controller.ts:74,80`).
- 영향은 같은 필터의 근거 출처(`period.source`) 계산이 환경에 의존하고 한 흐름이 연말을 넘으면 시작·확인 기준이 달라질 수 있다는 것이다. 확정된 기간 자체가 반드시 바뀐다고 단정하지 않는다.

현재 연도를 쓰는 기능은 필요하다. 한 검색 흐름의 기준 연도를 한 번 정해 각 규칙에 명시적으로 넘기면 된다. 입력값의 `new Date(value)`·`Date.UTC(...)` 변환과 현재 시각을 새로 읽는 동작을 같은 위반으로 세면 안 된다.

### V07 — 작업·이벤트 식별자와 감사 시각을 내부에서 생성

범주:5. 확신도 높음. 비결정적인 작업 실행을 모두 순수화하자는 주장은 아니다.

- [managed-inspection.ts:180](/E:/project/ai_folder_project/apps/web/src/features/local-folders/operations/managed/managed-inspection.ts:180): 준비된 작업 view의 ID를 `crypto.randomUUID()`로 만든다.
- [같은 파일:202](/E:/project/ai_folder_project/apps/web/src/features/local-folders/operations/managed/managed-inspection.ts:202): `managedManifest`가 `new Date()`로 감사 시각을 만든다.
- [copy-execution.ts:39](/E:/project/ai_folder_project/apps/web/src/features/local-folders/operations/copying/copy-execution.ts:39)와58·64줄: 작업 ID, 이벤트 ID, 기록 시각을 실행 함수가 만든다.

이 값은 복구 기록의 연결과 비교에 사용된다. 동일 승인 입력으로 실패 경로를 재생하려면 전역 시계/UUID를 대신 구현해야 한다. 작업 시작 경계에서 식별자·시각 공급을 명시하는 것이 더 작은 분리다. UUID와 감사 시각을 없애거나 고정값으로 바꾸면 안 된다.

### V08 — 서버 사용 사례 안에서 구체 서비스와 모듈 limiter를 조립 [낮은 우선순위]

범주:3의 구체 서비스 결합,6의 모듈 상태·수명 결합. 구조 문제는 확인됐으나 즉시 장애 위험은 제한적이다.

- [search-query.ts:6](/E:/project/ai_folder_project/apps/web/src/server/organization/search-query.ts:6)의 사용 사례는 세션·DB·AI·사용량 구현을 직접 import하고,13줄의 모듈 `quota`를36줄에서 초기화한다.
- 같은 패턴이 `grounded-chat.ts:5–13,48–65`, `live-organization.ts:104,217–238`, `chat/chat.ts`에 있다.
- `createAuthRateLimiter`는 주입 가능한 factory지만 유스케이스 안에서 구체 `getDatabase`와 환경 비밀값으로 조립된다. limiter 내부에는 instance별 cleanup 시각도 있다(`auth-rate-limit.ts:22–55`).

유스케이스의 의존성 목록·생성 시점·외부 설정이 함수 계약에 드러나지 않아 테스트에서 모듈 대체와 초기화 상태에 의존한다. 다만 한도 값은 DB에서 원자적으로 관리되므로 ‘module singleton이라 서버가 여러 대면 한도가 우회된다’는 결론은 틀리다.

유사한 혼합은 `handleChat`의 HTTP/SSE+업무 순서, 계정 연결/삭제의 FormData+인증+DB+메일+캐시,`ai-usage`의 DB 접근+상태/만료 정책에도 있다. 이들을 모두 별도 오류로 세지 않고 같은 조립 책임 문제로 묶었다. 필요한 능력만 바깥에서 조립하는 방향이지, 현재 SQL/트랜잭션을 잘게 쪼개거나 범용 업무 엔진을 추가하라는 뜻은 아니다.

## 조건부 결합과 제외한 오탐

### C01 — 앱 소유 SSE 계약이 reducer까지 도달

[chat-stream.ts:30](/E:/project/ai_folder_project/apps/web/src/features/conversation-workspace/messaging/chat-stream.ts:30)에서 엄격히 검사한 `ChatEvent`가46줄 callback → `useGeneralChat.ts:154` dispatch → `general-chat-state.ts:130,150–161`로 들어간다. reducer가 `generationId/sequence/text_delta`를 직접 안다.

별도 transport mapper가 없다는 결합은 실제다. 그러나 이는 앱이 정의한 공급자 독립 계약이며 reducer 안에서 `ChatTurn`으로 변환한다. 공급자 원본 DTO나 Prisma 행을 도메인 상태에 그대로 보관하는 강한 위반으로 확정할 수는 없다. 전송 방식 변경이 실제 요구가 될 때 내부 event 분리의 이득과 중복 비용을 비교할 대상이다.

따라서 이 항목의 최종 판정은 **요청4번의 강한 무매핑 위반에서 제외**다. Zod 검증만으로 Mapper가 생긴다고 보지는 않지만, 실제 reducer의 필드 투영과 앱이 소유한 계약이라는 점을 함께 반영했다.

### C02 — 탭 인증 이벤트 singleton

`shared/auth-session-events.ts:5–15,18–39`의 signals와 source ID는 모듈 상태다. 소비자가 이 instance를 주입받는 구조도 아니다. 다만 모든 소비자는 client이고 탭 하나의 공동 인증 수명을 전달하려는 브라우저 어댑터다. 실제 계정 간 상태 누출이나 server 공유 상태로 판정하지 않았다. 다중 root/테스트 격리가 필요해질 때 instance 수명을 명시할 대상이다.

### C03 — 이미 주입한 포트가 구체 클래스에서 파생됨

`ai-records-controller.ts:2–4,16–18`의 `Pick<AiRecordRepository,...>`와 `Pick<FolderConnectionSession,...>`,`organization-execution-controller.ts:35–38`의 구체 session 타입은 타입 수준의 바깥 방향 결합이다. 전자는 실제 객체를 주입받으므로 ‘인터페이스/대체점이 전혀 없다’고 표현하면 틀리다. 필요한 메서드 계약을 소비자가 직접 소유할지 검토할 수 있는 낮은 우선순위 항목이다.

### C04 — 변경 가능한 const Set

`workflow-steps.ts:12`의 exported `validWorkflowSteps`는 기술적으로 수정 가능하다. 현재 소비자의 동작은 `has`이며 실제 전역 변경 흐름은 확인하지 못했다. 단순히 `Set`이라는 이유로 확정 전역 상태 오류에 넣지 않았다. UI 단계 정의용 `WorkflowStep` 타입 import도 업무 도메인의 React 의존으로 세지 않았다.

### 확인한 정상 경계

- `packages/domain/src/index.ts`, `local-record.ts`: 외부 import, 브라우저/프레임워크, ambient clock/random, mutable singleton 없음. 입력 날짜의 UTC 검증은 결정적이다.
- `file-change-plan.ts`의 계획 계산,`semantic-record.ts`의 값 검증 등은 입력값과 지역 상태로 계산한다.
- axios/TanStack Query/Zustand/Redux 직접 사용과 `Math.random()` 호출은 감사 대상 소스에서 발견하지 못했다.
- Zod의 순수 검증, node:crypto의 입력 기반 해시 자체를 외부 I/O 또는 비결정성 위반으로 세지 않았다.
- browser-string-store·handle repository·AI record repository·model Worker의 브라우저 접근은 해당 어댑터의 책임이다.
- React hook의 UI 수명 관리, Next cache/session wrapper, DB client의 singleton은 그 자체로 핵심 업무 규칙 위반이 아니다.
- organization 응답은 엄격한 검증/정규화를 거쳐 `organization-operation.ts`에서 `ManagedRequest`로 매핑된다. 인증 session도 명시적으로 projection된다. 도메인 모델을 복제하는 Mapper를 근거 없이 추가할 이유는 없다.
- `parseSignupDraft(raw, now=Date.now())`처럼 시각을 명시적으로 전달할 수 있는 함수는 하드 의존과 구분했다.

## 검토 근거와 한계

EGM0.1.1의 codebase-details Goldfish3개를 `fork_turns=none`으로 분리해 domain/shared, feature core, server 사용 사례를 각각 조사했다. 이후 원문 소스와 반론을 대조하고 별도의 새 문맥 critic이 과잉 판정을 재검토했다. 이는 코드 감사에 맞춘 EGM 방식이며 설계 문서 전체5단계나 자동 수정 workflow를 실행했다는 뜻은 아니다. host 지침/공유 파일 격리도 보장하지 않는다.

정적 후보 수집기는 AST 파싱, 주석/문자열 제외, 지역 `document` 변수 제외, 타입 import, 입력 날짜와 현재 시각을 구분하는 자체 assertion을 통과했다. 후보 수는 위반 수가 아니며, DTO는 이름 검색이 아닌 호출·검증·반환 경로로 판별했다.

원자료: [.omx 검사 범위](/E:/project/ai_folder_project/.omx/verification/clean-architecture-audit-20261115/scope.md), [AST와 소스 해시](/E:/project/ai_folder_project/.omx/verification/clean-architecture-audit-20261115/inventory.json), [독립 검토와 반론](/E:/project/ai_folder_project/.omx/verification/clean-architecture-audit-20261115/goldfish-reviews.md). 기존 미커밋 작업과 개인 문서는 건드리지 않았다.

제품 코드·설정·의존성은 수정하지 않았다. 테스트·빌드·브라우저·DB·AI 실행도 하지 않았다. 따라서 위 결과는 현재 소스의 정적 의존성/순수성 판단이며 런타임 오류, 전체 기능 검증 또는 보안 검증 완료를 의미하지 않는다.
