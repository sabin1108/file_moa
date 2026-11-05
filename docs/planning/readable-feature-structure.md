# 읽기 쉬운 기능 구조와 테스트 분리

2026-10-28 사용자 요청: 예시의 components/layout/ui·hooks·services·store·types/lib 역할을 적용하고 테스트를 구현 코드에서 분리한다. 주요 코드에는 역할·사용처·호출 관계를 짧게 설명한다. 사용자가 일반적인 Next 구조를 요청했으므로 이전 ui/state/browser 명명에 고정하지 않는다.

## 선택한 구조

```text
apps/web/
  src/
    app/                         URL·layout·page·API 진입점만
    components/
      layout/                    WorkspaceShell과 실제 공통 작업면
      ui/                        ActionLink·Icon·SettingRow·feedback
    features/local-folders/
      components/
        connection/              연결 표시·설정 페이지 본문·설정 팝업
        listing/                 파일 탐색·선택 UI와 해당 CSS
        preview/                 원문 미리보기 UI와 해당 CSS
      providers/                 경로 간 공유 수명
      hooks/                     React 구독·브라우저 시작/정리
      store/                     연결·목록/선택·본문 상태 controller
      services/                  연결 session·파일 읽기·핸들 저장소
      lib/                       연결 키/핸들 경계 검증
      types.ts                   기능의 입출력 타입
    styles/                      전역 CSS·공통 작업면/조작 스타일
    prototypes/                  /preview 전용 합성 시안
  tests/local-folders/            서비스/상태 단위 테스트
packages/domain/
  src/                           프레임워크 독립 규칙
  tests/                         domain 단위 테스트
tests/
  architecture/                  구조·서버 import 검사
  browser/                       실제 화면/키보드/실패 회귀
  fixtures/                      합성 폴더 준비 도구
  performance/                   측정·감사 스크립트
  s0/                            독립 검증용 probe와 저장 실험
```

기능 전용 hooks/services/store/types/lib는 기능 안에 둔다. 아직 소비처가 없는 전역 hooks/lib/store/types/constants 폴더는 만들지 않는다. 실제 로그인 구현이 없으므로 features/auth도 빈 껍데기로 추가하지 않는다. workspace는 독립 업무 기능이 아닌 공통 프레임이므로 components/layout으로 옮긴다. 실제 페이지에서 쓰는 조합은 features 컴포넌트로 연결하고 app에는 기능 구현을 누적하지 않는다. 기능 CSS는 해당 컴포넌트 그룹 가까이에 유지한다.

Next의 page/layout/route와 route group 규칙을 유지한다. 일반 파일의 app 동거도 허용되지만 이 프로젝트는 진입점만 두는 규칙을 선택한다. `src/styles/globals.css`는 root layout에서 import한다. /preview의 네 진입 파일은 시안을 보여주는 URL이므로 남기되 합성 구현은 prototypes에만 둔다. [설치된 Next16.4.3 문서](../../apps/web/node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md)와 [공식 구조 안내](https://nextjs.org/docs/app/getting-started/project-structure)를 확인했다. 제공 이미지 URL은 접근 실패했으며 사용자 텍스트 예시를 적용한다.

## 보존할 동작·진행 순서

1. 현재121개 테스트·경계21/19·build43과 직전271개 브라우저 기록을 기준으로 보존한다. 변경 전 pnpm check를 새 로그에 기록한다.
2. 새 components 경계와 제품→tests import 금지 fixture를 먼저 추가해 red를 확인한다. 제품 src 안에 test 파일이 남지 않는 구조 검사도 추가한다.
3. 이동 목록/변경 전 hash와 소스 백업을 만든다. import specifier와 검증 도구 경로를 함께 갱신한다. 연결 validation 구현은 types에서 lib로 분리하되 함수를 수정하지 않는다.
4. 주요 역할에만 짧은 한국어 설명을 단다. ‘연결 방식/어디에서 사용하는지/다음 계층’이 핵심이며 버튼 등의 당연한 표시는 설명하지 않는다. 같은 설명을 모든 줄에 반복하지 않는다.
5. 현재 코드 지도와 기능 README, package 명령/검증 가이드를 갱신한다. 과거 검증 스냅샷의 경로와 수치를 현재 결과처럼 덮어쓰지 않는다.
6. 테스트 수와 파일 수가 유지되는지, lint/type/build/구조/S0 graph 및 기존 실제 UI 회귀를 확인한다. 동작·CSS 선언을 의도적으로 바꾸지 않으며 구조 이동만으로 성능 개선을 주장하지 않는다.

## 경계와 검토

구조 경계는 상대 import에 적용한다. components/styles는 features/app/prototypes에 의존하지 않고, 제품 src는 tests를 import하지 않는다. features는 app/prototypes를 import하지 않는다. 실제 DB/API 비밀키 경계인 server-only 규칙은 기존대로 둔다. 테스트에서 제품을 import하는 방향은 허용한다. 새 alias·외부 의존성·호환 재수출 계층을 추가하지 않는다.

fallback 점검: localhost 개발 소유자 제한, 미지원 브라우저 안내, 실패 시 이전 조회 표시, 오래된 응답 무시는 근거 있는 안전 경계이므로 유지한다. 이 작업은 위치/명명/책임 설명을 다루며 권한 우회나 실패 은폐 분기를 추가하지 않는다. 일반 Codex App 로컬 실행이며 OMX Conductor 권한을 주장하지 않는다. 직전 독립 리뷰는 quota로 종료되어 새 승인을 주장하지 않는다. 이번 작성/이동 뒤 별도 검토 패스로 경계 fixture·명세 대조·최종 파일 diff와 실행 근거를 확인한다.

서버 전용 구현은 아직 없으며 src/server는 향후 구현 경계로만 예약돼 있다. 현재 존재하는 폴더처럼 보이게 빈 디렉터리를 만들지 않는다. server-only import/Action 규칙은 이미 검사한다.
