# 브라우저 경계 개선·현재 기능 검증·배포 준비

2026-11-09. 사용자는 대체 가능한 window 사용과 구조를 개선하고 후속 작업은 **현재 기능 검증·배포 준비**로 진행하라고 선택했다. [계획과 보존 계약](../../planning/browser-boundary-improvement.md).

## 변경과 단순화

- 앱 내부의 window 사용자 정의 이벤트를 제거했다. 빠른 전환 버튼은 좌표 callback을 받고, 기능의 명시적인 구독이 메뉴 hook으로 전달한다. 포인터·키보드·모달·차단·초점 규칙은 기존 구현을 재사용한다. 구형 이벤트 이름과 전역 listener를 함께 남기지 않았다.
- 같은 탭 인증 변경/폐기는 명시적인 구독 함수로 전달한다. includeCurrent=false는 현재 탭에 다시 알리지 않으며, 인증 폐기는 모든 정리를 동기 실행한 뒤 구독자 오류를 보고한다. 다른 탭의 BroadcastChannel/storage와 source/id 중복 제거·실제 서버 재검사는 유지한다.
- 채널 생성·메시지 처리기 등록·close가 차단돼도 두 인증 관찰자가 같은 탭/storage/focus/pageshow 구독과 정리를 계속하도록 보완했다. 구독자 한 곳의 실패가 나머지 인증 정리를 막지 않는다.
- 인증 초안·가입 초안·빠른 전환 설정·자동 저장 설정의 네 키만 문자열 저장/구독을 공유한다. JSON 검증은 각 기능에 남기고 키·저장소 종류·수명·비밀번호 미저장을 유지한다. 실패한 쓰기는 현재 탭에 보존하고 삭제 실패는 null 표식으로 구분한다. 외부 이벤트가 이 표식을 지워 이전 이메일을 다시 드러내지 않는다. 물리 저장소가 차단된 상태의 삭제 성공을 보장하지 않는다.
- signup 순수 규칙에서 브라우저 저장/이벤트를 제거했다. 중복된 편집 상태와 알림용 effect도 줄였다. 원시 문자열을 저장하는 공통 책임만 추출했고 인증 탭 알림 키·비상 문서 복구·샘플 세션은 합치지 않았다.
- AiRecordsController는 구체 repository를 생성하지 않고 필요한 저장 동작을 주입받는다. 기존 연결 hook이 같은 session/picker/repository를 수명 동안 조립한다. owner·연결 revision·삭제·실패/늦은 결과 차단은 유지한다. controller 검사에서 외부 class mock을 제거하고 주입한 저장소로 검증한다.

핵심 도메인은 여전히 React/Next/DB/브라우저에 의존하지 않는다. 폴더 선택·IndexedDB·locks·history·페이지 수명처럼 실제 브라우저 기능은 해당 경계에 남겼다. window 표기만 지우는 wrapper나 새 패키지는 추가하지 않았다. 승인된 화면 구성과 원본 자료를 변경하지 않았다.

## 읽을 파일 순서

1. `shared/signal.ts`, `browser-string-store.ts`: 타입 있는 동기 구독, 독립 구독 해제, 저장 실패 시 탭 내 대체값과 native storage 필터.
2. `features/quick-switch/store/quick-requests.ts` → `QuickSwitchSettings.tsx`/`components/ui/QuickSwitchButton.tsx` → `use-quick-switch.ts`: 표시 callback과 명시적인 기능 요청.
3. `shared/auth-session-events.ts` → `SessionBoundary.tsx`/`GuestSessionObserver.tsx` → 대화/폴더 hooks: 현재 탭/다른 탭/권한 폐기의 전달과 정리 순서.
4. `features/auth/store/*` → `useAuthDraft.ts`/`useSignupFlow.ts`, quick/editor preference store와 EditorSettings: 브라우저 저장 책임과 폼/규칙 분리.
5. `ai-records/store/ai-records-controller.ts` → `local-folders/hooks/use-source-folder-connection.ts`: 저장 포트와 조립 위치. 파일 접근 구현은 기존 repository다.

## 검증 근거

