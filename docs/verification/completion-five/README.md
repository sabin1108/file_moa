# 검색·정리 마감 점검과 실제 사용 보완

2026-11-08. 사용자가 요청한 오늘 1~5번과 검사 중 추가한 퀵메뉴·관리 기록·버튼 잘림·단계 표시를 함께 다뤘다. 전체 제품의 남은 범위는 [완료 계획](../../planning/completion-roadmap.md)에 별도로 남긴다.

## 변경과 읽을 순서

1. `features/local-folders/lib/document-find-reply.ts` → `document-find.ts` → `store/document-find-controller.ts`: 지원하는 검색 조건 답변을 전부 해석한 뒤 반영한다. 모호한 답변은 부분 반영하지 않는다. 상대 연도는 명시 요청 시점 기준, 월말은 21일~말일, 여러 달은 같은 해의 명시 범위다. 답변 반영은 파일 읽기나 검색을 자동 실행하지 않는다.
2. `features/conversation-workspace/lib/request-routing.ts` → `hooks/useConversationRequests.ts` → `FindConversation.tsx`: 검색·정리·혼합 요청을 같은 경계로 처리한다. 검색 결과 선택은 현재 결과에 속하는 경로만 허용하고 기존 `organization.update/prepare`로 새로 읽는다. 예전 기준·목적지·발췌·동의는 재사용하지 않는다.
3. `features/quick-switch/hooks/use-quick-switch.ts` → `WorkspaceQuickSwitch.tsx`: 일반 글과 모달을 통째로 제외하던 조건을 실제 입력·선택·드래그 대상으로 좁힌다. 화면별 이벤트를 등록하지 않고 기존 작업 화면 표시와 전역 위임을 쓴다. 활성 dialog 안으로 portal하고 manual Popover의 top layer로 표시한다. 모달 종료·경로 변경은 예약/메뉴를 정리한다.
4. `local-folders/lib/managed-files.ts` → `services/managed-tree.ts` → `managed-inspection.ts` → `managed-execution.ts`: 선택한 일반 폴더 안의 작업 기록도 같은 해시·핸들·한도·보관·재검사·비재귀 제거·복구로 처리한다. 직접 관리 영역 선택과 실제 보관함 보호는 유지한다. [기록 보존 계약](../../specs/folder-history-preservation.md).
5. `lib/managed-workflow-step.ts` → `hooks/use-workflow-url.ts` → `use-workspace-workflow.ts` → `ManagedFilesDialog.tsx`: 시작 직후 결과가 없는 상태도 보존 단계다. 실행 중/결과 표시는 controller 상태를 따른다. URL은 같은 함수를 사용해 기록하며 진행마다 route 전환을 보내지 않는다. 완료 하단의 복귀 조작은 파일 화면/정리 화면에 맞는 이름을 공급한다.
6. `server/live-ai-diagnostics.ts` → `live-organization.ts`: 민감 본문 없이 단계·공급자·결과·시간·알려진 토큰 수만 기록한다. 모델 응답 뒤 세션이 바뀌어 결과를 폐기해도 알려진 사용량은 남긴다. [운영 절차](../../reports/ai-operations-runbook.md).

동일 조작은 기존 SourceFileRow, 목적지 탐색, ManagedFilesDialog, WorkflowStepper를 재사용했다. 새 의존성은 추가하지 않았다.

## 실패를 먼저 확인한 부분

- 일반 글/모달 퀵메뉴: 변경 전 동일 브라우저 검사 첫 항목 실패 → 공통 수정 후 통과.
- 검색 답변 파서, 안전한 진단, 단계 함수/URL hook: 구현 전 검사 실패 → 구현 후 통과.
- 작업 기록이 있는 폴더: 새 이동/휴지통/변경/보관 실패 검사 4개가 `managed-protected`로 실패 → 기록 보존 구현 후 모두 통과.
- 재검토에서 상대 연도 충돌이 전체 기간으로 넓어지는 문제, copy/backup/restore의 실행 중 메뉴 차단 누락을 발견해 수정했다. 해당 일반 기간 확정은 거부하며, 각 실행 상태의 공통 차단 표시를 연결했다.
- 실제 Next 검사에서 `history.state`를 통째로 전달하면 내부 플래그 때문에 URL만 바뀌고 hook 동기화가 생략되는 것도 확인했다. 앱 소유 `moaFileVisit`만 전달하고 Next 통합이 내부 상태를 보존하도록 수정했다.

## 이번에 실행한 검사

| 검사 | 결과 | 범위 |
|---|---:|---|
| 기본 단위/상태/서버 회귀 | 121파일, 1,149개 통과 | 공급자는 모의 응답, 실제 유료 생성 없음 |
| 타입·린트·production 빌드 | 통과 | 최종 빌드 `DSjmBWsT5mHYAbLFS0HVa` |
| 서버/기능 경계 | 21 + 25/6/3 통과 | 정적 경계, 실제 권한 부여 증거와 구분 |
| 검색/선택/정리 연결 | [51개](search-browser/browser-checks.json) 통과 | 실제 UI/controller/session/Worker/OPFS, 합성 소유자/권한 |
| 기존 정리 답변/검토 | [35개](organization-browser/browser-checks.json) 통과 | 모의 모델, 합성 OPFS |
| 파일 작업/복구/기록/단계/도구줄 | [32개](managed-browser/checks.json) 통과 | 실제 합성 파일 변경, 기록 포함 이동, 취소·늦은 충돌·원본 보호 |
| 복사 진행 중 퀵메뉴 차단 | [22개](copy-browser/checks.json) 통과 | 실제 복사 서비스·OPFS, 최초 복사/기록 흐름만. 64MiB 후속은 이번 실행에서 제외 |
| 퀵메뉴 모달/텍스트 | [19개](../quick-menu-contexts/checks.json) 통과 | 실제 production 샘플 + 합성 native dialog |
| 기존 퀵메뉴/자료창 | [33개](../quick-menu-contexts/regression/scope-drawer-checks.json) 통과 | 샘플 3경로·공개 경로·좁은 화면·키보드·reduced motion |
| 경로 비용·Next History 통합 | [9개](performance/routes-assets.json) 통과 | 6경로 각3회. 보호 경로는 guest redirect, 실제 계정 성능 아님 |
| SSR/hydration | 정상 화면 통과 | 외부 속성을 넣은 별도 경고 재현은 의도된 검사 |
| 실제 DB 연결 | [1개](operations/database.json) 통과 | 기존 어댑터의 read-only SELECT 1, 2,276ms. 개인정보/권한/경합 실측 아님 |
| 실제 OpenAI | [1개](openai/actual-check.json) 통과 | 아래 조건 |

