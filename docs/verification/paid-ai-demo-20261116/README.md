# 명시 전송 AI·일일 한도·공유 초대

후속: 사용자가 배포를 승인해 Luna 고정·초대/AI 설정을 실제 Vercel에 적용했다. 실제 UI28개/HTTP14개와 유료 생성13건의 구체 조건은 [후속 배포 결과](../paid-ai-deploy-20261116/README.md)를 따른다. 아래 ‘배포 전’과 미검증 목록은 로컬 구현 검증 시점의 기록이다.

2026-11-16. 기준 커밋 `f019b8c0ce92f251deb7274df2a3a382c2ef3ac3` 이후의 로컬 수정이다. **구현·로컬 검사·실제 공급자 합성 생성은 완료했고, 커밋·푸시·배포 및 운영 환경 적용은 하지 않았다.** 최신 사용자의 유료 AI 요청은 이번 합성 호출을 허용하며, 이전 별도 커밋/푸시 완료를 새 배포 승인으로 확대하지 않았다.

## 원인과 변경

| 범위 | 기존 문제 | 수정 |
| --- | --- | --- |
| 명시 전송 | 일반 대화/자료 질문은 준비된 답변, 정리에는 준비 제안 버튼이 남아 있었다. | 실제 서버 action을 보내기에 연결하고 준비 답변/제안 버튼과 자동 대체를 제거했다. 예시·튜토리얼·복원은 호출하지 않으며 자료 찾기는 기존 로컬 규칙을 유지한다. |
| 일일 제한 | 실서비스는 시간당10회, 데모는 세션 시간당3회와 전체 분당1/시간당12회였다. | 기존 DB 원자 예약을 한국 시간 날짜별 키로 사용한다. 데모 방문자30회/계정10회, 종류별 전체300회/일이며 요청 중복 차단과 실패/중지 예약은 유지한다. |
| 초대 | 예측 가능한 공개 데모 주소와1시간 샘플 세션만 있었다. | 서버 환경 초대값을 검증하고 서명 방문자 쿠키를 발급한다. 페이지·asset·action을 각각 확인하며 세션 갱신에도 방문자 ID를 유지한다. |
| 복원/실패 | 실제 장기 대화의 응답 ID 중복과 출처 수/저장 상한의 불일치 위험이 있었다. | 요청 UUID 기반 메시지 ID, 최대40메시지/최근3완료 대화 전송, 문서40개/발췌6000자/출처5개를 적용했다. 취소·만료 뒤 늦은 결과는 버리고 실패 시 초안을 보존한다. |

일반 대화는 보내기 자체가 질문/최근 완료 대화 전송이며, 자료 질문·정리는 선택 자료 발췌 전송 동의를 별도로 받는다. 출처는 서버 카탈로그의 선택 ID와 실제 발췌 인용을 검증한다. 이전 완료한 가상 계획 뒤 자료 선택을 다시 시작해도 되돌림 기록을 보존한다.

## 읽을 파일 순서와 책임

1. `apps/web/src/shared/{ai-daily-limits,sample-answer}.ts`: 날짜·횟수·입출력 계약. `server/ai/ai-quota.ts`와 `server/auth/auth-rate-limit.ts`: 공통 예약 규칙과 기존 SQL 원자 경계. `server/ai/ai-usage.ts`: 계정 일일 횟수 표시, 작업 공간별 상세 원장.
2. `server/demo/demo-access.ts`, `app/demo/access/[token]/route.ts`, `proxy.ts`: 초대 교환·서명·직접 경로 차단. `app/demo/{layout,start,assets/[documentId]/route}.tsx/ts` 및 `server/demo/sample-ai.ts`: 개별 서버 진입 검증.
3. `server/demo/sample-answer.ts`, `app/actions/sample-ai.ts`, `app/demo/{page,files/page}.tsx`: 서버 소유 카탈로그·생성·인용 검증과 action 연결. 기존 `ai-generation`/OpenAI Responses/JSON 파서를 재사용했다.
4. `features/sample-workspace/{sample-state,sample-workspace-store,sample-experience}.ts`: 상태·명시 전송·취소/복원·준비 응답 제거. `SampleWorkspace.tsx`, `conversation/SampleConversation.tsx`, `files/SampleFolderPanel.tsx`: 공통 화면·동의·공급자·선택 동선.
5. 실서비스 네 호출자 `server/chat/chat.ts`, `server/organization/{grounded-chat,live-organization,search-query}.ts`와 해당 오류 표시/사용량 화면: 같은 계정 일일 정책을 적용했다. 새 패키지·DI·범용 저장소·DB migration은 없다.

