# OpenAI 공급자 연결 검증

2026-11-08. [OAI-001~004](../../specs/openai-provider.md), [선택 이유와 호출 흐름](../../reports/openai-provider-reading.md).

공개 전 추가 점검에서 키만으로 익명 샘플의 유료 호출이 켜지는 경계를 발견해 공개 기본 비활성 정책을 추가했다. `sample-public-ai.test.ts`는 직접 서비스 호출·Vercel·명시 허용·잘못된 값·로컬 호환성 7개를 검증한다. 아래 수치와 빌드는 최초 공급자 구현 당시 기록이며 최신 결과는 [공개 전 점검](../publish-safety/2026-11-08/README.md)을 따른다.

## 실행 결과

- 전체 단위 테스트: `pnpm exec vitest run --maxWorkers=4`, 112파일 1,081개 통과. 기존 1,059개에 신규 22개 추가.
- `pnpm typecheck`, `pnpm lint`, `pnpm build` 통과. Next 16.4.3, React 19.3.1, Zod 4.6.7. 패키지·lockfile 변경 없음.
- 서버 경계 21개, 구조 경계 25+6+3개 통과.
- `check-provider-consent.mjs`: 실제 전송 확인 UI·컨트롤러 11개 통과. 키보드 Space, 공급자 전환·되돌아옴의 확인 무효화, 설정 누락, 390/768/1440/1920px, 명시 전송 1회·자동 재시도 없음. 파일·신원·전송은 합성이다.
- `check-provider-production.mjs`: 실제 로컬 Next 화면 8개 통과. 비로그인 보호, 서명된 샘플 진입, 서버의 OpenAI 선택 표시, 기본 미동의, 4개 폭, 예외 없음. 전송 버튼을 누르지 않았다.
- `check-live-ai-action.mjs http://127.0.0.1:3035 docs/verification/openai-provider`: 실제 Server Action의 비로그인·교차 Origin 차단 2개 통과. 교차 Origin의 500 로그는 의도한 Next 차단 결과다.
- Architecture 검토: 키 격리·공급자 고정·인증과 예약 유지·응답 처리에서 차단할 결함 없음. 정식 합의 워크플로 승인으로 확대하지 않는다.

## 검증한 경계와 초기 실패

OpenAI REST는 모두 fetch 대체다. `openai-organization.test.ts`는 실제 지침→어댑터→본문 근거 파서를 실행하고 인증·예약·네트워크만 대체했다. 취소·거절·미완료·잘못된 JSON/usage·과대 응답·HTTP 오류·토큰 초과·공급자 불일치·공개 전 세션 폐기를 확인했다. 기존 Gemini 검사도 유지했다.

첫 신규 테스트는 어댑터 미구현으로 import 실패했고 구현 후 통과했다. 첫 프로덕션 표시 검사는 로컬 OpenAI 환경변수가 디스크에 저장되지 않아 실패했다. 사용자 저장 후 서버 재시작과 최종 빌드에서 통과했다. 키 원문은 요청하거나 출력하지 않았다. Python 실행 접근 불가와 fixture 테마 누락은 각각 Node 사용과 기존 UI 토큰 적용으로 해결했다. 이를 제품 모델 실패로 기록하지 않는다.

## 산출물과 한계

- 최종 빌드 `9bPpyJnSghh2mt8NRGUrN`, 기준 `6KuNxfx08cg8eEG7iOsHH`.
- JS/CSS 42파일: 1,700,147 → 1,700,804바이트, 증가 657바이트.
- 공개 산출물의 실제 OpenAI/Gemini 키·인증 비밀값 일치 0개. 값은 증거에 기록하지 않았다.
- [변경 전](assets-before.json), [변경 후](assets-after.json), [UI](browser-checks.json), [프로덕션 화면](production-browser-checks.json), [Action HTTP](production-action.json).
- 실제 모델 호출 0회. DB 스키마 변경·커밋·push·배포 없음. 기존 사용자 변경 보존.

657바이트는 전체 산출물 차이이며 화면 전송량·로딩 지연이 아니다. 모델 품질·시간·크레딧 적용·실계정 설정 캐시 지연·비용, Windows 디스크/권한·물리 IME는 미검증이다.

키를 추가한 Vercel에 이 소스가 배포되어야 운영에 반영된다. 합성 자료의 실제 Gemini/OpenAI 품질·지연 비교와 유료 또는 크레딧 소모 검증은 별도 실행이며 이번에 완료하지 않았다.
