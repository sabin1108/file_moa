# 화면 먼저 표시와 끊기는 응답 보완

2026-11-09. 사용자는 긴 로딩을 화면 표시 뒤의 캐시 수신으로 바꾸고 싶다고 요청했다. 채팅은 약12초, ‘제가’ 뒤2~3초 공백 후 나머지가 몰려 나온다고 보고했으며 테두리는 해결됐다고 확인했다. 이 최신 실제 보고를 앞선 모의28검사 통과보다 우선했다.

## 확인한 원인과 변경

1. 설정 준비 `after(prepareSettingsDisplay)`는 이미 응답 뒤 실행됐다. 이를 최초 화면 대기의 원인으로 다시 단정하지 않았다. 작업 공간 layout의 전체 인증/owner 확인과 설정 페이지의 계정 표시 조회가 각각 공통 화면·모든 설정 패널보다 앞에 있었다.
2. 작업 공간 layout을 동기 Suspense 경계와 비동기 `AuthenticatedWorkspace`로 나눴다. 공개 `WorkspaceShell`부터 보내고 성공한 owner만 실제 SessionBoundary/SourceFolderProvider/children에 전달한다. 공개 틀에는 개인 자료와 입력 기능이 없다. 인증 거부·만료·계정 변경의 개인정보 차단은 유지한다.
3. 설정은 `SettingsTabs`·기기별 패널을 먼저 표시하며 `AccountSettings`만 별도 Suspense에서 계정 guard/캐시 조회를 기다린다. 권한을 캐시로 대체하지 않는다. 경로 이동의 중앙 덮개는 작은 비차단 우측 하단 상태로 바꿨다.
4. 서버 채팅은 본문 공개마다 DB guard를 기다리면서 공급자 소비까지 멈췄다. 이제 공급자 읽기와 단 하나의 비동기 공개 작업을 분리한다. 첫 실제 본문부터100ms를 모으며 공개할 본문/완료를 검사 전에 고정한다. 검사 중 받은 본문은 다음 fresh guard를 받는다. 이미 받은 후속 본문은 다음 공급자 이벤트가 없어도 공개 loop가 계속 처리한다. guard 실패는 별도 공급자 signal을 중단하고 남은 본문을 공개하지 않는다.8,000자 총량·생성 전 guard·최종 guard·한도·취소·자동 재시도 금지는 유지한다.
5. 브라우저는 완료 이벤트에서 숨은 본문을 즉시 전부 펼쳤다. 이제 원래 completed를 잠시 보관하고120~650ms frame 표시가 끝나야 한 번 dispatch한다. reader가 반환해도 표시 중인 frame/active는 유지한다. 중지·세션·철회·owner 변경/이탈은 숨은 본문과 보류 완료를 폐기하고 reduced motion은 즉시 표시한다. 가짜 본문이나 생성 요청은 추가하지 않는다.

## 검증

| 항목 | 실행 결과 |
|---|---|
| 전체·정적 검사 | 129파일1,210검사, 타입·린트·빌드 통과. build `MTrh8ncCKaPRMBa3337M5` |
| 경계 검사 | 서버26 / 구조25+6+3 통과 |
| 채팅 서버 | 20검사 통과. 느린 공개 guard 동안 공급자 계속 소비, 검사 중 새 본문은 별도 guard, guard 거부 시 공급자 중단·본문0, 첫 본문100ms timer와 후속 buffer 독립 배출 검증 |
| 실제 UI/합성 HTTP SSE | [31검사](browser/checks.json). 빠른 completed도 여러 작은 frame으로 표시, 표시 중 중지, 단절·session·revoke·reduced motion·자료 왕복·4너비. [완료 frame](browser/completion-reveal-frames.json) |
| 지연된 실제 Next fixture | [17검사](loading/checks.json). 제품 layout/settings/shared UI, 합성 guard1500ms와 account3500ms.390/1440/1920에서 공개 틀 먼저, private/입력은 guard 뒤, 거부 시 private0, 계정 대기 중 탭 사용·계정 도착 뒤 선택 보존 |
| 실제 샘플 탭/이동 | [26검사/12탭 표본](navigation/settings-loading-checks.json). 지연 RSC에서 기존 화면 유지·비차단 표시, 탭 전환 RSC/POST0·DOM/URL보존·4너비 |
| 실제 production 거부·경로 | [5거부](production/route-checks.json), [6경로 각3회/History9](performance/routes-assets.json). 모델 키 없는 별도 QA 서버, 보호 경로는 guest redirect |

