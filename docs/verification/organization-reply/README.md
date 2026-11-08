# 채팅 답변을 날짜·혼합 자료 질문에 연결

2026-11-08. 확장 프로그램은 사용자가 직접 처리하겠다고 명시했다. 이번에는 CF-003의 로컬 답변 해석과 기존 질문/동의 흐름 연결을 완료했다. Windows 브라우저의 주소 확인 문제를 우회하거나 실제 전체 여정을 완료한 것으로 처리하지 않았다.

## 바뀐 동작

질문이 있으면 채팅 입력은 최초 정리 요청과 분리된 답변 초안이 된다. `검토 기준일로 하고, 혼합자료는 학습 폴더로`를 제출하면 발췌의 날짜 후보와 명시한 문서를 기존 답변에 연결한다. 실제 자료 이름은 현재 질문에 표시된 이름을 사용한다. 이름이 겹치면 전체 상대 경로로 구분한다. 날짜 의미가 여러 문서/후보에 맞으면 자동으로 하나를 고르지 않는다.

입력만으로 기존 자료·제안·동의·답변을 바꾸지 않는다. 제출한 문장 전체를 검사한 뒤 답변을 함께 반영한다. 모순/부정/알 수 없는 절이나 잘못된 경로가 있으면 일부만 적용하지 않는다. 성공하면 기존 제안·동의를 폐기하고, 기존 질문 입력에도 결과를 표시한다. 별도 동의와 AI 전송은 그대로 필요하다. 자동 모델 호출·자동 파일 작업은 없다.

## 읽을 파일과 책임

1. `features/local-folders/lib/organization-reply.ts`: 입력을 현재 질문의 `ReviewAnswer[]`로 변환한다. 문서 이름/상대 경로와 실제 날짜 후보를 확인하고 기존 `validateReviewAnswers`로 경로·근거를 재검증한다. 파일/API 접근은 없다.
2. `store/organization-preparation-controller.ts`: `updateReply`는 초안만 저장한다. `submitReply`는 해석 후 기존 단일 답변과 공통인 `applyAnswers`로 한 번에 검증/무효화한다. 상태·취소·늦은 결과·계정 초기화는 같은 controller가 소유한다.
3. `LiveConversation`: 질문 유무에 따라 공통 composer를 기존 요청 또는 답변 초안에 연결한다. 확정 문장을 대화에 표시하고 초기 요청은 유지한다.
4. `ConversationWorkspace`: 입력 이름/힌트와 제출 행동을 받는 공통 표시다. 기존 IME/키보드 처리를 재사용하며 Enter 안내도 실제 행동 이름에 맞춘다.
5. `OrganizationQuestionsView`: 기존 선택 입력을 유지한다. 채팅 답변으로 확정된 목적지가 바뀌면 해당 입력의 초기값도 갱신한다. 확정 전 타이핑은 같은 값의 rerender로 지우지 않는다. `OrganizationConditionsView`의 ‘최초 정리 요청 수정’으로 요청 입력에 돌아간다.

[사용자 행동→호출→검증→상태→화면의 실제 순서](../../reports/organization-reply-reading.md). 서버 검증·원본 재검사·기존 실행/보존/복구는 복제하지 않았다. 의존성 추가/배포는 없다.

## 검증 근거

- 새 테스트 `apps/web/tests/local-folders/lib/organization-reply.test.ts`24개: 실제 근거 매핑, 중복 이름/의미, 알 수 없는 문서, 날짜/경로 위조, 부분 실패/모순/부정, 기존 답변 수정, 초안·동의 보존/폐기, pending/취소/늦은 응답/초기화, 긴 문장을 잘라 부정 표현을 제거하지 않기. 미구현 import 실패부터 시작했다. 외부 문서 문장을 폴더 이름으로 받던 실패를 고정하고 목적지 문서 명시를 요구했다.
- 전체 **1,022개/104파일**, 타입·린트·빌드, 서버 경계21·구조25 web/6 domain/3 layout 통과. 빌드 `a99THEDyzCzprOFx2JapB`.
- [답변 포함 완성 흐름35](completion/browser-checks.json): 기존 controller/session/Worker/OPFS와 합성 owner/권한/공급자·Next 탐색 shim. 두 답변 한 번 반영, 잘못된 절 전체 거부, 화면 전환 시 초안 보존, 합성 IME, 기존 입력 동기화, 새 동의, 실제 OPFS 복사·보존 이동·복구·원본 변경 차단.
- [기존 선택 입력 완성 흐름30](manual-controls/browser-checks.json), [전송 회귀23](transfer/browser-checks.json), [자료 준비28](preparation/browser-checks.json), [공통 샘플 화면17](sample/browser-checks.json). 샘플 검사는 API 요청0/실제 폴더 접근0으로 수행했다.
- 준비/검토는 390/768/1440/1920px에서 확인했다. 모바일 전환·Tab/Enter·가로 넘침과 [최종390 화면](completion/review-390.png)을 확인했다. 자동 검사를 사용성 완료 판정으로 확대하지 않는다.
- 전후 production9경로54+54표본은 [성능 기록](performance.md)을 따른다. 실제 AI 생성/개인 전송/Windows 원본 변경은 이번에 실행하지 않았다.

## 지원 범위와 남은 검증

현재 질문의 문서 이름/확장자 없는 이름/전체 상대 경로, 화면에 나온 날짜 기준/ISO 날짜, `문서는 학습 폴더로`, `문서는 "개인 학습/성능" 폴더로`, `문서는 제외해 줘`, `문서는 날짜로 나누지 않기`를 지원한다. 쉼표/줄바꿈/그리고/하고로 절을 나눈다. 경로 안에 이 구분 표현이 있거나 지원하지 않는 말투는 기존 질문 입력으로 답한다. 임의 문장을 의미적으로 이해하는 모델 기반 자연어 처리로 보고하지 않는다.

물리 한국어 IME·실제 로그인한 Windows의 답변 후 재전송/복사/이동/복구·실사용 속도는 미검증이다. 기존 브라우저 주소 확인 제한은 남아 있다. 확장 프로그램 확인은 사용자 담당이며 이 작업의 완료 조건에서 제외했다.

재현: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm test:boundaries`, `pnpm test:structure`, `pnpm build`. 브라우저 답변 흐름은 `node tests/browser/check-live-organization-completion.mjs <새 결과 폴더> --reply`. 기본 실행은 기존 선택 UI를 검사한다. 전송/준비는 기존 `check-live-ai-transfer.mjs`, `check-live-local-preparation.mjs`에 새 결과 폴더를 넘긴다. 샘플은 `check-conversation-organization.mjs --scenario=browser --base=http://127.0.0.1:3035 --output=<새 결과 폴더>`이며 실제 모델 요청을 허용하는 인수는 사용하지 않았다.
