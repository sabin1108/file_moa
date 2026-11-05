# 제품 소스 읽기 안내

사용자용 최신 해설: [화면에서 시작하는 코드 설명서](../../../docs/코드_이해하기.md). 아래 예전 분류의 ‘읽기 전용 계획’ 설명은 당시 단계이며 현재는 검증된 실제 복사·이동·휴지통·인라인 편집/저장이 연결되어 있다.

Next.js의 app은 URL 진입점이다. 기능 구현은 features, 여러 화면의 공통 부품은 components, 검증 코드는 src 바깥 tests에서 찾는다. [실행 흐름과 리뷰 지도](../../../docs/code-map.md).

```text
src/
  app/                          page·layout·route·아이콘
    (workspace)/                대화·내 파일·설정의 공유 layout
    login/, welcome/            아직 실제 인증 전의 안내 경로
    preview/                    시안 URL만 조합
  components/
    layout/                     WorkspaceShell: 공통 메뉴·작업 프레임
    ui/                         ActionLink·SettingRow·Icon·feedback
  features/
    local-folders/
      components/
        connection/             연결 표시·설정 조작·설정 dialog + CSS
        listing/                폴더 탐색·파일 선택 + CSS
        plan/                   이동·복사·분류의 읽기 전용 계획 검토 + CSS
        preview/                MD/TXT 원문 표시 + CSS
      providers/                화면 사이에 연결/선택 수명 공유
      hooks/                    React 구독·기능 조립·시작/정리
      store/                    연결·목록/선택·본문·계획 상태
      services/                 권한·session·파일 읽기·IndexedDB
      lib/                      연결 키·핸들 검증·순수 변경 계획 규칙
      types.ts                  기능 입출력 타입
  styles/                       전역·공통 작업면/조작 CSS
  prototypes/                   합성 시안 구현 (/preview만 사용)
```

## 기능별 분리인가?

그렇다. local-folders가 기능 경계이며 그 안에서 connection/listing/preview 화면과 hooks/store/services 책임을 나눈다. 파일별 설명은 주요 코드 상단의 역할·사용처 주석과 [기능 안내](features/local-folders/README.md)를 따른다. feature의 전용 코드를 전역 hooks나 services에 흩뜨리지 않는다. 여러 기능에서 실제로 공유할 때만 공통화한다.

store는 이미 사용하던 controller 기반 상태 저장소다. 이름을 맞추기 위해 Redux/Zustand를 추가하지 않았다. services의 현재 I/O는 기기 파일·IndexedDB이며 서버 API가 아니다. API/비밀키/DB 접근은 기존 server 경계를 따른다. 아직 없는 auth/dashboard/hooks/lib/constants를 빈 폴더로 만들지 않는다.

## app에 무엇을 넣나?

Next는 page/layout/route 파일로 경로를 구성한다. 일반 파일을 함께 둘 수도 있지만, 이 프로젝트에서는 app을 진입점으로 제한한다. page는 기능 컴포넌트를 조합하고 layout은 공통 프레임/Provider를 연결한다. (workspace)는 URL에 포함되지 않는 route group이다. globals.css는 styles에서 root layout이 import한다. [Next 공식 규칙](https://nextjs.org/docs/app/getting-started/project-structure).

## 테스트와 시안은 어디 있나?

- [apps/web/tests](../tests/README.md): local-folders의 서비스/상태 단위 검사.
- [packages/domain/tests](../../../packages/domain/tests): 순수 규칙 검사.
- [저장소 tests](../../../tests/README.md): browser/architecture/fixtures/performance/s0.
- prototypes는 실행 가능한 합성 시안이고 테스트가 아니다. 제품 컴포넌트에서는 import하지 않는다. app/preview의 진입점과 구분해 접어두면 실제 기능 리뷰에 필요하지 않다.

기능 CSS는 해당 components 하위 그룹에, 여러 화면의 공통 CSS는 styles에 둔다. 테스트는 구현에서 단방향으로 호출하지 않으며, tests만 제품 코드를 import한다. ESLint와 pnpm test:structure가 이 방향과 app/테스트 위치를 검사한다.

서버 전용 구현은 아직 없으며 src/server는 향후 구현 경계로만 예약돼 있다. 현재 존재하는 폴더처럼 보이게 빈 디렉터리를 만들지 않는다. server-only import/Action 규칙은 이미 검사한다.
