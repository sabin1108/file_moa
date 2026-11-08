# 정식 TXT/MD 로컬 자료 준비 — 2026-11-07

2026-11-08 후속: [전송 직전 재검사·정식 Action 경계](../live-ai-transfer/README.md)를 연결했다. 아래941검사/Worker/성능/캡처는 당시 기록이다. `browser-checks.json`만 이번 로컬 준비 회귀28검사의 성공 결과로 갱신했으며 [이번 실행 원자료](../live-ai-transfer/local-regression/browser-checks.json)도 별도 보관했다.

[명세](../../specs/live-txt-md-consent.md)의 첫 단위를 구현했다. **로컬 범위 확인·읽기·발췌·전송 후보 확인까지**다. 정식 개인 문서의 AI 전송·의미 판단·원본 적용은 미연결이다.

## 사용 흐름과 변경 책임

폴더 연결 → 채팅에 요청 입력 → ‘자료 준비’ → 범위가 미정이면 전체/하위/선택 확인 → TXT/MD 재귀 읽기 → 발췌·제외·부분 범위 확인 → 후보 선택/확인 동의다. 참고할 폴더 구조와 목적지는 scope를 바꾸지 않는다. 기본 경로/예시를 사용자의 의도로 자동 추론하지 않는다.

1. [LiveConversation](../../../apps/web/src/features/conversation-workspace/components/LiveConversation.tsx): 공통 대화 UI와 로컬 상태를 조합한다.
2. [OrganizationPreparationController](../../../apps/web/src/features/local-folders/store/organization-preparation-controller.ts): 요청/조건·읽기 수명·후보/동의 상태. 기존 연결 controller/Provider가 소유해 화면 이동 때 보존하고 연결/계정 변경 때 폐기한다.
3. `connection-session.inspectSourceSnapshot` → [source-snapshot](../../../apps/web/src/features/local-folders/services/source-snapshot.ts): 소유자/연결/권한·취소를 검사한 읽기 전용 재귀 수집. 내부 기록/보관함 제외, 2MiB·500문서·50MiB 및 탐색 상한.
4. 기존 `copy-hash` Worker에 텍스트 읽기를 추가했다. 같은 바이트의 전체 해시/UTF-8·발췌/발췌 해시. 복사 검사의 `hash(file)` 프로토콜은 유지한다.
5. 공통 후보 제한 함수를 `shared/organization-candidates`로 승격하고 샘플의 이전 import는 재export한다. `ConversationWorkspace`, `DestinationFolderPicker`/`DestinationPathForm`, `SourceFileRow`, 공통 버튼/알림/토큰을 재사용한다. 새 패키지는 없다.

기능을 실제 줄/호출/반환 순서로 읽는 설명은 [코드 흐름](../../reports/live-local-preparation-reading.md)에 있다. 기존 [주요 기능 안내](../../코드_이해하기.md)의 18-6절도 갱신했다.

## 실행한 검증

