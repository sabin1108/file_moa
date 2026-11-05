# 개인 AI 작업 공간

사용자가 요청한 방식으로 로컬 파일·폴더를 정리하고, 선택 자료로 보고서·이력서 등 문서를 만드는 브라우저 서비스입니다. 임시 이름은 모아입니다.

승인된 시안에서 기능을 연결하는 단계입니다. localhost 개발 환경에서 폴더 연결·탐색·MD/TXT 미리보기와 편집, 실제 파일/폴더 복사·이동, 복구 보관함·앱 휴지통을 구현했습니다. 실제 로그인·AI 연동은 후속입니다. 현재 기능과 검증 한계는 최신 인수인계와 기능별 검증 문서를 확인하세요.

## 현재 화면과 개발 상태

- 처음 읽는 분을 위한 [화면부터 따라가는 자세한 코드 설명서](docs/코드_이해하기.md): 버튼 → 컴포넌트 → controller → session → 파일 처리, 수동·자동저장과 F5 복원까지 설명합니다.

- [최신 폴더 구조·테스트 분리 검증](docs/verification/readable-structure/README.md), [소스 폴더 안내](apps/web/src/README.md), [검증 실행 안내](tests/README.md).
- 처음 코드를 읽는다면 [진입점·호출 흐름·리뷰 위치·pnpm 선택 근거](docs/code-map.md)와 [대화형 구조도](docs/diagrams/local-files.html)부터 확인하세요.
- [파일 다중 선택·연결 관리 팝업 검증](docs/verification/file-selection-dialog/README.md).
- [책임별 소스 분류와 연결 후 자동 이동 검증](docs/verification/feature-classification/README.md), [소스 폴더 안내](apps/web/src/README.md).
- [MD/TXT 미리보기 검증](docs/verification/source-file-preview/README.md): 명세·실패 테스트·구현·회귀 결과와 미검증 범위.
- [최종 시안 캡처와 화면 목록](docs/prototype/README.md): 27개 상태 시안과 대화·파일·로그인·첫 가입·설정.
- 실행 중인 화면: [전체 시안](http://127.0.0.1:3000/preview) · [파일](http://127.0.0.1:3000/files) · [대화](http://127.0.0.1:3000/).
- [디자인 기준](DESIGN.md): 현재 팔레트·레이아웃·공통 컴포넌트·기능 연결 경계.
- [로컬 보관 계약](docs/specs/local-ai-storage.md), [기록 형식](docs/specs/local-record-v1.md), [저장 복구 계약](docs/specs/local-record-recovery.md).
- [S0 검증 기록과 남은 일](docs/verification/s0/README.md), [구현 순서](docs/roadmap.md).

대화·승인 기억·결과물·작업 이력은 사용자가 지정한 AI 폴더에 보관하는 방향입니다. 서버는 계정·세션·동의·사용량 등 운영 정보 중심이며, 원본 읽기·AI 폴더 쓰기·원본 정리·외부 전송 권한을 구분합니다. 모델·과금·배포사는 미정입니다.

## 실행

프로젝트 실행 기준은 Node 24.22.1 LTS, pnpm 12.15.0입니다. `package.json`의 `devEngines.runtime`과 lockfile로 Node 버전도 고정합니다. pnpm 설치 시 해당 런타임을 준비하고 `pnpm` 스크립트와 `pnpm exec`에서 사용합니다. 설치가 필요한 환경에서만 `install --frozen-lockfile`을 실행합니다.

```powershell
pnpm install --frozen-lockfile
pnpm exec node --version
pnpm dev
```

pnpm이 없는 다른 환경에서는 `npx --yes pnpm@12.15.0`을 위 명령의 `pnpm` 대신 사용할 수 있습니다. 현재 PC에는 pnpm 명령을 설치했습니다. Windows 전체 Node는 관리자 권한 때문에 24.16.0으로 남아 있으므로 이 프로젝트에서는 단독 `node` 대신 `pnpm exec node`를 사용합니다. [업데이트 판단과 검증](docs/verification/dependency-update-20261027/README.md).

S0 도구는 `pnpm exec node tests/s0/probe-server.mjs`로 실행합니다. http://127.0.0.1:4318/에서 별도의 합성 테스트 폴더를 사용합니다. `/api/health`는 웹 프로세스 상태이며 DB/AI 준비 완료를 뜻하지 않습니다.

## 검증과 기준

실제 기능 변경은 관련 테스트, typecheck, lint, build 순으로 검증합니다. 정적 시안 수정은 타입·린트·빌드·화면 확인을 수행하고 반복 Lighthouse/제품 테스트는 제외합니다. 성능 기준선은 제품 기능을 연결할 때 수집합니다.

- [프로젝트 규칙](AGENTS.md), [제품 범위](docs/PRD.md), [기술 경계](docs/architecture.md), [주의사항](docs/guidelines.md)
- [작업 명세](docs/specs/workflows.md), [테스트 전략](docs/testing-strategy.md), [성능 정책](docs/performance-policy.md)
- [스킬 구성](docs/skills.md), [초기 원본 스냅샷](docs/source/personal-ai-design-v0.1.md), [원형 메뉴 후속 기획](docs/planning/radial-menu.md)

과거 시안과 검토 기록은 최종 화면과 혼동되지 않도록 로컬 보관함으로 옮겼습니다. [보관 안내](docs/prototype/ARCHIVE.md)를 참고하세요. 원본 개인 자료는 수정하지 않았습니다.
