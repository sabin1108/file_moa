# 2026-10-28 완료 상태와 다음 작업 지시

프로젝트: E:/project/ai_folder_project. 현재 요청한 기능·구조 정리 단위는 완료했다. 다음 기능은 아래 지시를 기준으로 사용자가 작업 재개를 요청하면 이어간다. 이 문서는 과거의 “본문 미리보기 미구현”, “목록 UI 마무리 남음”, scripts/ 또는 features/local-folders/ui·state·browser 경로보다 우선한다.

## 완료한 기능

- 브라우저 로컬 폴더 연결·복원·재연결·해제, 직접 자식 목록과 하위/상위 탐색·갱신·취소·오류 복구.
- MD/TXT 읽기 전용 원문 미리보기. 실제 로컬 읽기이며 AI 전송/색인이나 Markdown HTML 렌더링 완료를 의미하지 않는다.
- 연결/재연결 성공 후 /files 이동. 취소·실패·저장소 복원·늦은 완료에는 자동 이동하지 않는다.
- 현재 폴더 파일 다중 선택·전체 선택·해제. 미리보기와 경로 왕복은 선택을 보존하고 폴더 이동/연결 교체·해제/소유자 변경은 비운다.
- 설정 아이콘으로 폴더 연결 관리 dialog 열기. 키보드/초점·좁은 화면과 절제된 transition/shadow 적용.
- 기능/공통 UI/시안을 구분하고 테스트를 제품 src 밖으로 이동했다. 주요 모듈22곳에 역할·호출자·다음 계층 설명을 추가했다.

## 현재 코드 구조와 리뷰 순서

1. apps/web/src/README.md → docs/code-map.md → apps/web/src/features/local-folders/README.md.
2. app/layout.tsx → app/(workspace)/layout.tsx → app/(workspace)/files/page.tsx.
3. components/layout/WorkspaceShell.tsx와 features/local-folders/providers/SourceFolderProvider.tsx.
4. local-folders/hooks → store(연결·목록/선택·미리보기 상태) → services(session·reader·IndexedDB).
5. local-folders/components/connection·listing·preview에서 화면과 인접 CSS를 읽는다. types.ts는 계약, lib는 순수 경계 검증이다.
6. 공통 UI는 components/ui, 공통 CSS는 styles, 합성 시안은 prototypes. app/preview에는 라우트 조합만 있다.
7. 단위 테스트는 apps/web/tests/local-folders와 packages/domain/tests. 교차 검증은 tests/browser·architecture·fixtures·performance·s0.

Next는 일반 파일의 app 배치도 허용한다. 이 프로젝트는 읽기 편하도록 app을 라우트/조합 진입점으로 제한한다. 아직 없는 전역 hooks/store/auth/constants/server 폴더를 형식상 추가하지 않는다. 기능 전용 로직은 기능 안에 두고 실제 공유 근거가 있을 때 공통화한다.

## 이번 구현 종료 시 검증

근거: docs/verification/readable-structure/README.md 및 같은 폴더의 원자료.
- 최종 pnpm check 통과: 타입·lint·121개 단위 테스트/11파일·서버 경계21개·웹 import25개·domain6개·배치3개 및 실제 domain import 검사·43페이지 build.
- S0 별도 typecheck와 test:s0-graph(9모듈/브라우저 export 평가) 통과.
- 브라우저 선택/팝업39, 자동 이동13, 연결51, 목록46, 본문53, 화면69: 합계271개 확인·측정 기록, 실패0. 271개의 독립 시나리오라는 뜻은 아니다.
- 83개 이동 기록, import/주석을 제외한 구현94개 동일, CSS29개 바이트 동일, 선택/팝업 화면7개 PNG 동일.
- 독립 구조 재검토 CLEAR. 현재 문서15개 링크 누락0. 이번 마감에는 실제 폴더가 없는 server를 src README 트리에서도 제거했다.
- 이번 memory 저장에서는 제품 코드를 변경하거나 전체 검증을 다시 실행하지 않았다. 기존 최종 로그와 저장 결과를 확인했다.

