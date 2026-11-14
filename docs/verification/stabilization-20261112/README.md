# 데모를 보존하는 검증과 안정화

후속 2026-11-12: 사용자 허용으로 이전 시안 정리를 실제 적용했다. 아래 삭제 실행 차단은 허용 전 기록이다. 파일78개 제거·검사2개 파일 이관·데모 보존·삭제 후 검증은 [시안 정리 보고서](../prototype-retirement-20261112/README.md)를 따른다. 이 정리가 아래 장기 메모리 관찰의 미확정 원인을 해결한 것은 아니다.

2026-11-12. 사용자는 소개 페이지 피드백을 나중으로 미루고 검증·안정화와 불필요 파일 정리를 허용했다. 데모와 향후 데모 개선 가능성을 보존한다. 시작 기준은 `main / 1c72e57`, 작업 트리 clean이었다. 아래는 이번에 새로 실행한 결과이며 과거 Windows 검증과 구분한다.

## 수정한 내용과 이유

1. `apps/web/tests/server/auth-config.test.ts`: 설정 거부를 검사하면서 실제 Better Auth SDK를 동적으로 로드해 최초 전체 실행에서 한 사례가5000ms를 넘겼다. 단독7개와 병렬2개 제한 전체1332개는 통과했다. 제품 보안 오류로 단정하지 않고, 설정 거부의 책임에 맞춰 SDK 생성 함수와 Prisma adapter를 대체했다. 모든 잘못된 origin/짧은 secret에서 인증 SDK와 DB가 호출되지 않는 검증을 추가했다. 제한 시간과 제품 인증 코드는 유지했다.
2. `tests/browser/check-sample-workspace.mjs`: 소개 페이지 도입 전의 즉시 데모 진입을 기대하던 검사를 소개→체험 경유로 맞췄다. Next.js의 문서화된 HTTP/스트리밍 meta redirect를 모두 검사하되 비로그인 응답에 실제 파일 목록이 없는지도 확인한다. 인증 대기 화면의 공통 셸은 보호 데이터로 오인하지 않는다. 결과 경로를 인자로 받아 과거 보고서를 덮지 않는다.

설치된 Next.js 근거는 `apps/web/node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md`다. 제품의 인증 guard, 검색 시간 상한, 전송 동의, 한도는 바꾸지 않았다.

## 새로 실행한 결과

| 검사 | 결과 | 조건 |
| --- | --- | --- |
| `pnpm check` 수정 후 기본 실행 |154파일1332테스트, Prisma schema·타입·린트·서버경계26·구조25+6+3·production build 통과|실제 DB·모델 통합 성공을 뜻하지 않음|
| 자료 찾기 |55개 통과|기존 timeout과 같은 코드·상한, 격리 단독 브라우저 실행|
| 기록 저장·재열기·계정 격리 |29개 통과|실제 UI/repository/OPFS, 합성 소유자와 SSE|
| 파일 관리·복사 |32개·22개 통과|합성 권한, 실제 제품 엔진과 OPFS|
| 복구·중단 후 재개 |43개·35개 통과|합성 핸들/변경·실패, 원본과 보존본 검사|
| 일반 대화·근거 대화 |40개·22개 통과|합성 스트림, 새 유료 모델 호출 없음|
| 위키·로컬 OCR |16개·12개 통과|실제 로컬 Worker/OCR, 합성 문서|
| 데모 |40개 통과|로컬 production, 소개 경유·PDF/XLSX·계획·되돌리기·탭 분리·접근 보호|
| production HTTP |12개 통과|공개/공유 소개·샘플 세션·자료·로그인·정식 파일 보호|
| S0 모듈 그래프 |168모듈 로드와 브라우저 export 통과|동적 진입점·환경 파일404, 개인 폴더 선택 없음|
| 관련 계약 재검사 |4파일23개 통과|auth config·sample route/session·onboarding|

브라우저 합계346개와 HTTP12개는 서로 다른 실행 층이다. 단위 테스트 수나 실제 장치 시나리오 수와 합쳐 보고하지 않는다. 샘플 쿠키는 새 합성 값으로 요청 메모리에서만 사용했고 결과에 저장하지 않았다. 자료 찾기의 과거 병렬 실행 timeout은 이번 단독 검사에서 재현되지 않았다. 시간 상한을 늘리거나 자동 재시도를 추가하지 않았다.

## 실제 시간 장기 관찰

실제 경과60분12.9초 관찰을 완료했다. 새 격리 origin에서 실제 제품 UI와 기록 저장소에 합성100/500 turn을 저장하고 매 분 파일/채팅10회 왕복과100→500 turn 재열기를 수행했다. 총600회 왕복·120회 재열기 동안 초안을 유지했고 모든61개 표본의 대화 article1000개·화면 요소8293개가 같았다. `error`/`unhandledrejection`과 관측한 전송은0건이다. fixture에는 외부 API/모델 서버를 연결하지 않았다.

| 명목 시점 | 실제 경과 | JS heap(MiB) | 수거 전 DOM 노드 | 화면 요소 |
| --- | --- | ---: | ---: | ---: |
|0분|0.02초|29.59|11,514|8,293|
|15분|15분12.7초|76.06|168,114|8,293|
|30분|30분12.9초|109.55|324,714|8,293|
|60분|60분12.9초|199.29|683,486|8,293|

