# 브라우저 경계 개선과 후속 검증 — 2026-11-09

사용자는 앞서 확인한 대체 가능한 window 사용과 구조를 최대한 개선한 뒤 다음 작업을 이어가라고 요청했다. 승인된 화면·인증 규칙·탭 간 동기화·원본 보호를 유지하는 로컬 변경이다.

## 변경 순서와 경계

1. 내부 구독의 실제 반복 책임만 작은 typed signal로 묶는다. 전역 window 사용자 정의 이벤트를 제거하고 발행자/구독자를 명시적으로 import한다. 인증 폐기는 모든 구독자에게 동기적으로 전달하며 한 구독자의 예외가 다른 정리를 막지 않게 한다. 구독 해제·중복/재진입·예외를 먼저 검사한다.
2. QuickSwitchButton은 좌표 callback을 받는 표시 컴포넌트로 바꾼다. 같은 feature의 요청 구독이 root 메뉴로 전달한다. 실제 pointer/키보드/모달·위치/초점·차단 규칙은 기존 hook에 남긴다. 테스트도 제거한 전역 이벤트를 다시 붙이지 않고 실제 조작이나 공개 feature API를 사용한다.
3. 같은 탭의 인증 변경/폐기를 명시적인 subscribe/notify 함수로 옮긴다. includeCurrent=true는 같은 탭을 먼저 동기 알리고 false는 다른 탭만 알린다. revoke는 모든 정리를 동기 전달한 뒤 화면/이동/재검사를 진행하며 source/id 중복 제거를 유지한다. BroadcastChannel/storage/focus/pageshow/pagehide/visibilitychange와 인증 재검사·만료·늦은 응답 폐기는 유지한다. 실제 탭 간 신호는 서버 인증을 대신하지 않는다.
4. 반복된 raw 문자열 저장·구독·storage 키 필터·저장 실패 시 탭 내 보존은 작은 browser string store로 재사용한다. 대상은 정확히 네 키(moa-auth-input/sessionStorage, moa-signup-draft-v1/localStorage, moa-quick-switch-v1/localStorage, moa-editor-autosave-seconds-v1/localStorage)다. 인증 탭 알림 키·비상 문서 복구·샘플 세션은 제외한다. 메모리 대체값 없음/문자열/삭제(null)를 구분하고 실패한 삭제 표식을 이후 외부 이벤트가 지우지 않는다. factory에서는 브라우저 저장소를 읽지 않는다. JSON 파싱/검증은 각 기능에 유지하고 기존 key·수명·비밀번호 미저장을 지킨다. signup 순수 규칙에서 브라우저 저장/이벤트를 제거한다.
5. AiRecordsController가 구체 repository를 생성하지 않게 저장 동작을 주입한다. 현재 조립 hook에서 session/picker/repository를 만든다. 기존 저장·삭제 revision·owner·실패/중지 계약과 repository 공개 기능을 유지한다. 전달만 하는 새 service 계층은 만들지 않는다.
6. 이후 기존 기능의 실패 경로·연결 검증과 배포 전 로컬 준비 점검을 이어간다. 과거1~9 완료 내용을 새 기능처럼 다시 구현하지 않는다. 후속 기능의 우선순위는 별도로 확인 중이다. 새 의존성·유료 AI·운영 DB 변경·개인 파일·커밋/푸시/배포는 이 작업에 포함하지 않는다.

## 검증과 완료 조건

기존 관련 검사로 동작을 고정하고 새 실패 검사 → 작은 책임별 변경 → 관련 검사 → 실제 제품 브라우저의 퀵메뉴·인증/가입/탭·채팅 중지·파일 왕복/저장·설정 회귀 → 전체 검사·타입·린트·경계·빌드 순서다. 필요하면 기존 임시 DB 인증 harness를 사용한다. 검토는 구현과 분리한다.

개발 서버80930은 네트워크가 허용된 환경에서 실행 중이다. typecheck/build/Prisma generate 전 해당 서버만 중지하며, 끝나면 같은 허용 환경에서3034로 복구하고 폼6회뿐 아니라 세션API200/null을 검사한다. raw 서버 로그는 비밀 가능성 때문에 출력하지 않는다. 실제 소셜 완료·물리 IME·Windows 권한 창·현장 성능과 자동/합성 검증은 구별한다.

구현·현재 기능 검증·배포 전 로컬 준비 점검을 완료했다. [실제 근거와 남은 범위](../verification/browser-boundary-improvement/README.md)를 따른다. 최종 dev는31578이며 정상 네트워크 환경에서3034로 복구해 세션API까지 확인했다. 커밋/푸시/배포는 실행하지 않았다.
