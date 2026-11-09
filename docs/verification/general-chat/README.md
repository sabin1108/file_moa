# 일반 채팅 실시간 스트림

후속: 사용자가 로컬 로그인 두 방식과 일반 채팅 송수신 성공을 확인했다. 입력 초점과 끊기는 표시 개선의 최신 소스·수치는 [후속 검증](../chat-smoothness/README.md)을 따른다. 아래500ms와1199검사는 첫 구현 시점의 기록이다.

2026-11-09. 사용자가 생성 도중부터 답변을 보며 작업이 진행되고 있다는 신뢰를 얻는 방식을 선택했다. 기존 채팅 지면·자료 작업·공통 입력창을 재사용하고 일반 채팅 전용 전송 경로를 연결했다. 구현 범위는 자료 없는 일반 대화이며 대화 영구 기록·자료 근거 대화·실제 작업물 파일 생성은 전체 계획의 후속이다.

## 동작과 읽을 순서

1. `features/conversation-workspace/components/LiveConversation.tsx` → `hooks/useGeneralChat.ts` → `lib/general-chat-state.ts`: 일반 대화를 기본 표시하고 폴더 없이 질문한다. reducer가 초안·질문·부분 답변·완료·중지·오류를 관리한다. 최근 완료된 대화 최대3쌍만 다음 질문에 포함하며 미완료는 제외한다. 자료 작업 왕복에서도 hook과 스크롤 ref를 유지한다.
2. `services/chat-stream.ts` → `shared/general-chat.ts` → `shared/sse.ts`: 같은 origin의 고정 `POST /api/chat`만 허용한다. 단 한 번의 요청에서 UTF-8·SSE 경계·JSON·세대 ID·연속 순서·종단을 검증한다. 자동 재전송은 없다.
3. `app/api/chat/route.ts` → `server/chat.ts` → `server/chat-session.ts`: Origin·현재 세션·실제 작업 공간·strict 입력·공급자를 검증한다. 새 Headers 객체로 요청 memoization 재사용을 피하고 실제 세션 ID·로그인 사용자·소유자·만료를 비교한다. 기존 원자 요청/계정/작업 공간/전역 한도를 함께 예약한다. 모델 대기 중 DB 트랜잭션을 유지하지 않는다.
4. `server/chat-generation.ts`: 기존 OpenAI/Gemini 모델·fetch·토큰 한도를 사용한다. 토큰 계산 후 생성 POST 직전 콜백으로 세션을 다시 확인한다. 공급자별 원본 스트림을 최소 텍스트/완료 이벤트로 정규화하고 정상 완료·최종 본문·사용량을 확인한다. OpenAI는 store:false, 도구 없음이며 공급자 대체·자동 재시도는 없다.
5. `server/chat.ts`는 약500ms 이상 쌓인 텍스트 배치를 권한 재검사 뒤 내보낸다. 정상 완료만 completed로 확정한다. 빠른 공급자 실패 전의 버퍼도 권한이 유효하면 미완료로 보존한다. 클라이언트/응답 reader 취소는 upstream AbortSignal까지 전달한다. 이미 소비한 비용이나 알 수 없는 최종 사용량을 0으로 확정하지 않는다.
6. 기존 `LiveConversation`의 자료 UI는 `MaterialConversation.tsx`로 옮겼다. 찾기/정리 controller·원본 재검사·전송 동의·실행 검토를 유지하며 일반 질문에 자동 파일 IO를 붙이지 않는다. 파일 실행 중 모드 전환은 막는다. `ConversationWorkspace`는 본문 변화에 따른 follow와 읽던 위치 ref, 완료/미완료 표시만 확장했다.

사용자 행동부터 반환과 화면 변화까지의 상세 읽기는 [코드 안내](../../코드_이해하기.md)의 마지막 절을 따른다. 계약은 [GC-001~008](../../specs/general-chat.md)이다. 새 의존성·DB schema·lockfile 변경은 없다.

## 실패와 보완

- SSE 파서, 서버 경계, 공급자 스트림, reducer의 구현 전 모듈 부재 실패를 확인한 뒤 구현했다. 파서는 한글 바이트 분할·여러 data 행·CRLF·누적 크기·잘린 프레임·취소/reader 정리를 다룬다.
- 제한된 독립 architect 검토에서 토큰 계산 뒤 세션 장벽과 빠른 오류 때의 부분 버퍼 보존 누락을 발견했다. 생성 직전 콜백 및 fresh flush를 넣고 두 번째 모델 요청 차단/부분 답변→오류 회귀를 추가했다. 재검토상 두 차단점 CLEAR이며 공식 합의/배포 승인으로 부르지 않는다.
- 요청 시작45초 deadline에서 생성 예산을 계산하며 생성은 최대25초·세션 만료 중 짧은 값을 사용한다. 본문 읽기는10초, route 최대 실행 설정은60초다. 인증/DB 조회 자체의 즉시 취소 및 실제 배포 한도는 미측정이다.
- 브라우저 초기 실행에서 fixture 준비 대기와 Shift+Enter의 CDP text 전달이 부족한 검사 오류가 있었다. 실제 입력 이벤트에 맞춰 검사만 수정했고 제품 입력 규칙을 약화하지 않았다. 초기 실패 JSON은 비공개 `.omx/general-chat`에 보존했다.
- 스크롤 ref prop 이름은 React lint가 ref로 인식하도록 `scrollMemoryRef`로 정했다. lint 예외를 추가하지 않았다.

