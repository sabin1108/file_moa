# 녹화 대조: 입력 안내 간격과 실제 응답 지연

2026-11-09. 사용자는 안내 문구의 불규칙한 정렬과 녹화의 응답 대기·본문이 묶여 나오는 문제를 보고했다. 지정 폴더의25.367초 녹화를 로컬에서 직접 읽고 서버의 같은 시점대 단일 성공 요청 기록과 대조했다. 개인 녹화·원문·프레임·브라우저 탭은 공개 산출물에 넣지 않았다. 분석용 로컬 서버와 Chromium만 사용했고 외부 전송·추가 모델 호출은 없다.

## 실제 관측과 확인된 원인

[요청 시간 기록](performance/observed-request.json)의 첫 본문/첫 공개 값은 전송부터의 누적 시간이다. preflight는 초기 인증·workspace·한도 예약까지이며 전체 요청 시간과 구분한다.

| 구간 | 실제 관측 |
|---|---|
| 영상에서 전송 | 약10.5~11초 |
| 영상에서 첫 본문 | 약21.5~22초, 이후 두 묶음으로 늘어남 |
| 서버의 준비 완료 | 전송 후4,544ms |
| 공급자 첫 본문 도착 | 전송 후9,973ms |
| 브라우저로 첫 전송 | 전송 후10,987ms |
| HTTP 요청 | 약12.1초 |
| 스트림 권한 재확인 | 4회 합계3,598ms, 평균약900ms |

정확한 요청 ID·본문을 로그에 저장하지 않아 녹화와 서버 기록은 같은 시점대의 단일 성공 요청을 기준으로 대응했다. 물리 입력 시간은0.5초 간격 프레임으로 범위를 표시했으며 영상의 실제 mediaTime을 확인했다. 재생·seek의 byte range를 지원해 실제 서로 다른 프레임임을 확인했다.

