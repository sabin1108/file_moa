# 다음 세션 시작점 — 2026-11-09

기준은 이 문서를 포함하는 커밋과 실제 원격 main이다. 사용자 요청은 지금까지의 작업 커밋·푸시 후 즉시 이어갈 수 있는 memory 인수인계다. 실제 최종 SHA·푸시/자동 배포 상태·개발 서버는 `E:/memory/chatbotfolder` 최신 절에 기록한다. 아래 과거 보고서의 ‘미커밋/배포 없음’은 그 보고서 작성 시점의 결과다.

## 먼저 확인할 것

1. memory의 README → HANDOFF 최신 절 → NEXT_SESSION_PROMPT → NEXT_STEPS, 저장소 DESIGN 최신 절을 읽는다. 실제 git 상태/HEAD/원격 main과 기록을 대조한다. 완료된 초기1~9를 다시 구현하지 않는다.
2. [브라우저 경계·후속 검증](../verification/browser-boundary-improvement/README.md), [현재 UX](../verification/workspace-ux-rebuild/README.md), [1~5 후속](../verification/first-five/README.md)을 현재 기능 근거로 사용한다. 필요한 기능만 [1~9 추적](workspace-nine.md)에서 추가 확인한다.
3. 개발 서버는 `http://127.0.0.1:3034`다. **DB 네트워크가 허용되는 환경**에서 실행해야 한다. 제한 환경의 dev는 EACCES로 실제 인증이 실패했다. health/폼 표시만으로 판정하지 말고 익명 세션 API200/null을 확인한다. raw 서버 로그에는 OAuth/쿠키가 있을 수 있어 전체 출력하지 않는다.
4. typecheck/build/Prisma generate 전 소유 dev만 중지한다. 이후 허용 환경에서 복구하고 `node tests/browser/check-dev-login-stability.mjs http://127.0.0.1:3034 <출력경로>`로6회 폼 유지·reload0·session200/null을 확인한다.

## 이어갈 순서

1. **이번 커밋의 원격/자동 배포 확인.** memory 최신 배포 상태가 pending이면 GitHub의 해당 SHA 상태부터 확인한다. 이전 SHA의 성공을 현재 성공으로 보고하지 않는다. 성공 후 공개 health/로그인/익명 세션과 게스트 보호 경로를 최소 확인한다. 자동 배포 실패는 해당 빌드 오류부터 조사하며 개인 키/로그 원문을 출력하지 않는다.
2. **실제 사용자 환경 확인의 빈틈 정리.** 실제 소셜 로그인 복귀·물리 한글 IME·Windows 권한 승인/거부/철회·외부 프로그램의 파일 변경은 자동 합성 검증과 구분한다. 기존 복구 가능한 테스트 자료와 체크리스트를 사용하고 개인 폴더를 전수 탐색하지 않는다. OS 보안 권한을 자동 승인하지 않는다.
3. **사용자 피드백과 운영 근거 보완.** 통합 대화/기록함의 실제 사용 흐름을 우선하고, 실제 계정·원격 DB·브라우저 전체 지연과 장기 사용량/메모리는 별도 측정 계획으로 잡는다. 새 유료 모델 요청은 과거 승인 횟수를 재사용하지 않는다. 합성/로컬 수치를 실사용 개선율로 표현하지 않는다.

## 현재 확정한 계약

- 일반 대화·자료 찾기·정리는 하나의 대화와 입력이다. 애매할 때만 확인한다. 자료 범위/발췌·전송 동의·원본 변경 검토는 유지한다.
- 입력 위는 자료 연결/저장 상태/설정, 옆 패널은 기록/자료/설정이다. 편집·초안·스크롤은 패널 전환으로 지우지 않는다. 실제 프로젝트 이름 저장소는 없어 식별자는 고급 설정이다.
- 내부 window 사용자 정의 이벤트는 명시적인 callback/구독으로 대체했다. native storage/BroadcastChannel/수명·권한 API는 필요한 경계에 남긴다. 삭제 실패 표식과 탭 내 미저장 대체값을 외부 이벤트로 버리지 않는다.
- 인증 변경의 includeCurrent=false는 현재 탭에 다시 알리지 않고, revoke는 모든 구독자에게 동기 전달한다. 차단된 채널 생성/close도 나머지 구독/정리를 막지 않는다.
- 원본 보호·owner/workspace·연결 revision·기억 명시 승인·실패/취소 후 늦은 결과 차단·현재10회 제한은 유지한다. 제한 제거·Kakao 재개·OCR/의미 검색·로컬 AI·위키/성장은 별도 후속이다.

## 검증된 기준과 파일

최종151파일1315개(`pnpm exec vitest run --maxWorkers 2`)·타입·린트·경계26/구조25+6+3·S0 164·빌드 wZgjFd0kGlrFWBZAuub7q. 같은 빌드의 실제 Next/일회용PG/합성계정/로컬메일169개, 인증/모션36·대화40·기록29·퀵메뉴42+19·두탭설정10·production26 통과. 실제 소셜/물리 확인과 합성/자동 검사 한계를 유지한다.

브라우저 경계 변경을 읽을 때는 `shared/signal.ts`/`browser-string-store.ts` → auth session/초안 stores/hooks → quick callback/구독 → AI records controller와 연결 hook 조립 순서다. 실제 호출과 상태 변화로 설명하고 새 범용 계층을 늘리지 않는다. 자세한 변경·표본 조건·릴리스 후보477개 입력 명세는 최신 검증 보고서를 따른다.
