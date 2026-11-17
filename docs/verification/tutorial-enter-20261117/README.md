# 튜토리얼 Enter 지원

공용 `WorkspaceTourOverlay`의 dialog 안에서 일반 Enter를 다음/완료와 같은 경로로 처리한다. 버튼과 키보드가 같은 `advance` 함수를 사용한다. 화면 준비 전 이동, 키 반복, 수정 키, 이미 처리한 이벤트와 IME 조합을 차단한다. 편집 요소와 버튼·링크에 초점이 있으면 원래 Enter 동작을 유지한다.

변경 전 실제 오버레이의 제목에 Enter를 보내도 1단계에 머무는 것을 재현했다. `tour-keyboard.tsx`는 실제 오버레이를 그대로 사용하는 최소 브라우저 fixture이며 `tests/browser/tutorial-enter-checks.mjs`가 이동·마지막 완료, 폼 제출·줄바꿈, 이전/다음의 단일 이동, 건너뛰기, 합성 IME·반복·수정 키·준비 전 차단을 확인한다. 로컬에서 모든 검사를 통과했다.

관련 onboarding 테스트 16개와 타입·린트·빌드를 통과했다. 린트는 기존 `_count` 경고 1개이고 새 경고는 없다. 실제 운영 데모의 19단계 Enter 이동과 완료 결과는 `.omx/verification/tutorial-enter-20261117/production.json`에 기록한다. 물리 한글 입력기 검사는 합성 composition 검사와 구별하며 AI 호출·파일 작업·성능 벤치마크는 수행하지 않는다.