별도 예전 `pnpm test:s0-graph`는 고정된 S0 probe import map이 현재 파일 구조를 따라오지 못해 `/lib/folder-path`에서 404로 중단됐다. 같은 import는 변경 전 HEAD에도 존재한다. 필수 `test:boundaries`/`test:structure`와 실제 브라우저 모듈/Worker 검사는 통과했다. 예전 probe 갱신은 후속으로 남기며 통과했다고 기록하지 않는다.

## 실제 OpenAI와 테스트 비용

실제 정리 정책 → OpenAI 어댑터 → strict JSON → 정식 응답 파서를 합성 문서 한 개로 한 번 실행했다. 입력 토큰 확인 1회와 생성 1회 모두 HTTP 200, 자동 재시도 0회다. 인증/DB 한도는 이 직접 어댑터 검사에 포함하지 않는다.

- 모델 `gpt-6-luna`, 전체 3,461ms.
- 입력 1,162 / 출력 91 / 합계 1,253토큰. 일치 문서 1, 보류 0, 정확한 본문 근거와 날짜 분류 없음 검증.
- Standard 기준 예상 **생성** 비용 $0.0001617. 실제 service tier·입력 토큰 확인의 별도 과금·크레딧 차감·세금·결제액은 대시보드에서 확인할 항목이다.
- 기본 테스트에는 이 파일이 포함되지 않는다. 실제 검사는 별도 환경 변수와 config가 필요하다. 개인 자료·키·응답 원문·계정 식별자는 결과에 기록하지 않았다.

가격/기능 근거: [공식 모델 정보](https://developers.openai.com/api/docs/models/gpt-6-luna), [가격](https://developers.openai.com/api/docs/pricing), [입력 토큰 계산](https://developers.openai.com/api/reference/resources/responses/subresources/input_tokens/methods/count). 한 번의 단순 합성 통과를 전체 문서 품질로 확대하지 않는다.

## 실제 사용자 확인과 남은 범위

사용자는 Windows에서 요청한 1~3을 직접 수행했다고 답했다. 미리보기 퀵메뉴·파일 선택·한글 입력·복사/휴지통/복구 확인 도중 관리 기록 차단과 버튼 잘림을 보고했고, 수정 후 버튼은 정상이라고 명시 확인했다. 기록 차단 수정 재검사에서는 진행 단계와 완료 조작 피드백이 추가됐다. 마지막 단계/복귀 버튼 수정 후의 실제 Windows 재확인은 아직 받지 않았다.

테스트 원본 두 문서의 최종 해시는 초기와 일치했다. 작업자는 사용자의 실제 폴더를 강제로 삭제하거나 기록을 정리하지 않았다. 앱의 Windows 권한 철회/재연결, 외부 프로그램 변경 경합, 실제 운영 계정 전체 여정과 모바일 물리 입력을 모두 검증한 것은 아니다. 내부 기록의 옛 위치 교차 확인 한계와 실제 토큰 정산 원장 미구현은 명세/운영 절차에 남겼다.

## 성능과 재현

최종 production JS/CSS 총합은 이전 1,703,941 → 1,718,378 bytes, 43파일로 동일, +14,437 bytes다. 이것은 빌드 전체 산출물의 크기이며 경로별 초기 전송량이나 사용자 속도 향상률이 아니다. 경로 원자료는 위 표를 따른다. 실제 로그인/설정의 새 체감 시간·서버 비용·실사용 INP는 측정하지 않았다.

```powershell
pnpm test
pnpm typecheck
pnpm lint
pnpm test:boundaries
pnpm test:structure
pnpm build
node tests/browser/run-managed-fixture.mjs
node tests/browser/run-managed-fixture.mjs docs/verification/completion-five/copy-browser copy
node tests/browser/check-document-find.mjs docs/verification/completion-five/search-browser
node tests/browser/check-live-organization-completion.mjs docs/verification/completion-five/organization-browser --reply
```

production 샘플 검사는 모델 키를 비운 별도 로컬 서버를 사용했다. 실제 API/DB 검사는 각각 `MOA_RUN_OPENAI_LIVE=1`, `MOA_RUN_OPERATIONS_LIVE=1`과 해당 `tests/database/vitest.*-live.config.mts`를 **명시**해 실행한다. 일반 회귀에서 유료 검사를 자동 실행하지 않는다.

Next URL 근거: [Native History API](https://nextjs.org/docs/app/getting-started/linking-and-navigating#native-history-api). 설치된 Next 16.4.3 구현과 production SettingsTabs의 hook 갱신/방문 값/내부 상태 보존도 확인했다. 모달 근거: [showModal의 inert 경계](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal), [Popover의 표시와 정리](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API/Using).