전체 변경 경로와 보존 영수증은 로컬 `.omx/verification/paid-ai-demo-20261116/receipt.json`에 남긴다. 개인 기록 문서는 기존 부분을 보존하며 공개 코드/보고서와 구별한다.

## 실제 실행 결과

원자료는 `.omx/verification/paid-ai-demo-20261116/`에 있다. 과거 결과를 이번 통과 수로 합치지 않았다.

| 검사 | 결과와 조건 |
| --- | --- |
| 실패 회귀 | `daily-red.log`: 기존 limiter의 일일 창 거부. `access-red.log`: 직접 데모 경로 차단4개 실패. `review-regressions-red.log`: 과다 출처/긴 대화 ID 반례2개 실패. 수정 전 실패를 보존했다. |
| 관련 회귀 | `targeted-fourth.log`: 29파일/325개 통과. 실제 SQL 서버가 아닌 원자 트랜잭션 모의 fixture로30/31·10/11·전체300/301·롤백·자정·공간 간 계정 공유·데모/실서비스 분리를 검사했다. |
| 전체 `pnpm check` | `check-second.log`: schema validate/typecheck/lint/180파일1616개/서버 경계26/구조32+6+3/domain imports/production build 통과. 기존 `_count` 미사용 warning1개, error0. 첫 실행은 새 브라우저 fixture의 version 타입 오류로 실패했으며 수정 뒤 통과했다. |
| `pnpm test:s0-graph` | `s0.log`: 180모듈 통과. |
| 새 UI 브라우저 | `browser/checks.json`: 19개 통과. 실제 공통 UI와 합성 action으로 명시 전송/후속 대화/실패/자료 동의/출처/선택 상한/취소/계획 적용/되돌림/설정/안내/390·768·1440/복원을 검사했다. 최초 fixture 실행의 Next Image shim 누락은 보존 후 기존 shim 재사용으로 해결했다. |
| 기존 데모 브라우저 | `existing-demo-final/checks.json`: 43개 통과. 기존17단계·공통 컨트롤·파일 선택·기록/초점·폭을 실제 Next production에서 재검증했다. AI 비활성 조건으로 기대값을 준비 답변 대신 전송 차단으로 갱신했다. Node의 기존 MODULE_TYPELESS 경고는 유지한다. |
| 기존 진입 브라우저 | `existing-entry/checks.json`: 20개 통과. 초대 진입·선택0·설정 다시보기·F5/저장소 거부·쿠키 없는 로그인·합성 인증 장애 복구를 확인했다. 실제 계정 인증 성공이 아니다. |
| HTTP smoke | `http-smoke.json`: 14개 통과. 초대 없는6경로/잘못된 초대404·clean303·쿠키/캐시/Referrer·진입/샘플 발급·방문자 유지. HTTPS Secure 속성은 route 회귀에서 검사했으며 로컬 HTTP 쿠키가 Secure라고 주장하지 않는다. |
| Ego | 소유 space7에서 실제 로컬 초대→소개→체험→기존1/17 안내, 닫기→새로고침 시 안내 없음/선택0 확인. 종료 시 space를 닫았다. 선택자3개 모호성은 snapshot ref로 복구했으며 제품 오류로 합산하지 않는다. |
| 실제 유료 공급자 | `live-network.log`/`live-results.json`: 실제 `gpt-6-luna` 일반 대화·자료 질문·정리 생성3회 성공, 각각 토큰222/303/964. 토큰 계산3회와 생성3회 모두HTTP200. DB 예약만 모의 처리하고 실제 서버 입력·출처/정리 파서를 통과했다. 생성 재시도0회, 운영 DB/개인 자료/인증 계정 사용0회. 최초 EACCES는 환경 차단으로 기록하고 허용된 네트워크 실행에서 확인했다. |
| 독립 검토 | architect 읽기 전용 최종 결과 `CLEAR`: 알려진 보안·한도·전송·복원 지적 보완, 로컬 범위 새 blocker 없음. 정식5단계 EGM 전체 실행을 했다고 표시하지 않는다. |

기존 화면2실패·taste20지적, 과거 인증 경로1실패/일반 대화 진입 timeout·시각 경고와 기존 실계정 인증/DB 문제는 해결로 바꾸지 않았다. F1–F3과 도달 경로 없는 originalRequest 후보는 재수정하지 않았다.

## 보안과 제한의 실제 의미

