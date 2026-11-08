# OpenAI 연결의 문제와 해결 흐름

## 문제와 선택

Gemini 키 검사와 모델 이름이 정식·샘플 서비스, 응답 처리, 전송 확인 화면에 흩어져 있었다. 키만 추가해서는 OpenAI가 호출되지 않으며, 어댑터만 교체하면 Google로 보낸다고 확인한 내용을 OpenAI로 전송할 수 있었다.

공급자 선택·공통 요청·외부 REST 형식의 책임을 나눴다. 기본 fetch와 기존 Zod로 구현해 새 SDK를 설치하지 않았다. 기존 작은 어댑터의 의존성을 유지하기 위한 선택이며 SDK가 불리하다는 일반적인 판단은 아니다. Next Server Action의 인증·Origin·서비스 호출 흐름을 재사용했다.

## 페이지 진입과 전송 확인

1. 정식·샘플 page가 `getAiProvider()`를 호출한다. 환경변수만 확인하고 외부 요청은 하지 않는다. `AI_PROVIDER`가 명시되면 그 값을 따른다. 미지정이면 OpenAI 키가 있을 때 OpenAI, 없으면 Gemini다. 잘못된 값이나 선택한 키가 없으면 null이다.
2. 페이지는 공급자 이름만 클라이언트에 전달하고 `action.bind(null, provider)`로 같은 공급자를 서버 함수의 첫 인수에 고정한다. 키는 전달하지 않는다.
3. 전송 화면은 실제 공급자를 표시한다. 공급자가 바뀌거나 설정이 없으면 이전 확인을 재사용하지 못한다. 클라이언트 확인은 인증을 대신하지 않는다.

## 전송을 누른 뒤의 호출과 반환

1. 정식 화면의 기존 컨트롤러가 선택 원본·발췌를 다시 읽어 확인한다. Server Action은 고정한 공급자와 입력을 서비스로 전달한다.
2. `organizeLive`가 실제 세션·작업 공간, Origin, 요청 ID, 파일 범위·해시·크기·동의를 검사한다. `requireAiProvider(expectedProvider)`는 화면 공급자와 현재 서버 설정이 다르면 예약·전송 전에 실패한다.
3. 기존 `consumeAll`로 요청 중복·작업 공간·계정·전역 횟수를 원자적으로 예약한다. 모델 대기 동안 DB 트랜잭션을 유지하지 않는다.
4. `generateOrganization`은 공급자와 무관한 `{instructions,input,schema,outputTokens}`를 만든다. 같은 지침과 JSON Schema를 `generateAiJson`에 전달한다. 샘플의 단순 분류도 같은 선택 경계를 사용한다.
5. Gemini 어댑터는 이를 `systemInstruction`, `contents`, `generationConfig`로 바꾼다. OpenAI는 Responses의 `instructions`, `input`, `text.format`으로 바꾼다. 업무 규칙은 공급자의 JSON 형식에 의존하지 않는다.
6. OpenAI는 `/v1/responses/input_tokens`로 입력과 스키마의 토큰 수를 계산한다. 정리는 8,192토큰, 분류는 4,096토큰을 넘으면 생성하지 않는다. 출력 상한은 각각 3,200·1,600토큰이다.
7. `/v1/responses`에는 `store:false`, `reasoning.effort:none`을 지정하고 도구를 제공하지 않는다. 응답 저장 옵션이며 모든 공급자 보존 정책이 없다는 뜻은 아니다.
8. HTTP 오류·거절·미완료·예상 밖 출력·잘못된 JSON/usage·64KiB 초과 응답은 사용하지 않는다. 자동 재시도나 다른 공급자 전환도 없다. 실제 응답의 `model` 필드를 결과에 남긴다.
9. 서비스가 다시 세션을 확인하고 기존 본문 근거·문서 ID·날짜·경로 검증을 수행한 결과만 반환한다. 제안은 원본 파일 적용 완료가 아니다.

## 모델 선택과 검증 한계

기본 모델 `gpt-6-luna`는 구조화 출력과 작은 분류 작업을 지원한다. 실제 프로젝트 자료에서 다른 모델보다 품질이나 속도가 낫다고 측정한 선택은 아니다. 같은 합성 자료로 품질·지연·비용을 별도 비교해야 한다.

현재 검증은 합성 REST·세션·DB와 실제 로컬 Next 화면이다. 실제 키 권한·크레딧 소모·모델 품질·Vercel 적용은 검증하지 않았다. 로컬 키 저장 여부만 확인했고 값을 출력하지 않았다.

읽을 순서: `shared/ai-provider` → `server/ai-provider` → `ai-generation`과 `organization-generation` → `openai-generation`과 `gemini-generation` → `live-organization`과 `sample-ai` → page/Action → 전송 확인 UI.

[명세](../specs/openai-provider.md), [검증 기록](../verification/openai-provider/README.md).

공식 근거(2026-11-08): [Responses](https://developers.openai.com/api/reference/resources/responses/methods/create), [토큰 계산](https://developers.openai.com/api/docs/guides/token-counting), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [모델](https://developers.openai.com/api/docs/models/gpt-6-luna).
