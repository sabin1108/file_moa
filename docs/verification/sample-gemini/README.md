# Gemini 가상 샘플 연결 검증 — 2026-11-07

로컬 `/demo`의 준비된 제안과 실제 Gemini 제안을 구분해 연결했다. 사용자 등록 `apps/web/.env.local`의 `GEMINI_API_KEY`를 서버에서만 사용한다. 외부 배포·유료 전환·개인 파일 AI·일반 PDF/XLSX 파서는 이번 결과가 아니다.

## 변경 이유와 읽을 순서

1. [명세](../../specs/ai-classification.md) AIC-009~012: 허용 자료/동의/한도/늦은 응답 계약.
2. `apps/web/src/shared/{ai-classification,sample-ai}.ts`: 검증된 공통 결과와 오류 계약.
3. `app/actions/sample-ai.ts` → `server/sample-ai.ts`: 서버 세션/Origin, 엄격한 ID 입력, 등록부 발췌, 원자 예약.
4. `server/auth-rate-limit.ts`: 기존 단일 consume의 SQL/실패 처리를 유지하고 정렬된 여러 키의 consumeAll 트랜잭션 추가. 호출 중 DB 트랜잭션은 종료되어 있다.
5. `server/gemini-classification.ts`: 표준 fetch의 countTokens/구조화 생성, 64KiB/완료 사유/의미 관계 검증. 모델 `gemini-3.5-flash-lite` 하나, 새 SDK/패키지 없음.
6. `features/sample-workspace/{lib/sample-state,store/sample-workspace-store,components/SampleWorkspace,components/SamplePlanReview}`: 제안·사용량만 보관, 준비/실제 구분, 선택별 동의, 대기/오류/취소/늦은 결과, 공통 계획 검토 재사용. 페이지가 action을 주입하므로 feature→app 역방향 의존을 만들지 않는다.

## 실행과 실패 수정

- 최초 새 adapter/service 테스트는 모듈 부재로 실패한 뒤 구현했다. 관련 초기 19개 통과. 추가 store 검사는 준비/실제 구분, 저장/복원 무재호출, 중복 클릭, 취소/초기화/만료/unmount 후 늦은 결과, 오류 비자동대체를 확인했다.
- 검토에서 요청 UUID를 먼저 별도 예약하면 거부된 요청의 행/청소 쿼리가 늘고 부분 차감될 수 있음을 발견했다. 롤백 회귀를 추가해 `consumeAll` 부재 실패→공통 SQL 예약을 한 트랜잭션으로 묶음→통과. module 단위 limiter는 정리 시간을 보존한다. 한도 거부는 이전 키의 변경까지 롤백하고 청소를 실행하지 않는다.
- 실제 DB opt-in 1개: 가상 키만 사용해 뒤 규칙 거부 3회에도 기존 세 행의 count=1 유지, 두 limiter의 동시 네 요청에서 허용 정확히 2개, 거부된 request ID 행 부재를 확인했다. 해당 검증의 HMAC 키만 삭제했다. 계정/Workspace/파일은 변경하지 않았다.
- 선택/전체선택/초기화 때 동의를 해제하고 정렬한 선택 집합에도 묶었다. 브라우저에서 선택 A→B→A에도 새 동의 전 실제 AI 버튼이 비활성임을 확인했다.
- 로컬 인증503은 서버 재시작만으로 해결되지 않았다. 비밀값 없는 실제 handler 검사에서 Prisma `EACCES`를 확인했고, 동일 코드/환경에서 네트워크가 허용된 실행은 HTTP200/null이었다. 최종 서버/브라우저도200/null. 인증 보호 코드·DB 권한/TLS 설정은 완화하지 않았다. 과거 ‘오래된 서버’ 가설은 최종 원인으로 채택하지 않는다.

## 최종 검증

빌드 `NsUv5uM2RMWWZsXvCJRuo`, 로컬 Next production, Chromium headless. 단위/브라우저/실제 DB/모델 결과의 분모는 서로 다르다.