현재 DB 연결의 region 코드는 `ap-southeast-2`다. 이는 [AWS의 시드니 리전](https://docs.aws.amazon.com/global-infrastructure/latest/regions/aws-regions.html)이다. 실제 구성의 runtime role/TLS로 개인 행 없이 SELECT1만 실행한 [왕복 비교](performance/database-roundtrips.json)에서 warm 단일 SQL은220/222/220ms, BEGIN·READ ONLY·SELECT·COMMIT의4왕복 transaction은882/882/884ms였다. 첫 연결 포함 SELECT는1624ms다. 이는 스트림 guard 평균900ms와 일치하는 지연 규모이며 모델의 순수 생성 시간이 아니다.

따라서 첫 대기는 초기 원격 인증·작업 공간·예약의 여러 DB 왕복, 토큰 계산 API, 생성 전 최신 권한, 공급자의 첫 본문 대기가 합쳐진 결과다. 본문 공개 전에도 fresh DB transaction을 기다리므로 글자 표시 frame만 부드럽게 만들어도 약1초 단위 입력 공백은 남는다. 공급자 token-count와 순수 모델 TTFT의 개별 값은 기존 로그에 없어 따로 확정하지 않았다.

## 수정

- `ConversationWorkspace.tsx`/`composer.module.css`: 공통 scope 영역을 추가하고 버튼 텍스트12px 들여쓰기를 제거했다. 안내와 disclosure 사이0→8px, disclosure와 입력 외곽 사이0→12px로 맞췄다. 안내는13px/1.65, 답변 본문과 승인된 전체 디자인은 유지한다. [변경 전 geometry](browser/scope-before.json), [변경 후](browser/scope-geometry.json), [합성 화면](browser/composer-focus-1440.png).
- `chat-session.ts`/`workspace.ts`: 최초 세션을 읽은 뒤 같은 쿠키를 다시 인증하던 경로를 제거했다. 이미 확인한 실제 session user로 서버 전용 workspace helper를 호출한다. 외부의 기존 wrapper는 계속 직접 인증하고, helper의 RLS caller/초기화/대표 소유자/구성원 확인은 그대로다. 새 권한 cache는 없다.
- `auth-rate-limit.ts`: `consumeAll` 성공 시5개 순차 UPSERT를 parameterized multi-row UPSERT1개로 바꿨다. 기존 raw key 순서→position으로 lock 순서를 유지하고 SQL에는 HMAC key만 전달한다. 반환 key 집합이 정확히 모두 일치해야 성공하며 누락 시 재시도 시간을 읽고 transaction 안에서 throw해 전부 rollback한다. 계정·공간10회, 공용 분당1/시간12회, 기존 key·counter·기간·중복/실패/중지 정책과 commit 뒤 정리는 유지한다. 단일 consume 경로도 유지한다.
- 기존 시간 로그에 sessionMs/quotaMs·배치 수/최대 간격/최대 문자 수만 추가했다. 질문·본문·cookie·token·계정·DB host·원본 오류는 기록하지 않는다. 매 공개 전 fresh RLS transaction이나 provider API 계약은 이번에 변경하지 않았다.

5→1은 예약 SQL 수다. 실제 사용자에게 보장하는 속도 배수나 요청 횟수 변경이 아니다. 공개 guard의4왕복을 검증 없이 하나로 합치거나 authority를 캐시하는 변경은 하지 않았다.

## 실행한 검증

| 검증 | 결과/범위 |
|---|---|
| 전체 |129파일1,211검사 통과, typecheck/lint/build 통과. build `ITmPNnzy-4LI1RhOWSqhw` |
| 경계 |서버26/구조25+6+3 통과 |
| 한도 SQL |기존 stateful rollback 회귀와 신규5규칙1쿼리·raw key 미전달 검사 통과 |
| 실제 임시 PostgreSQL17 |schema/RLS25계약 +4파일55통합 검사 통과. 새5검사는 fresh chat session/expired, 독립2pool에서11경쟁10허용·역순입력, 중복1허용, 거부된 count/timestamp 불변·선행 insert rollback, 기간 만료 reset |
| 실제 UI/합성 SSE |[32검사](browser/checks.json): 정렬·간격·IME·4너비·frame·빠른완료·취소·세션·자료왕복·local read/write/permission0·inspector FAIL0 |
| 공유 자료 UI 회귀 |[자료 찾기51](search-regression/browser-checks.json), [정리 답변35](organization-regression/browser-checks.json) 통과 |
| 실제 production |[거부5](production/route-checks.json), [6경로 각3회/History9](performance/routes-assets.json) 통과. 보호 경로는 guest redirect |

간격 회귀는 수정 전 실패 후 통과했다. 임시 DB는 기존 pinned 이미지로 실행하고 검증 후 runner가 소유권 label을 확인해 제거했다. 운영 DB/사용자 원본/실제 한도 counter에 쓰지 않았다. 실제 DB 진단은 별도 opt-in의 읽기 전용 SELECT뿐이다. 독립 architect 읽기 검토에서 차단 correctness/security 문제는 없었다. 공식 workflow 승인으로 확대하지 않는다.

정적 JS/CSS는 마지막으로 측정한 빌드의1,714,956→1,715,365bytes(+409),44파일 유지다. 기준 빌드 뒤에 한도 문구 변경도 있었으므로 이번 CSS만의 비용으로 표현하지 않는다. 실제 인증 경로 INP/heap/운영 부하 측정은 아니다.

## 남은 범위와 재현

수정 후 실제 유료 요청 전체 시간은 재측정하지 않았다. 이번에는 불필요한 DB 왕복을 제거하고 남은 약900ms 권한 조회의 원인을 실측한 상태다. DB 리전 이관, schema/권한/CSRF/Origin 변경, 실제 사용자 세션 조작·한도 초기화·추가 유료 AI·배포·푸시는 하지 않았다. DB와 공급자의 대기는 남으며 이번 변경만으로 즉각 응답이나 전체 끊김 해소를 보장하지 않는다. 물리 IME·외부 원본 경쟁·최종 과금 등 기존 미검증도 그대로다.

```text
pnpm exec vitest run apps/web/tests/server/auth-rate-limit.test.ts apps/web/tests/server/chat-session.test.ts apps/web/tests/server/chat.test.ts
pnpm test:database
node tests/browser/check-general-chat.mjs docs/verification/recording-latency/browser
node tests/browser/check-document-find.mjs docs/verification/recording-latency/search-regression
node tests/browser/check-live-organization-completion.mjs docs/verification/recording-latency/organization-regression --reply
```

`test:database`는 Docker 권한과 기존 pinned PostgreSQL 이미지가 필요하며 운영 env 대신 임시 localhost DB만 쓴다. 실제 네트워크 진단은 `MOA_RUN_CHAT_NETWORK_READONLY=1`과 `tests/database/vitest.chat-network-live.config.mts`를 명시한 경우에만 실행된다. 기본 전체 테스트는 실제 DB/모델을 자동 호출하지 않는다.
