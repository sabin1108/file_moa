# 제품 소스 읽기 안내

처음부터 전체 구조와 실행 원리를 배우려면 [모아 전체 코드 흐름 설명서](../../../docs/모아_전체_코드_흐름_설명서.md)를 읽는다. 큰 페이지에서 작은 부품으로 내려가며 호출·입력·반환·상태 변화와 분리 이유를30개 장으로 설명한다.

사용자 행동부터 따라 읽을 때는 [화면에서 시작하는 코드 설명서](../../../docs/코드_이해하기.md), 기능 사이 연결을 찾을 때는 [실행 흐름과 리뷰 지도](../../../docs/code-map.md)를 읽는다.

2026-11-13: 기능을 먼저 찾고 그 안에서 상위 조립 → 화면·상태 → 작은 규칙·외부 접근으로 내려가도록 배치했다. 같은 책임의 코드와 CSS를 가까이 두며 모든 기능에 components/hooks/services 폴더를 반복하지 않는다.

```text
src/
  app/                         Next page·layout·loading·route·metadata·명시된 Action
    (workspace)/               대화·내 파일·설정의 공통 진입과 Provider 조합
    demo/                      합성 자료 체험 진입
  features/
    local-folders/
      SourceFolderBrowser.tsx  파일 화면 조립
      SourceFolderProvider.tsx 경로 사이 연결·controller 수명 공유
      connection-session.ts    소유자·권한·요청 수명과 파일 작업 연결
      connection/              폴더 연결·핸들 저장·권한 안내
      browsing/                목록·선택·탐색 경로·프레임
      documents/               원문 표시·찾기·인라인 편집
      content/                 읽기·해시 Worker·PDF·OCR·텍스트 색인
      operations/              변경 계획·검사·실행·앱 휴지통
      recovery/                보관함·복구·복원
      organization/            자료 준비·질문·동의·정리 제안
      search/                  폴더·문서 검색
      creation/                새 폴더·빈 문서 생성
      destination-picker/      복사·이동·복구의 공통 목적지 선택
      history/, workflow/      작업 기록·단계 표시·공통 작업 상태
    conversation-workspace/
      LiveConversation.tsx     대화 화면 조립
      messaging/               일반 대화·스트림
      grounded/                선택 자료 질문·근거 표시
      material-work/           찾기·정리 요청과 로컬 파일 기능 연결
      records/                 대화 저장 연결
      settings/                대화 설정·사용량
    ai-records/                library·editing·storage·wiki·context
    auth/                      form·signup·session·social·account
    sample-workspace/          합성 자료의 conversation·files·organization
    onboarding/                소개 화면과 스크롤 예시
    quick-switch/              폴더·대화·설정 빠른 전환
  server/                      auth·chat·demo·ai·organization·settings·database
  components/                  여러 기능이 쓰는 layout·ui
  shared/                      브라우저/서버 간 최소 계약과 공통 규칙
  styles/                      전역·공통 조작 CSS
```

app에는 Next 진입점만 둔다. 페이지는 기능 화면을 연결하고 layout은 기존 Provider를 조합한다. 새 Provider를 일괄 추가하지 않으며 URL과 상태 수명을 유지한다. 서버의 업무 규칙·DB·비밀키는 server에 두고 Server Action이나 Route Handler에서 호출한다.

대화가 기록 UI를 조립한다. 기록 UI는 자기 기능의 [ConversationRecordControls](features/ai-records/library/conversation-record-controls.ts)로 필요한 값과 명령만 받으며 대화 hook 구현을 가져오지 않는다. 실제 공유하는 표시만 components/styles로 올린다.

테스트는 [apps/web/tests](../tests/README.md), [packages/domain/tests](../../../packages/domain/tests), [루트 tests](../../../tests/README.md)에 둔다. 제품이 테스트를 import하지 않는다. /demo의 합성 자료와 실제 폴더·인증·AI는 별도 경계다. 이전 prototypes와 /preview 실행 경로는 제거했으며 과거 검증 자료는 그대로 보존한다.