| 검사 | 결과 |
| --- | --- |
| 전체 Vitest (`--maxWorkers=4`) | 763개 / 83파일 통과 |
| 타입·lint·build | 통과, lint 경고0, 50페이지 생성 |
| 서버 경계 / 구조 | 21 / web25·domain6·layout3 통과 |
| 기존 샘플·동의 브라우저 | 37개 통과, 390/768/1440/1920px, 실제 파일/탭/복원/목적지/합성IME/정식접근보호 포함 |
| 실제 Gemini 브라우저 | 9개 통과, 동의→실제 제안→검토, 새로고침 재호출0, 가상 원위치 유지, 모바일 overflow0 |
| 실제 DB 예약 | opt-in 1개 통과, 뒤 거부의 전체 rollback·동시 상한·추가 행 부재 |
| 클라이언트 비밀값 | 정적41파일에서 등록 API키 일치0, `.env.local` Git ignore 확인 |

실제 모델 생성은 총 **2회**다. 매번 MD/PDF/XLSX 공개 샘플 3개의 **이름·검증 발췌**만 전송했다. 원본 바이너리 전송이나 일반 문서 파싱 검사가 아니다.

| 호출 | 소스 상태 | 완료 | 입력/출력/전체 토큰 |
| --- | --- | --- | --- |
| 첫 연결 | 원자 예약 보완 전 `c4-J-SrlVMCyjLi8j-f8z` | 4283ms | 428 / 182 / 610 |
| 최종 연결 | `NsUv5uM2RMWWZsXvCJRuo` | 3251ms | 428 / 189 / 617 |

두 요청 모두 회의 문서·인수인계 PDF→업무/회의, 학습표→학습 제안을 반환했다. 이는 세 샘플의 연결/응답 유효성 증거이며 전체 정확도나 holdout 평가가 아니다. 실제 provider429/차단/타임아웃은 강제로 발생시키지 않고 mock 실패 테스트로 검증했다. 생성 요청을 자동 재시도하지 않았다.

## 재현

일반 검사는 실제 키/네트워크 없이 실행한다.

```powershell
pnpm exec vitest run --maxWorkers=4
pnpm typecheck
pnpm lint
pnpm test:boundaries
pnpm test:structure
pnpm build
pnpm start
node tests/browser/check-sample-workspace.mjs
```

아래 두 검사는 별도 명시 opt-in이다. DB 검사는 가상 한도 행을 생성/정리하고 Gemini는 호출하지 않는다. 브라우저 live 검사는 클릭된 1회의 실제 샘플 요청을 보내므로 무료 한도와 서버 전역 한도를 사용한다.

```powershell
$env:MOA_RUN_SAMPLE_QUOTA_CHECKS='1'
pnpm exec vitest run --config tests/database/vitest.sample-ai.config.mts --maxWorkers=1
node tests/browser/check-sample-gemini-live.mjs --allow-live
```

키를 가진 Google 프로젝트의 결제 설정/계정별 quota는 키 메타데이터 조회만으로 확인할 수 없다. 사용자 Free 프로젝트 준비를 전제로 했고 결제 설정이나 모델 대체를 자동 변경하지 않았다. 배포하려면 운영 서버 비밀값 등록·프로덕션에서 세션/DB/한도/로그를 다시 확인해야 한다. 로컬 env는 배포 환경으로 자동 전달되지 않는다.

원자료: [첫 실제 응답](first-live-result.json), [최종 실제 응답](live-result.json), [실제 UI 검사](live-checks.json), [브라우저37 검사](../sample-workspace/browser/checks.json), [비밀값 검사](client-secret-check.json), [성능](performance.md). 화면은 review-1440.png/review-390.png와 기존 sample-workspace/browser에 있다. HTTP/DB 응답의 민감값·키·에러 원문은 보관하지 않았다.

공식 근거: [모델](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite), [무료/유료 정책](https://ai.google.dev/gemini-api/docs/pricing), [구조화 출력](https://ai.google.dev/gemini-api/docs/structured-output), [v1beta 요청 스키마](https://generativelanguage.googleapis.com/$discovery/rest?version=v1beta), [Thinking](https://ai.google.dev/gemini-api/docs/thinking). 실제 키의 모델 메타데이터는200·generateContent/countTokens 지원을 확인했다.

물리 IME·실제 디스크/권한창·로그인 사용자의 정식 자료 통합·여러 배포 프로세스 부하·실사용 INP·무료 계정의 요금청구 설정은 검증하지 않았다.
