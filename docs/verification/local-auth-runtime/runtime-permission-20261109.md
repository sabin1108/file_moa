# 로컬 인증 접속 복구와 브라우저 의존성 검토

2026-11-09. 사용자 제보의 `auth-diagnostics.ts:44`는 실패를 기록한 위치다. 로그인 화면200/health200과 별개로 실제 `/api/auth/get-session`은503이었다.

## 확인한 원인과 복구

- 개발 서버67457이 네트워크가 제한된 실행 환경에서 시작됐다. 같은 환경의 런타임 DB 읽기는 `EACCES`, 네트워크가 허용된 환경에서는 TLS 검증·제한 runtime 역할·인증 테이블 접근 권한 검사가 통과했다. 사용자 행이나 비밀은 출력하지 않았다.
- 이전 기록의 같은 장애를 재발시킨 실행 실수다. 제한된 서버만 종료하고 같은 프로젝트·설정·포트의 `pnpm dev`를 DB 접속이 허용되는 환경에서 다시 시작했다. 현재 소유 서버80930, 주소 `http://127.0.0.1:3034`다.
- TLS·DB 권한·Origin/CSRF·인증 규칙·세션 검사를 완화하지 않았다. 작업자가 시작하는 dev 프로세스는 DB 네트워크 접근이 허용돼야 하며, 로그인 폼 표시만으로 복구를 판정하면 안 된다.

## 제품 코드와 검사 보완

`server/auth-diagnostics.ts`는 일반 `INTERNAL_SERVER_ERROR`가 앞에 있어도 뒤의 실제 원인 코드를 우선한다. `EACCES`와 정해진 오류 종류만 기록하고 원본 오류 메시지·stack·본문·토큰·임의 이름은 기록하지 않는다. `auth-diagnostics.test.ts`에서 원인 우선순위와 정보 노출 방지를 확인했다. 기존 회귀는 먼저 실패한 뒤 구현 후 통과했다.

`check-dev-login-stability.mjs`는 화면6회 유지·강제 reload/예외뿐 아니라 익명 세션 API의 **200/null**도 확인한다. 이전 검사는 화면만 보고 실제 DB 요청의 실패를 놓칠 수 있었다. [이번 관측](runtime-permission-20261109-dev.json).

[합성 로그인 거부 검사](runtime-permission-20261109-login.json)도 HTTP401/INVALID_EMAIL_OR_PASSWORD로 통과했다. 실제 계정을 생성하거나 개인 비밀번호를 사용하지 않았다. 로그인 시작은 요청 제한 상태를 바꿀 수 있으므로 전체 복구 검증을 읽기 전용이라고 부르지 않는다. 최초 PowerShell 응답 파서가401 본문을 읽지 못해 같은 합성 자격으로 한 번 더 확인했으며 총2회 요청했다. OAuth 시작·외부 인증·메일·모델 호출은 하지 않았다.

전체148파일1301개는 `pnpm exec vitest run --maxWorkers 2`로 통과했다. 기본 병렬 실행은 호스트가 느린 상태에서 기존 인증 import·복구 테스트3개가5초 timeout에 걸렸다. 검증 실행의 동시 작업 수만 낮췄고 제품 코드나 테스트 timeout은 늘리지 않았다. 타입·린트·production 빌드 `dswE-Eho8dU3cw1uSW0SV`, 서버 경계26·구조25+6+3·스크립트 문법·공백 검사를 통과했다. dev가 실행 중일 때 build/typecheck/Prisma generate를 병행하지 않는다.

## window와 아키텍처

정적 코드 근거로 보면 도메인이 React/Next/DB/브라우저에 의존하지 않는 기능별 계층 구조다. `SourceListingController`는 읽기 함수를 주입받지만 `AiRecordsController`는 구체적인 `AiRecordRepository`를 직접 만들므로, 모든 유스케이스가 외부 구현에서 완전히 독립된 형태라고 표현하지 않는다.

| 사용처 | 역할과 대체 가능성 |
| --- | --- |
| `components/ui/QuickSwitchButton.tsx:8` | 앱 내부 열기 알림을 window CustomEvent로 전송한다. 공통 provider/controller callback으로 대체 가능한 후보다. |
| `shared/auth-session-events.ts:8` | 같은 탭의 인증 변경 알림은 session store/listener로 옮길 수 있다. 다른 탭의 변경 전달은 BroadcastChannel/storage라는 실제 브라우저 통신을 유지해야 한다. |
| `features/auth/hooks/useSignupFlow.ts` | 같은 탭 draft 알림은 명시적인 store로 옮길 수 있다. localStorage와 탭 간 storage 구독·URL/history 복원은 별도의 브라우저 경계다. |
| `RecordEditor.tsx`의 window.setTimeout | setTimeout으로 적어도 같은 API이므로 의존성이 줄지 않는다. 지연 저장·취소 수명을 보존하는지가 중요하다. |
| 폴더 선택·IndexedDB·File System·locks·beforeunload·focus·history | 실제 브라우저 기능이다. 필요한 어댑터/서비스 경계에 두고 핵심 규칙에서 분리한다. 문자열을 없애려고 wrapper를 늘리지 않는다. |

이번 작업에서는 인증 복구·안전한 진단·복구 검증만 수정했다. window 전체 치환이나 새 공통 이벤트 구조는 도입하지 않았다. 실제 사용자 비밀번호·개인 세션을 사용한 로그인, 외부 소셜 인증 완료·메일·AI 호출은 검증하지 않았다.