## 실행한 검증

| 검사 | 결과 | 실제 실행 범위 |
|---|---:|---|
| 전체 단위·상태·서버 회귀 | 127파일 1,199개 통과 | 모의 공급자/세션/예약, 실제 유료 호출 없음 |
| 타입·린트 | 통과 | 경고 없음 |
| 서버 통신/기능 구조 경계 | 26 + 25/6/3 통과 | 실제 ESLint 설정의 허용/거부 예제 |
| 최종 production build | 통과 | iNe_C3eWemXo7DcROYjYG |
| 일반 채팅 브라우저 | [22개](browser/checks.json) 통과 | 실제 제품 UI/hook/reducer/fetch/SSE, fixture HTTP/소유자 |
| 기존 자료 찾기 | [51개](search-regression/browser-checks.json) 통과 | 실제 controller/session/Worker/합성 OPFS |
| 기존 정리 답변/검토 | [35개](organization-regression/browser-checks.json) 통과 | 모의 AI·합성 OPFS, 기존 동의/실행 경계 |
| 실제 Next HTTP 거부 | [5개](production/route-checks.json) 통과 | 비로그인401, 다른/없는 Origin403, GET/PUT405. 키·로그인 cookie 없음 |
| 경로·Next History·자산 | [9개](performance/routes-assets.json) 통과 | 6경로 각3회, 보호 경로는 guest redirect |

브라우저에서는 완료 전 텍스트 표시, 완료 전문 중복 없음, 중지 HTTP 취소, 미완료/단절/순서 오류, 명시 재제출, 계정 철회 정리, 자료 모드10회 왕복의 초안·답변·읽던 위치, 합성 IME Enter/Shift+Enter, 390/768/1440/1920 가로 넘침을 확인했다. 로컬 파일 읽기·쓰기·권한 요청0건이다. App inspector FAIL0이며 경고는 모바일의 기존 여백과 큰 대화 읽기 면이다. 빈 곳을 장식 데이터로 채우지 않고 기존 승인 구성을 유지했다. 이미지5개는 직접 확인했다.

## 성능과 한계

같은 세션에서 변경 전 빌드1UMqoUFDQV2YwJsNccyDZ의 전체 JS/CSS1,718,378bytes/43파일을 보존했다. 최종 빌드는1,729,075bytes/43파일로 +10,697bytes다. 이 값은 전체 정적 산출물이며 메인 경로의 초기 전송 증가나 사용자 속도 개선량이 아니다. 경로별 각3회 로컬 수치는 위 JSON에 남겼다. 실제 로그인 채팅 TTFT·운영 DB 지연·real-user INP·heap·동시 부하는 미측정이다.

이번 실제 모델 호출·개인 파일 전송·원본 변경·커밋·푸시·배포는0건이다. 일반 채팅의 실제 운영 계정/공급자 전체 여정, 배포 프록시의 buffering/취소 전달, 물리 IME·실제 Windows 권한은 검증하지 않았다. 실제 과금·토큰 정산 원장과 대화 저장/복원은 후속이다. 기존 전역1분1회/시간12회와 계정·작업 공간별 시간3회 한도는 정리와 공유하며 화면 안내에 표시했다.

## 재현

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm test:boundaries
pnpm test:structure
pnpm build
node tests/browser/check-general-chat.mjs
node tests/browser/check-document-find.mjs docs/verification/general-chat/search-regression
node tests/browser/check-live-organization-completion.mjs docs/verification/general-chat/organization-regression --reply
node tests/browser/check-general-chat-route.mjs http://127.0.0.1:3035
node tests/browser/check-workspace-route-cost.mjs http://127.0.0.1:3035 docs/verification/general-chat/performance docs/verification/general-chat/performance/before-assets.json
```

마지막 두 검사는 모델 키를 비운 별도 Next production 서버를 사용했고3035 검증 서버는 종료했다. 기존3034 주소는 세션 말미 확인에서 응답하지 않아 개발 서버를 새로 실행했으며 health200을 확인했다. 사용자 서버를 강제 종료하지 않았다. dev 시작이 만든 next-env 타입 참조 변경은 기존 production 참조로 복원했다. 일반 검사를 실제 유료 모델 평가로 자동 확대하지 않는다.

후속 정정: 위 health200 확인만으로 개발 모드 로그인 화면의 안정성을 확인한 것은 아니었다. 이후 HMR hash mismatch 반복을 실제 브라우저에서 재현하고 개발 서버 재시작 후 새로고침0·폼 유지6/6을 확인했다. 현재 next-env는 Next가 만든 dev 타입 참조를 그대로 유지한다. [재현과 복구 기록](../dev-login-stability/README.md)이 현재 개발 서버 상태에 우선한다.
