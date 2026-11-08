# 검색과 정리 요청 전환

2026-11-08, 요구176. 기존 후속 목록2번. [RQ-001~005](../../specs/conversation-request-routing.md).

## 바뀐 동작

- 정리 화면과 검색 화면이 같은 요청 판별·전환 함수를 사용한다. 검색 화면에서 ‘성능 보고서 정리해줘’를 보내면 검색을 다시 시작하는 대신 기존 자료 준비로 이동한다.
- ‘회의 자료를 찾아서 정리해줘’나 작업을 알 수 없는 요청은 ‘자료 찾기/자료 정리’를 먼저 선택한다. ‘계속 작성’은 초안과 입력 초점을 보존한다.
- 혼합 문장에서 찾기를 고르면 원래 요청은 보존하면서 ‘정리해줘’ 같은 작업 지시를 본문 검색어에서 제외한다. ‘정리 방법’처럼 일반 내용 단어는 그대로 둔다.
- 작업 자체를 부정한 문장은 자동으로 실행 방향을 고르지 않는다. 날짜 조건의 부정만 있는 찾기 문장은 찾기로 연결하지만, ‘올해/작년’의 실제 기간 해석은 추가하지 않았다. 기간과 날짜 기준은 기존 검색 조건에서 확인한다.
- 현재 정리 질문에 답하는 입력은 기존 답변 처리로 유지한다. 새 요청으로 바꾸려면 기존 ‘최초 정리 요청 수정’을 쓴다.
- 전환 시 기존 정리 동의·제안과 늦은 읽기/검색 결과는 기존 controller의 취소 경계로 폐기한다. 실제 파일 적용 중에는 UI와 제출 순간의 현재 상태에서 전환을 막는다. 외부 AI 전송과 파일 적용은 별도 확인을 유지한다.

## 책임과 실행 흐름

1. LiveConversation/FindConversation이 입력을 전달한다. 기본 입력·합성 IME·취소·미리보기·공통 버튼은 기존 구성이다.
2. `classifyConversationRequest`는 기존 isFindRequest를 재사용해 제한된 표현을 find/organize/불명확으로 나눈다. 모델을 부르지 않는다.
3. `useConversationRequests`는 임시 선택, 초점, 연결과 실제 적용 상태를 관리한다. 요청 초안과 확정 상태는 기존 Provider 소유 controller에 남긴다.
4. `routeConversationRequest`는 선택 전 아무 controller도 실행하지 않는다. 검색을 고르면 organization.cancel→finding.start, 정리를 고르면 organization.cancel→finding.reset→organization.update→prepare를 수행한다. preview는 선택 후 닫는다.
5. 실제 읽기·새 동의·AI 전송·작업 계획·원본 적용은 기존 기능이 담당한다. 새 중복 controller나 캐시는 만들지 않았다.

표시는 RequestIntentChoice가 맡는다. 기존 Action 클래스와 정리 화면 간격 CSS를 재사용했고 새 스킨은 추가하지 않았다. 선택 UI는 일시적인 화면 상태이므로 경로를 떠나면 닫힐 수 있으며, 초안/현재 조건은 기존 저장 수명을 따른다. 연결·owner 초기화 후 과거 선택을 다시 적용하지 않는다.

읽을 파일: [판별·전환](../../../apps/web/src/features/conversation-workspace/lib/request-routing.ts) → [상태·초점 hook](../../../apps/web/src/features/conversation-workspace/hooks/useConversationRequests.ts) → [선택 표시](../../../apps/web/src/features/conversation-workspace/components/RequestIntentChoice.tsx) → [기본 대화](../../../apps/web/src/features/conversation-workspace/components/LiveConversation.tsx)/[찾기 대화](../../../apps/web/src/features/conversation-workspace/components/FindConversation.tsx).

## 검증

- 새 핵심21개+hook2개 통과. 기존 controller를 실제 생성해 동의 폐기와 늦은 검색/준비 결과 폐기를 확인했다. hook 검사는 통제한 외부 store로 이미 적용 중인 상태와 렌더 직후 적용이 시작되는 경우를 재현한다. 실제 파일 엔진을 실행한 검사는 아니다.
- 테스트 우선 순서: 새 전환 모듈 미존재 실패 → 구현. ‘자료 찾기’ 판별, 날짜 조건 부정을 작업 부정으로 오해하는 사례, 혼합 요청의 작업 지시가 본문 검색어에 남는 사례를 각각 실패 확인 후 보완했다. 범위는 요청 의도이며 날짜 표현 기능 추가가 아니다.
- 전체116파일1,123개·타입 검사·린트·production 빌드·서버 경계21·구조25+6+3 통과.
- 기존 실제 controller/session/Worker와 Chromium OPFS 검사에 전환 사례를 추가해 [45개](browser/browser-checks.json) 통과. 390/768/1440/1920px 선택 UI, 초점/초안 복원, 합성 조합 입력, 명확·혼합 요청, 찾기 선택 후 별도 검색 확인, owner 초기화, 외부/모델 요청0·원본 쓰기0·보호 sentinel 불변을 확인했다. 기존 검색 조건·결과의 [공통 UI 검사](browser/taste-checks.json)는 FAIL0이며 새 선택 UI는 별도 너비·초점·사진으로 확인했다.
- 기존 질문 답변·새 동의·준비/실행 연결의 [35개 회귀](reply-regression/browser-checks.json) 통과. 이 검사는 합성 공급자와 OPFS를 사용하며 필요한 합성 파일 작업은 포함한다. 두 브라우저 검사의 쓰기 조건을 혼동하지 않는다.
- [루트/시안 SSR 확인](hydration-checks.json)은 깨끗한 상태의 경고0과 통제된 외부 속성 경고 재현이다. 새 정식 요청 전환 화면 전체를 SSR 실계정으로 확인한 증거는 아니다. 출력 경로 인자를 지원하도록 검사 도구를 조정하고 과거 검증 파일은 보존했다.
- 초기 브라우저 검사는 자료 준비 중의 읽기 전용 입력을 기다리지 않아 제출 버튼을 찾지 못했다. 대기 조건을 보완해 통과했다. 초기 기록은 `.omx/request-routing/initial-browser-sync-failure.json`에 보존했다.
- 직접 만든 짧은 요청/합성 snapshot과 기존 OPFS fixture를 사용했다. 새 RNG seed나 의미 품질 holdout은 없으며 실제 AI API 호출0이다.

재현:

```text
pnpm exec vitest run apps/web/tests/conversation-workspace
node tests/browser/check-document-find.mjs docs/verification/request-routing/browser
node tests/browser/check-live-organization-completion.mjs docs/verification/request-routing/reply-regression --reply
node tests/browser/check-chat-first-hydration.mjs docs/verification/request-routing
```

## 성능과 한계

[정적 자산](assets.json)은 이전 Kq63pzcUlYklcgQ4juhfk의42개/1,701,044bytes → 새 sj2hGsFSj5fLtCK5xzpKW의43개/1,703,941bytes, +2,897bytes다. 전체 정적 JS/CSS 크기이며 개별 경로 전송량은 아니다.

실제 Windows 폴더·물리 IME·실계정 화면·실제 파일 적용 중 UI 전환은 별도다. 경로별 진입 시간·네트워크/heap/INP·대규모 파일 성능을 새로 측정하지 않아 속도 개선은 주장하지 않는다. 제한된 로컬 의도 분류이며 자연어 검색 조건 답변·날짜 확장·검색 결과 정리 연결은 다음 단계다.