공급자 소비가 guard에 막히는 검사는 수정 전 `sourceFinished=false`로 실패 후 통과했다. 기존 workspace 준비3검사는 Suspense 안의 인증된 child를 실행하도록 갱신했고 공개 fallback 무권한 검사를 추가했다. 별도 Next fixture의 경로/타입 연결 실패는 fixture 설정을 고쳐 통과했으며 제품 기능 실패로 섞지 않는다. 독립 architect 읽기 검토에서 차단 문제는 없었고 첫 본문부터의 timer 권고도 반영했다. 실제 로그인·모델을 자동 실행하지 않았다.

## 측정 경계

사용자 보고 약12초와 기존 안전한 서버 기록의 생성 구간8171ms는 측정 범위가 다르다. 기존 로그는 preflight/guard/provider 시간을 분리하지 않아8.2초를 순수 모델 시간이라고 표현하지 않는다. 새 로그는 preflightMs, firstProviderTextMs, firstPublishedMs, authorizationChecks/authorizationMs와 기존 사용량만 남긴다. 질문/응답/세션 ID/token/쿠키/계정/원본 오류는 포함하지 않는다. 다음 실제 요청에서 초기 준비와 첫 본문·공개 및 권한 대기를 구분할 수 있다.

Next 합성 표본은 공개 틀 약26~139ms, 보호 내용 약1521~1596ms였다. 이는 의도적으로 넣은1500ms guard가 화면 틀을 막지 않는다는 증거이며 실제 원격 DB나 사용자의 초기 로딩 수치가 아니다. 정적 JS/CSS는1,730,463→1,714,956bytes(-15,507),43→44파일이다. 공개 shell과 서버/클라이언트 분리 뒤의 빌드 결과이며 실제 네트워크 체감 개선률로 표현하지 않는다.

수정 뒤 실제 인증 계정/유료 모델 전체 응답 시간과 실제 권한 변경 PostgreSQL 조합 행렬, 물리 IME, field INP/heap/부하·배포 프록시·최종 과금은 이번 추가 검증 범위 밖이다. Fresh DB 왕복 대기가 길면 공개 간격의 하한은 여전히 남는다. 검증 없는 단일 SQL의 RLS context 변경, DB migration·캐시된 권한 사용, 추가 유료 요청·계정 생성·푸시·배포는 하지 않았다.

공식 근거: [Next 실행 시점 데이터와 Suspense](https://nextjs.org/docs/app/getting-started/fetching-data), [React Suspense](https://react.dev/reference/react/Suspense), [after](https://nextjs.org/docs/app/api-reference/functions/after), [링크의 작은 대기 표시](https://nextjs.org/docs/app/api-reference/functions/use-link-status).

## 재현

```text
pnpm exec vitest run apps/web/tests/server/chat.test.ts apps/web/tests/server/workspace-preparation.test.tsx
node tests/browser/check-general-chat.mjs docs/verification/progressive-chat/browser
node tests/browser/check-progressive-workspace.mjs
node tests/browser/check-settings-and-loading.mjs http://127.0.0.1:3035 docs/verification/progressive-chat/navigation
```

마지막 명령은 실제 모델 키를 비운 별도 production QA 서버가 필요하다. 작업 후 QA3035와 fixture3036은 종료하고 사용자3034는 네트워크 허용 dev로 유지한다. dev 실행 중 생성 타입 수동 복원·build/Prisma 재생성을 병행하지 않는다.