- 초대 링크만 있으면 로그인 없이 접속한다. 다른 사람에게 전달하면 그 사람도 접속한다. 실제 초대값은 생성/저장/공개하지 않았고 환경 예시에는 빈 항목만 추가했다.
- API 키와 인증 비밀은 서버 전용이다. 새 방문자 쿠키는 ID·만료·초대 digest의 서명 증명이며 API 키/질문 본문을 넣지 않는다. HTTPS에서는 Secure, HttpOnly, SameSite=Lax, Path=/demo다. 별도 Better Auth 쿠키의 접근 권한을 대신하지 않는다.
- 브라우저 sessionStorage에는 질문·초안·답변·출처·모델/사용량·기록/계획 전체가 평문으로 임시 보관된다. 이는 비밀 금고가 아니며 민감한 내용을 입력하지 않도록 안내한다. 기존 가입 초안의 이메일/단계/만료와 로그인 초안의 이름/이메일도 구분하며 비밀번호/API 키를 저장하지 않는다.
- 30회는 사람 단위가 아닌 서명 방문자 쿠키 단위다. 쿠키 삭제/다른 브라우저는 새 방문자가 될 수 있다. 전체300회는 최소 비용 방어선이며 결제 한도/청구 보장이 아니다. 취소는 늦은 UI 저장을 막지만 이미 보낸 API를 환불하거나 원격 취소했다고 주장하지 않는다.
- 초대 URL은 브라우저 기록/호스팅 요청 로그에 남을 수 있다. 토큰 회전은 새 환경 배포에서 적용되며 과거 배포 접근 정책은 별도로 확인해야 한다. no-referrer/no-store/noindex가 모든 노출을 없애지는 않는다.

## 모델 근거와 로딩 관찰

기존 `gpt-6-luna`를 유지했다. [공식 모델 문서](https://developers.openai.com/api/docs/models/gpt-6-luna)와 [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)의 Responses/구조 JSON/고빈도 비용 특성을 확인했다. 모든 작업에서 최고의 품질이라고 주장하지 않으며 합성3건을 다양한 사용자 품질 평가로 확대하지 않는다. [공식 가격](https://developers.openai.com/api/docs/pricing?context-length=long)은 계정 결제/크레딧/속도 제한과 별개다.

로컬 production6경로×2폭×3회36표본, 전체 JS/CSS54개4,592,072bytes다. 직전 기록의4,586,740bytes 대비+5,332bytes이나 동일 조건 전후 로딩 측정은 없어 개선율을 계산하지 않았다. `/demo` 1440px TTFB/DCL/FCP 중앙값13.2/25.2/48ms,390px11.6/22.7/40ms. 초대·샘플 세션 이후 공개/샘플 경로이며 실제 인증/field INP/실기기 peak RAM/운영 부하/AI 응답 시간 측정이 아니다. 원자료 `performance-after.json`/`measure-after.mjs`.

## 남은 적용과 후속 전달문

운영 DB 예약, 실제 계정 인증, Vercel 비밀/플래그/신규 코드 결합과 구 배포 접근은 미검증이다. 새 유료 호출·커밋·푸시·배포를 자동 반복하지 않는다. 권한이 주어지면 AI 플래그를 끈 상태로 초대 비밀 준비→검증된 코드 배포→초대 차단 확인→명시 AI 활성화 순서를 지킨다. 운영 DB migration은 필요 없으며 관리/조회를 승인 없이 추가하지 않는다.

```text
E:\project\ai_folder_project에서 docs/verification/paid-ai-demo-20261116/README.md와
.omx/verification/paid-ai-demo-20261116/receipt.json, verification.json을 먼저 읽어라.
기준 HEAD f019b8c 이후 명시 전송 AI·KST 데모30/계정10·종류별 전체300·서명 초대가 로컬 구현됐다.
전체1616, S0180, UI19, 기존demo43/진입20, HTTP14, 실제 합성 생성3회가 통과했다.
이 결과만으로 재검사/추가 호출/제품 변경을 반복하지 말고 이후 diff와 새 요청 범위만 확인해라.
커밋·푸시·배포/운영 환경 적용은 미실행이며 별도 최신 사용자 권한을 확인해라.
개인문서3개·기존 미커밋 변경을 보존하고 개인 폴더·운영 DB·새 모델 다운로드를 실행하지 마라.
기존 화면2실패/taste20/실계정 인증 문제를 통과로 바꾸지 마라.
초대 링크는 bearer 접근 열쇠다. 원문을 Git/로그/문서에 쓰지 마라.
```