- 변경 전 관련18파일107개 통과. 새 구독/저장/인증 전달 계약의 실패 검사를 먼저 확인하고 구현했다.
- 최종151파일 **1315개** 통과(`pnpm exec vitest run --maxWorkers 2`). 타입·린트·서버 경계26·구조25+6+3·S0 모듈164·production 빌드 **`wZgjFd0kGlrFWBZAuub7q`** 통과. S0는 제한된 브라우저 시작의 Page.enable timeout 후 정상 실행 환경에서 통과했으며 제품 오류로 판정하지 않는다.
- [인증/모션36개](browser/auth-motion/checks.json): 실제 폼·가입 단계/URL/IME/모션/네 너비를 유지한다. 저장이 차단돼도 로그인/가입 입력을 보존하고 비밀번호를 저장하지 않으며, 채널 생성이 던져도 실제 두 인증 관찰자의 같은 탭/focus 검사가 계속 동작한다.
- [일반 대화40개](browser/chat/checks.json), [기록29개](browser/records/records-checks.json): 인증 폐기/중지/미표시 본문 취소·자료 작업 연결·초안·편집·저장/복원·owner·연결 해제 실패·초점 복귀 확인. 합성 SSE/OPFS이며 유료 모델이나 개인 자료를 사용하지 않는다.
- [빠른 전환42개](browser/navigation/browser-checks.json), [텍스트/모달 등19개](browser/quick-contexts/checks.json): 실제 키보드/버튼·hold·포커스·선택·차단·390/768/1440/1920px·공개 인증 화면 범위 확인.
- [실제 두 탭 설정10개](browser/preferences/checks.json): native storage 양방향 동기화, 저장 실패 시 현재 탭만 적용/안내, 외부 쓰기로 미저장 값을 버리지 않기, reload 후 실제 저장값 복원, callback의 현재 탭 메뉴 열기와390px 확인.
- [실제 Next 인증169개](auth-browser/checks.json): 같은 최종 빌드·일회용 PostgreSQL·strict TLS·합성 계정·로컬 메일 캡처로 가입/확인/로그인/프로필/재설정/연결과 다른 탭 알림 회귀 통과. [인증된 경로별36표본](auth-browser/performance-authenticated.json)은 빈 OPFS/로컬 DB/캐시 끔/350ms 관측이다. 운영 소셜 인증·field INP의 근거가 아니다.
- [production 설정·이동26개](production/settings-loading-checks.json), [게스트/샘플 경로·history9개](performance/routes-assets.json) 통과. 실제 계정 화면 속도 개선율로 해석하지 않는다.

검사 도구도 제거된 전역 이벤트 대신 실제 버튼/단축키·공개 기능 API·native storage 신호를 사용한다. 샘플 세션을 먼저 시작한 뒤 설정에 진입하고, 기존 읽기 폭을1100px 이상이라고 강제하던 가정도 제거했다. 모듈 shim의 router 객체 수명을 실제 Next와 맞췄다. 격리 검사 무작위 포트가 브라우저 차단 포트에 배정된 경우는 안전한 fixture 포트로 바꿨다. 초기 fixture 실패는 최종 통과와 구분해 보존한다.

## 배포 준비

- [현재 소스 명세](release/source-manifest.json): 코드/공개 자산/Prisma/패키지·설정 입력477개의 SHA-256 목록과 합산 해시. 비밀 환경 파일·생성물·검증 결과·Git 내부는 제외한다. 이는 현재 로컬 소스의 지문이며 서명된 릴리스나 원격 배포가 아니다.
- GitHub 연결의 main 조회와 로컬 HEAD는 `7d69879fcecf17896127265155efa5079f2115e5`로 같았다. 현재 기능 변경은 미커밋 상태이므로 해당 원격 커밋에 포함돼 있지 않다. 기존 대규모 변경을 되돌리거나 임의로 커밋/푸시/배포하지 않았다.
- 코드/문서의 실제 설정 비밀8값 및 자격 증명 형태 검사에서 노출0, 공백 검사 통과. [production 클라이언트 JS/CSS](release/client-secrets.json)도 실제 설정8값 노출0을 별도 확인했다. `.env.local`은 Git 제외다. 최종 스캔 범위/결과는 [로컬 준비 판정](release/readiness.md)을 따른다.
- 운영 점검 문서의 오래된3회/원장 미구현 설명을 현재10회/원장 활성화 기준과 구분했고, 실패 시 실행 환경·세션 API를 확인하는 절차를 추가했다. 원래 로드맵의 과거 ‘미구현’과 현재 구현을 구분했다.
- Node는 shell24.16.0, pnpm runtime24.22.1, pnpm12.15.0을 확인했다. package/lockfile/의존성 변경은 없다. 새 운영 migration·실제 계정/개인 원본 변경·유료 AI·외부 메일·배포는 실행하지 않았다.

## 성능과 남은 범위

전체49JS/CSS는3,617,630→3,614,658bytes로 **2,972bytes 감소**했다. 전체 산출물 합산이며 초기 다운로드가 아니다. [100/500turn 각각3회](browser/records/long-conversation.json)의 렌더/heap과 실제 경로별 자료를 보존했으며 조건이 다른 이전 표본과 속도 개선율을 계산하지 않는다. 실제 모델 응답 시간도 이번에 재측정하지 않았다.

실제 Windows 권한 창·물리 한글 IME·실계정 소셜 복귀·운영 전체 지연/장기 부하·실제 배포는 남았다. 새 OCR/의미 검색·로컬 AI·위키/성장은 이번 우선순위에 포함하지 않았다. 사용자 선택에 따라 기존 기능의 검증과 배포 전 로컬 준비까지 진행했다.
