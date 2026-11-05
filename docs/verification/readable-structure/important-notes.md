# 2026-10-28 사용자 요구와 적용 — 읽기 쉬운 코드 구조·주석·테스트 분리

사용자는 주요 코드에 “이 코드는 어떤 구성을 하는 코드”, “어디에서 활용하여 어떻게 사용된다”는 설명을 짧게 달라고 요청했다. 단순 버튼/UI 문법 설명은 원하지 않았으며 폴더 연결 방식과 작동 구조, 필요한 참고 위치를 원했다. app의 login 경로와 features 실제 구현의 차이를 이해하기 어렵고 preview까지 있어 복잡하게 느낀다고 설명했다. 기능별 컴포넌트와 로직 분리, 유지보수성·재사용성, Next 규칙을 지키는 정형화된 구조를 강조했다. 제시한 components/layout/ui·hooks/lib/services/store/types/constants/styles 예시를 프로젝트에 적용하되 테스트는 별도로 빼고 검증은 에이전트에 맡겼다.

## 적용한 판단과 구조

Next 설치 문서16.4.3와 공식 project-structure를 확인했다. page/layout/route는 Next 규칙이며 나머지 이름은 프로젝트가 선택한다. 일반 파일도 app 안에 둘 수 있지만 이 프로젝트는 app을 라우트 진입점으로 제한한다. 제공 이미지 URL은 도구에서 열리지 않아 사용자 텍스트 예시를 기준으로 진행했다.

- 공통 프레임은 src/components/layout, 실제 공유 표시는 components/ui, 전역/공통 CSS는 src/styles로 이동했다.
- features/local-folders 안에 components/{connection,listing,preview}와 각 CSS, providers/hooks/store/services/lib/types.ts를 배치했다. 기능 전용 코드를 전역 hooks/services에 흩뜨리지 않았고 없는 auth/constants/server 폴더·상태관리 패키지를 추가하지 않았다.
- 실제 연결/목록/선택/미리보기와 prototypes를 분리했다. /preview의 URL 진입점만 app에 남기고 승인된 합성 시안 구현은 prototypes에 보존했다. src/server는 아직 구현되지 않은 경계라고 명시한다.
- 제품 소스에 있던 단위 테스트는 apps/web/tests와 packages/domain/tests로, 브라우저·구조·fixture·성능·S0 도구는 루트 tests로 옮겼다. 실행 명령/도구 import/프로브 allowlist/TypeScript 검사 범위를 함께 수정했다.
- 주요22개 모듈에 담당 기능·사용처·호출 계층 주석을 추가했다. Provider→hook→store→session→reader/repository, UI 상태/초점의 소유권을 코드에서 따라갈 수 있게 했다.

## 실행과 검증 근거

정리 계획과 기존121개 회귀 통과를 먼저 기록하고, 새 components/test 의존 금지 fixture의 실패를 확인한 뒤 이동했다.83개 이동/변경 전hash와 백업을 보존했다. 초기 이동 도구가 일반 점(.) 문자열까지 경로로 다룬 오류는 기존 테스트와 대조로 잡았고 import/명시적 소스 경로만 변경하도록 고쳤다. 최종 제품 구현94개(import·주석 제외)와 CSS29개, 분리한 검증 함수 본문이 동일했다.

최종 pnpm check: 타입·lint·단위121개/11파일·서버 경계21개·웹 구조fixture25개·domain fixture6개·배치3개/실제domain imports·build43페이지 통과. S0의 새 경로typecheck와 모듈graph9개/브라우저평가도 통과했다. 실제 브라우저는 선택/팝업39+연결51+이동13+목록46+본문53+화면69=271 확인/측정 기록으로 모두 통과했다. 독립 시나리오271개라는 뜻은 아니다. 선택/dialog7개 PNG는 이전 구현과 바이트 단위로 동일했다.

독립 구조 검토가 domain 테스트 경계 누락·미존재server표기·구경로fixture·빈폴더를 지적해 보완했고 재검토CLEAR로 마쳤다. 현재15개 안내문서의 링크 누락0이다. 실제 OS picker·로그인·스크린리더를 검증한 것으로 보고하지 않으며 개인 자료에 접근하거나 원본을 쓰지 않았다. 자산98bytes 감소를 성능 개선으로 과장하지 않았다.

사용자가 읽을 시작점은 apps/web/src/README.md → features/local-folders/README.md → docs/code-map.md이다. 테스트 실행 안내는 tests/README.md, 전체 근거는 docs/verification/readable-structure/README.md다. 이전 기록에 등장하는 ui/state/browser/shared 및 scripts 검증 경로보다 이번 구조 안내를 우선한다.

---

