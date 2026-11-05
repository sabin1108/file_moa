# 기능·공통 UI·시안 분류 계획 — 2026-10-28

사용자 문제: features 아래 실제 기능과 시안, 시안 경로에 있는 공통 UI가 섞여 유지보수할 파일을 찾기 어렵다. 완료 조건은 실제 파일 위치/의존 방향의 구분이며, 표시와 동작은 그대로 유지한다. 대규모 설계 프레임워크나 이름만 바꾸는 alias 계층은 도입하지 않는다.

## 범위와 판단

- `features/prototype` → `src/prototypes`: 시안·fixture·demo 전용. 실제 기능에서 가져오지 않는다.
- 실제/시안이 함께 쓰는 `ActionLink`, `StatusLabel`, `SettingRow`, actionClasses/ActionVariant, controls/workspace/sidebar/composer CSS → `shared/ui` 또는 `shared/styles`. 시안 비활성 버튼 `PreviewButton` 자체는 prototypes에 남긴다.
- `workspace-feedback`의 실제/시안 공통 `StatusNotice`, `MoaLoader`만 `shared/ui/feedback`으로 옮긴다. 현재 시안에서만 쓰는 TaskProgress/StartupState/LoadingRegion/FileIssueList/AnswerStatus는 `prototypes/feedback`에 둔다. 공유 CSS는 공통 표시 토큰/기본 상태·loader 규칙만 추출한다.
- `local-folders/ui`: 표시 TSX와 그 CSS. `state`: controller/session/Provider/hook과 수명 테스트. `browser`: 파일 reader/IndexedDB adapter와 reader 테스트. `contracts.ts`: feature 내부 경계 타입. 테스트는 검증 대상 가까이에 둔다.
- 이미 존재하는 shared/ui/Icon은 보존한다. prototype의 호환 Icon re-export는 호출부를 실제 위치로 바꾼 뒤 삭제한다. 이동된 나머지 파일에도 구경로 wrapper를 남기지 않는다.
- `workspace`는 파일 수가 적으므로 그대로 두고 공유 스타일만 shared로 옮긴다. `SettingRow`는 실제로 쓰는 row/control CSS만 별도 파일로 옮긴다.
- `live-workspace.module.css`의 시안 전용 previewNotice는 prototypes CSS로 옮겨 시안 layout이 실제 workspace 스타일을 역참조하지 않게 한다.

대안: (A) README로 현재 위치만 설명하면 잘못된 의존이 남는다. (B) 모든 feature에 획일적 FSD/DDD 폴더와 barrel을 넣으면 탐색 단계와 경계 혼동이 늘어난다. (C) 실제 소비 관계에 따라 위 3분류와 큰 feature의 책임만 나누는 안을 선택한다. 파일 이동으로 CSS Modules class hash가 바뀔 수 있으므로 화면/조작 확인이 필요하다.

## 보존 계약과 실패 조건

1. 폴더 연결/목록/본문/권한/취소/교체 수명과 원본 보호는 변경하지 않는다. 기존 111 단위 테스트와 21 서버 경계 검사가 baseline이다.
2. 기존 /, /files, /settings, /login, /welcome, /preview 라우트와 시안 동작·시각 기준을 유지한다. 샘플 UI를 제품으로 승격하지 않는다.
3. 제품 app(시안 라우트 제외)/features/server → prototypes, shared → features/app/prototypes, features → app, server → features 의존은 금지한다. 타입 import/re-export/dynamic import도 같은 경계다. 기존 서버 경계 규칙을 덮어쓰지 않는다.
4. 새로운 경계 규칙을 실제 ESLint 설정으로 검사하는 허용/거부 fixture를 추가한다. 이동 전 실제 lint 실패를 red 근거로 보존한다. 기존 회귀를 통과시킨 뒤 이동하고 최종 lint가 경계를 검사하도록 한다.
5. any/검사 무시/새 의존성/호환 wrapper로 위반을 숨기지 않는다.
6. S0 probe의 원본 파일 경로와 명시적 module allowlist/rewrite를 함께 갱신한다. 현재도 빠져 있는 preview/domain 의존을 HTTP graph 실패로 재현하고, graph 전체 200 + 실제 브라우저 module export 평가로 고친 것을 확인한다. 임의 파일 제공/전역 문자열 치환은 하지 않는다.

## 변경 순서

1. 기존 테스트 실행, 파일별 import/전이 CSS 조사, 이동 전 파일 hash 보관.
2. 독립 검토에서 경로 누락·규칙 충돌·테스트 검증 가능성을 확인한다.
3. 경계 fixture/검사 추가 → 현재 위반의 red 기록.
4. 공통 표시/CSS 추출 → prototypes 이동 → local-folders 책임별 이동. 단계별 import 갱신과 타입 검사.
5. 코드 안내/feature README/설계 문서의 현재 경로를 수정한다. 과거 검증 로그/인수인계 스냅샷은 덮어쓰지 않는다.
6. 전체 check, 실제 연결·목록·미리보기·라우트 브라우저 회귀, 시안과 좁은 화면 확인. 경로 이동만으로 성능 개선을 주장하지 않는다.

## fallback 검토

Icon 호환 re-export는 이전 이동의 잔여 전달 계층이며 현재 호출부를 직접 바꿀 수 있다. 오류를 숨기는 fallback은 아니다. development-local/localhost 제한과 권한/실패 상태 보존은 제품 안전 경계이므로 그대로 둔다. 삭제 대상은 사용처를 모두 갱신한 구경로 파일뿐이다.

## 검토와 실행 기록

일반 Codex App 로컬 수정 범위다. OMX tmux 팀/Conductor 실행 권한을 주장하지 않는다. 계획 작성자와 독립 검토자를 구분하고 승인되지 않은 결과를 합의 승인이라고 기록하지 않는다. 실제 결과/검토는 검증 보고서에 추가한다.

- 작성: root. 독립 검토: classification_structure_review(architect). 최초 code-reviewer는 계정의 모델 미지원으로 실행 실패하여 승인 근거로 쓰지 않는다.
- 구조 검토: 시안 전용 feedback 전체 shared 승격 금지, previewNotice 분리, S0 module graph 수리를 조건으로 진행 가능. 세 보완을 이 계획에 반영했다. shared sidebar의 시안 전용 selector는 실제 2곳 재사용을 유지하는 범위에서 WATCH로 기록하고 이번에 임의 삭제하지 않는다.
- 변경 전: 단위111개/10파일, 서버 경계21개 통과. 기존 live 브라우저69개 통과. 새 경계 fixture는 규칙 부재로 실패했고 S0 graph는 /source-file-preview 404로 실패해 red 근거를 보존했다.