실제 UI/controller/session/IndexedDB/Web Locks/OPFS와 합성 picker/권한/오류로 검사했다. 개인 자료·원본 쓰기·외부 전송 없음. 실제 OS 선택창/권한 철회, 실제 인증, 스크린리더, 실사용 INP는 미검증이다. 구조 이동에서 Lighthouse를 재실행하거나 성능 개선을 주장하지 않는다. 이전 placeholder 화면의 여백 지적이 남아 전체 사이트 디자인 완료로 보지 않는다.

## 다음 작업: 읽기 전용 변경 계획 검토

기준: docs/roadmap.md 최신 절, docs/specs/workflows.md FILE-001, docs/specs/file-selection-and-connection-dialog.md. 현재 선택 기능과 원본 쓰기 기능 사이의 작은 단위다.

1. 먼저 현재 소스/검증 상태와 DESIGN.md를 확인한다. 완료된 목록·미리보기·선택을 다시 구현하지 않는다.
2. 선택 파일 → 작업 종류(이동/복사/분류) → 목적지/분류 규칙 → 출발·도착·예상 결과와 충돌 표시 → 취소의 명세를 작성한다. 여기서는 계획 생성·검토만 하며 실행 버튼으로 실제 파일을 수정하지 않는다. 미정 범위는 명세에서 분명히 구분한다.
3. 업무 규칙을 순수 함수/타입으로 표현하고 먼저 실패 테스트를 작성한다. 선택 없음, 동일 목적지/동일 이름, 중복 대상, 잘못된 경로, 목록이 오래됨, 연결·소유자 변경, 취소/늦은 결과를 검증한다. 합성 고정 자료·seed와 실패/holdout 조건은 docs/testing-strategy.md를 따른다.
4. 현재 selection 상태와 연결 수명을 재사용한다. 독립 변경 계획 책임이 생길 때 별도 기능 경계를 만들고 파일 수를 맞추기 위한 추상화는 피한다. 화면·상태·순수 규칙·브라우저 접근을 한 파일에 몰지 않는다.
5. 공통 UI/토큰과 의미에 맞는 HTML을 사용한다. 계획 검토 화면은 키보드/초점·390/768/1440/1920 폭에서 확인한다. p 내부 div 같은 잘못된 중첩을 피하고 불필요한 any를 추가하지 않는다.
6. 관련 실패→통과 증거, pnpm check, 변경 범위의 브라우저 회귀를 실행한다. 실제 UI/성능 변경은 docs/performance-policy.md에 따라 동일 조건 측정·한계를 기록한다. 문구/CSS 구현을 복제한 테스트를 양산하지 않는다.
7. 완료 보고에는 사용자가 읽을 파일 순서, 역할/호출 흐름, 변경 이유, 실행 결과, 미검증 범위를 남긴다. 다음 기능을 한꺼번에 AI·로그인·PDF까지 확장하지 않는다.

실제 원본 적용은 별도 단계: 쓰기 권한, 적용 직전 hash/metadata 재검사, 이름 충돌 정책, journal, 부분 실패·복구 계약을 명세하고 합성 폴더에서 검증해야 한다. 읽기나 계획 검토의 승인을 원본 쓰기 승인으로 해석하지 않는다. 인증/외부 모델/유료 호출/배포 제공자는 아직 선택되지 않았다.

## 환경·주의

- pnpm12.15.0 / 프로젝트 Node24.22.1. pnpm exec node를 사용한다. 시스템 Node와 구분한다.
- 마지막 production URL http://127.0.0.1:3010/files. 다음 세션에서 서버 생존·최신 빌드를 확인한다. origin 변경은 IndexedDB 저장소 변경이다. 사용자 서버를 무작정 종료하지 않는다.
- Git은 첫 커밋 전 대부분 untracked였음. 전부 이번 변경으로 취급하거나 정리 삭제하지 않는다.
- .omx/restructure-readable.mjs는 1회 이동 도구이며 재실행하지 않는다. 초기 문자열 치환 오류는 원본 백업에서 복원·범위를 제한하고 전체 검증으로 해결했다.
- 새 의존성/불필요한 any/빈 범용 계층 추가 없이 기존 CSS Modules·토큰·사용자 승인 시안을 유지한다.
- pnpm 근거와 SSR/CSR·서버 경계는 docs/code-map.md와 docs/project-stack-and-security.md 참조. 기능 완료와 모형/미검증을 명확히 나눈다.

