# 입력 초점과 일반 채팅 응답 표시

후속: 사용자가 테두리 해결과 실제 채팅 약12초/첫 문구 뒤 공백·묶음 표시를 보고했다. 이전120ms 표시와 전체1,206검사는 이 보고 이전 기록이다. 최신 [화면 먼저 표시와 완료 직전 응답 보완](../progressive-chat/README.md)은 공급자 소비/권한 대기를 분리하고 완료까지 frame 표시를 유지한다.

2026-11-09. 사용자는 안쪽 사각형 테두리와 끊기고 느린 응답 표시를 보고했다. 같은 보고에서 이메일·소셜 로그인과 일반 채팅 송수신 성공을 확인했다. 로그인 대기 시간 개선은 최하 순위로 둔다는 지시를 반영해 인증 화면/설정을 추가 변경하지 않았다.

## 변경과 원인

- `composer.module.css`: textarea의 기존 focus outline이 둥근 composer 내부에 사각형으로 겹쳤다. 공통 textarea outline을 없애고 바깥14px 모서리에2px focus-within outline을 둔다. 일반·자료·샘플 입력창이 같은 모듈을 사용한다. 전역 입력 스타일은 유지한다. [초점 관측](browser/focus-metrics.json), [화면](browser/composer-focus-1440.png).
- `chat-session.ts`: 처음 전체 쿠키 세션/작업 공간 검사는 유지한다. 스트림에서는 작업 공간 준비·삽입 시도·전체 연결 구성원 조회를 반복하지 않는다. 서버 snapshot의 정확한 session ID/token/user/만료·로그인 자격·이름·workspace/owner/연결 관계를 같은 짧은 transaction의 caller 설정과 SELECT로 매번 확인한다. 새로운 인증 캐시나 재검사 생략 기간은 없다. token은 서버 안에만 있다.
- `chat.ts`: 공개 검사 시작 기준500→100ms. 각 본문 공개 전 최신 권한 검사는 유지하고 마지막 본문과 completed를 한 검사로 함께 승인한다. 원격 DB 대기만큼 실제 간격이 늘어날 수 있다. 취소·세션 오류 이후 새 본문 공개 금지와 생성 POST 직전 검사는 유지한다.
- `useGeneralChat.ts`/`general-chat-state.ts`/`LiveConversation.tsx`: 실제 받은 본문과 표시 길이를 분리하고 약120ms 동안 requestAnimationFrame으로 표시한다. 원래 SSE 순서는 이벤트별로만 증가한다. 완료는 받은 전문을 확정하고, 중지·세션 오류는 숨은 본문을 버린다. 접근 철회/owner 변경/이탈은 frame과 HTTP를 함께 취소한다. 움직임 감소는 즉시 표시하며 emoji surrogate pair는 분리하지 않는다.

## 실행한 검증

| 검증 | 결과와 경계 |
|---|---|
| 집중 서버/상태 | 5파일28검사 통과. snapshot token 단언 보완 후 초기 guard1검사 재통과 |
| 전체 | 129파일1,206검사 통과, `--maxWorkers=2` |
| 타입·린트·빌드 | 통과, build `Dv01EbfJ8vU5G6qWG0n6H` |
| 서버/구조 경계 | 26 / 25+6+3검사 통과 |
| 실제 UI/합성 SSE | [28검사](browser/checks.json): 초점·IME 이벤트·4너비·본문 중복·frame·중지·단절·세션·접근 철회·reduced motion·자료 왕복. 파일 읽기/쓰기/권한 요청0, inspector FAIL0 |
| 기존 자료/샘플 | 자료 찾기 [51검사](search-regression/browser-checks.json), 정리 답변 [35검사](organization-regression/browser-checks.json), production 샘플 [17검사](sample-regression/browser-checks.json) 통과 |
| 실제 Next 거부 | [5검사](production/route-checks.json): 비로그인·Origin·메서드, 공급자 키 없는 QA 서버 |
| 실제 DB | [존재하지 않는 합성 세션 거부](performance/database-denial.json) 통과. 실제 runtime role/TLS에서 SELECT와 transaction-local context만 실행. 계정·사용량·모델 변경 없음 |
| 재시작 뒤 dev | [6초 관측](dev-login-stability.json): 문서 요청1, HMR reload0, 폼6/6유지 |

사각형 회귀 검사는 변경 전 실패 후 통과했다. reveal 상태 검사도 구현 전 실패 후 통과했다. 기존 자료 찾기 첫 회귀는 미리보기 열기 대기에서 timeout였고 단독 재실행51검사는 통과했다. 원인은 미확정이며 지속 실패로 취급하지 않는다. 실패 원자료는 `.omx/chat-smoothness`에 분리했다. 독립 architect의 읽기 검토에서 차단 보안 문제는 발견되지 않았다. 공식 workflow 승인으로 확대하지 않는다.

## 측정과 남은 범위

[고정 I/O 비용 검사](performance/authorization-fixture.json)는 기존 전체 guard와 새 조회의 실제 함수에 각 외부 작업80ms/transaction 경계40ms를 주었다.560→240ms였고 중복 인증2회와 작업 공간 준비1회를 반복하지 않음을 확인했다. 이는 실제 사용자 속도나 모델 지연 측정이 아니다. [합성 frame 기록](browser/reveal-frames.json)은480자 묶음을 여러 frame으로 중복 없이 표시했음을 보인다. [6경로/전체 정적 자원](performance/routes-assets.json)은 guest/샘플 경로 각3회 관측이며, 보호 경로는 로그인 redirect다. JS/CSS1,729,075→1,730,463bytes,43파일 유지.

실제 인증된 수정 후 스트림의 TTFT/모델·DB 체감 속도, 유효 계정·연결 변경·교차 사용자에 대한 실제 PostgreSQL 조합 행렬, 물리 IME, 배포 프록시/과금 취소는 이번에 추가 검증하지 않았다. DB 합성 거부는 SQL 실행·기본 거부만 증명한다. 기존 관련 단위 테스트·소스 검토를 실제 유효 계정 행렬의 실행 증거로 표현하지 않는다. 원격 지연과 토큰 한도는 남아 있다. 추가 유료 AI 요청·계정 생성·배포·푸시는 하지 않았다.

## 재현

```text
pnpm exec vitest run apps/web/tests/server/chat.test.ts apps/web/tests/server/chat-stream-session.test.ts apps/web/tests/server/chat-session.test.ts apps/web/tests/server/chat-authorization-cost.test.ts apps/web/tests/conversation-workspace/general-chat.test.ts
node tests/browser/check-general-chat.mjs docs/verification/chat-smoothness/browser
node tests/browser/check-document-find.mjs docs/verification/chat-smoothness/search-regression
node tests/browser/check-live-organization-completion.mjs docs/verification/chat-smoothness/organization-regression --reply
```

실제 DB 검사는 `MOA_RUN_CHAT_SESSION_LIVE=1`과 연결 허용 환경에서만 별도 config `tests/database/vitest.chat-session-live.config.mts`로 실행한다. 기본 전체 테스트는 이 opt-in 파일을 실행하지 않는다. 현재3034는 연결 허용 dev 서버이며3035 QA는 종료했다. dev 중 생성 타입을 수동 복원하거나 build/Prisma 재생성을 병행하지 않는다.