- 사전 새 service/controller 2 suite의 미구현 import 실패를 확인하고 구현했다. 새 19개 사례를 포함해 `pnpm test --maxWorkers=4`: **941검사/95파일 통과**. 재귀·선택 범위 비확장·내부 기록/형식 제외·UTF-8/크기·500문서/50MiB·부분 결과·내용 버전 변경·권한 철회·취소·소유자/연결 교체·늦은 응답·동의 폐기를 검증했다.
- `pnpm typecheck`, `pnpm lint`, `pnpm build` 통과. Next16.4.3/React19.3.1/TS5.9.3, 최종 빌드 `ezRMm0o4DVd0puRdXx7z3`, 52페이지 생성. 로그인 파일의 단독 `ㅋ`는 사용자가 제거한 현재 상태를 확인했으며 이번 기능 작업에서 인증 코드는 수정하지 않았다.
- `pnpm test:boundaries`:21, `pnpm test:structure`:web25/domain6/layout3 및 실제 domain import 검사 통과. `git -c core.safecrlf=false diff --check` 통과.
- 주요 안내/명세/이번 흐름/검증 문서의 로컬 링크119개 확인. 네 폭의 캡처를 직접 확인했다.
- `node tests/browser/check-live-local-preparation.mjs`: **28검사 통과**. 실제 제품 컴포넌트·Provider/session·실제 Worker/IndexedDB·합성 OPFS 폴더, Next 탐색 shim. 범위 미정 시 본문 읽기0, 참고/목적지 독립, 본문 뒤쪽의 단어 발췌·독립 SHA256 대조, 선택 제외 시 동의 폐기, 패널10회 상태/초점, 화면 재마운트 보존, 파일 선택 범위 비확장, 취소 후 늦은 결과 폐기, 소유자/F5 초기화. 외부 요청/POST0·제품 쓰기0·원본 sentinel 동일. [원자료](browser-checks.json), 캡처 prepared-390/768/1440/1920.png.
- `node tests/browser/check-production-snapshot-worker.mjs http://127.0.0.1:3035`: **최종 Next production Worker**의 바이너리 해시·텍스트 발췌/해시·잘못된 UTF-8 결과 확인. 공개 정적 Worker bootstrap을 재구성해 합성 File을 보냈으며 정식 로그인 경로 우회가 아니다. [원자료](production-worker.json).
- 기존 `check-conversation-organization.mjs`의 browser 시나리오를 검증용 복사본에서 base만3035/output만별도경로로 바꿔 **샘플 회귀17검사 통과**. 공통 화면·자료 창·초안·동의·IME·Shift+Enter·네 폭·샘플 격리/모델 요청0. [원자료](sample-regression/browser-checks.json). 원본 검사 스크립트는 변경하지 않았다.
- 전후 production 54+54표본과 신규 준비4표본은 [성능 기록](performance.md). 정적 JS/CSS 원본 순증33.6KiB, 측정 guest 경로 전송 중앙값 동일/CLS0. 작은 캐시 표본이며 인증된 정식 페이지·실사용 INP/물리 디스크를 대표하지 않는다.

브라우저에서 Worker의 shared import를 classic 모드로 실행해 `Cannot use import statement outside a module`을 재현했다. 생성 옵션을 module로 바꾸고 기존 binary/text Worker 회귀와 최종 Next 패키징을 확인했다. 초기 검사 도구의 disabled 버튼/전환 대기 오류도 구분해 수정했다. 화면 확인 후 조건 접기·공통 파일 행의 host 높이·viewport 전환 완료 후 캡처를 보완했다.

## 범위와 남은 일

- LT-T01~03은 **사용자가 필드로 확인한 범위/기준**의 분리/확인/재질문 방지 부분을 검사했다. 자연어에서 명시 범위를 추론하는 AI는 미연결이다.
- LT-T07~10의 로컬 전송0/조건 변경·취소/불완전 결과·F5 부분을 검사했다. 외부 프로그램의 변경을 계속 감시하지 않는다. 같은 조건의 새 읽기에서 동의를 버리며, 실제 전송/적용 직전 전체 해시 재검사는 다음 단위에 필요하다.
- LT-T04~06의 혼합/날짜 의미 질문·복사/이동 검토 선택, T11의 실제 적용 전 해시 중단, T12의 **정식 endpoint** 응답 검증은 아직 완료로 세지 않는다. 기존 샘플 검증과 정식 연결 완료를 구분한다.
- 실제 Windows 디스크·네이티브 권한 창·물리 IME·일반 PDF/XLSX·개인 데이터 전송·전체 인증 여정·대용량 실사용 성능은 미검증이다. 상태/본문/동의를 영구 저장하거나 외부 모델을 호출하지 않았다.
- 다음 단위는 전송 직전 버전 재검사와 인증된 Server Action/사용량·멱등성·Origin·payload 계약이다. 이미 확인한 준비 상태를 자동 전송하는 방식으로 연결하지 않는다. 기존 전체 선택 해제 UX 미해결 항목은 이번에 수정하지 않았다.

외부 배포·커밋·push는 수행하지 않았다. 검증용3035 서버는 마감 후 종료한다. 기존3034 프로세스는 건드리지 않는다.