기능 안정성과 메모리 판정을 분리한다. Ego에서 종료 후 강제 GC를 실행해도158.83MiB/637,914노드가 남았다. 독립적인 기존 raw CDP 검사에서 같은 제품 코드의100/500 turn 재열기60쌍(120회)과 파일/채팅590회 왕복을 수행하고 각 열기 뒤 강제 GC를 실행했을 때,500 turn 표본60개는22.18~28.94MiB·11,495노드·리스너1,216개로 유지됐다. 첫500 turn 표본24.17MiB, 마지막22.95MiB다. 기존29개 기록 검증도 같은 실행에서 통과했다. 앞선20쌍 비교 원자료도 따로 보존한다. 이는 브라우저/조작 도구 환경의 영향을 의심할 근거지만 원인을 확정하거나 제품의 누수 부재를 증명하지는 않는다. 독립 검사의 경과 시간을60분 실사용으로 대신하지 않는다.

Ego의 첫 측정 시도는 새 실행에서 `Performance.enable`을 다시 호출하지 않아 지표가 비어 실패했다. 새 기준선으로 재시작한 관찰이 위60분 결과다. 후속 `DOM.disable` 진단은 조작 도구의 DOM 관측을 중단시켜 실패했고 같은 페이지에서 `DOM.enable`로 복구했다. 실패 원자료를 보존했으며 제품 오류/정상 관찰 결과와 혼합하지 않았다. 실제 Ego production 소개→데모 진입도 별도로 확인한 뒤 작업 공간을 종료했다.

브라우저 전체 RSS, 물리 IME·터치, Safari/Firefox, 실제 공급자 지연은 측정하지 않는다. 메모리 증가 원인은 미확정이며 이 보고서를 누수 검증 전체 통과로 읽지 않는다.

## 미사용 진단과 파일 보존

새로 실행한 관리 CLI Fallow3.42.0의 참조 관련 후보는283개다. 미사용 파일143개는 루트 테스트/스크립트115개, 웹 테스트/fixture26개, 제품 소스2개다. unresolved import17개는 디자인 참조4개와 테스트/동적 endpoint13개이며 제품 소스 항목은 없다. 기존3.41.0과 버전·소스 시점이 달라 숫자만으로 증감을 평가하지 않는다. Fallow boundary/policy 규칙은 설정되지 않았으므로0을 검증 통과로 보고하지 않는다.

- `record-recovery.ts`는 `tests/s0/probe-server.mjs`가 실제 제공하므로 보존한다.
- `UnavailableFeature.tsx`는 현재 참조가 없는 유일한 제품 삭제 후보다. 공통 CSS는 다른 화면이 사용하므로 보존한다.
- 데모·온보딩·브라우저 fixture·회귀 자료·샘플 생성 스크립트는 정적 미사용 후보만으로 삭제하지 않는다. 새 의존성·진단 숨김 설정·범용 추상화는 추가하지 않았다.

파일 삭제는 실행하지 않았다. 독립 Architect는 한 파일 조건부 삭제 계획을 승인했으나 후속 Critic의 지정 모델이 현재 계정에서 지원되지 않아 실패했다. 설치된 Ralplan은 공식 host receipt 검증 전 실행 전환을 금지하고 현재 도구에는 해당 확인 경로가 없다. 후보를 보존하고 로컬 계획 `.omx/plans/cleanup-handoff-20261112.json`에 종료 상태를 남겼다.

## 원자료와 재현

이번 원자료는 Git 제외인 `.omx/verification/stabilization-20261112/`에 보관한다. `pnpm-check.log`, 기능별 브라우저 폴더, `http-checks.json`, `fallow.json`, `long-session.json`, `post-gc.json`, `memory-control/long-conversation.json`, `memory-control-60/long-conversation.json`, `ego-demo-smoke.json`을 구분한다. 인증 정보나 개인 원본을 보고서에 옮기지 않는다. 반복 검사는 브라우저346개 표의 고유 항목 수에 더하지 않았다.

```text
pnpm check
node tests/browser/check-document-find.mjs .omx/verification/stabilization-20261112/document-find
node tests/browser/check-ai-records.mjs .omx/verification/stabilization-20261112/records
node tests/browser/run-managed-fixture.mjs .omx/verification/stabilization-20261112/managed managed
node tests/browser/check-sample-workspace.mjs http://127.0.0.1:3034 .omx/verification/stabilization-20261112/demo
pnpm test:s0-graph
```

## 남은 한계

물리 한글 조합 중 Enter·실제 모바일 터치·Safari/Firefox·Windows 외부 앱의 실제 동시 수정은 이번에 수행하지 않았다. 합성 충돌/취소 검사를 실제 외부 프로그램 경쟁 검증으로 바꾸지 않는다. 과거 Windows 권한·파일 작업·완전 재시작·네이버 복귀 결과는 프로젝트 인수인계의 해당 날짜 기록이며 이번 재실행이 아니다.

실제 공급자 지연·새 유료 호출·청구 대조·운영 장애 훈련·배포는 수행하지 않았다. 소개 페이지 피드백과 성장/정책 변경·로컬AI·Kakao는 이번 범위에서 재개하지 않는다. 테스트 외 제품 코드는 변경하지 않았고 자동 생성 `next-env.d.ts` 변경은 시작 상태로 복구했다. 검토 순서는 인증 설정 검사→데모 브라우저 검사→이 보고서와 계획/인수인계 문서다.
