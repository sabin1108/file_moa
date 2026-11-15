# 개인 AI 작업 공간

사용자가 요청한 방식으로 로컬 파일·폴더를 정리하고, 선택 자료로 보고서·이력서 등 문서를 만드는 브라우저 서비스입니다. 임시 이름은 모아입니다.

현재 소스에는 폴더 연결·탐색·MD/TXT/PDF 미리보기·OCR, 문서 편집, 파일/폴더 복사·이동, 복구 보관함·앱 휴지통이 있습니다. Better Auth 이메일·소셜 인증 경로와 계정/workspace별 폴더 격리, 실제 채팅·자료 기반 질문·정리 제안의 OpenAI/Gemini 연결, 로컬 AI 기록·위키 저장도 구현되어 있습니다. 기능별 코드와 검증 범위는 [전체 코드 흐름 설명서](docs/모아_전체_코드_흐름_설명서.md), [기술 경계](docs/architecture.md), 각 검증 문서에서 확인하세요. 코드 존재와 합성 테스트 통과를 공급자별 실제 로그인·운영 DB·유료 호출·배포 환경의 전체 검증으로 확대하지 않습니다.

정식 AI와 데모는 같은 DB와 `BETTER_AUTH_SECRET`을 사용할 때 **전역 60초 1회·3,600초 12회 한도**를 공유합니다. 개인 한도가 남아 있어도 다른 사용자의 요청으로 제한될 수 있는 현재 비용 보호 정책입니다. [한도 검증과 한계](docs/verification/ai-request-quota/README.md). 이 상한을 다중 사용자 서비스의 충분한 처리량으로 간주하지 않습니다.

## 현재 화면과 개발 상태

- [2026-11-15 운영 반영·자동 확인·탐색 재개](docs/verification/local-rag-followup-20261115/README.md): 기기 metadata를 나눠 확인하고 중단 지점을 재사용합니다. 검색·질문 해석은 운영에 반영했고, 다운로드형 의미 검색은 사용성/비용 근거로 보류했습니다.

- [2026-11-15 로컬 검색·RAG 후속](docs/verification/local-rag-20261115/README.md): 원문 기반 검색 조건·기기 catalog 관리·질문만 전송하는 선택 해석과 합성 비교 검증. 원격 해석은 기본 비활성, 운영 migration/배포 미실행이며 의미 검색 모델은 평가 후 비채택했습니다.

- [실제 로그인](http://127.0.0.1:3034/login) · [회원가입](http://127.0.0.1:3034/welcome) · [비밀번호 찾기](http://127.0.0.1:3034/forgot-password): 공통 Stepper를 재사용합니다. [인증 UI 검증](docs/verification/auth-ui/README.md). 로그인 후 작업 공간으로 이동하며 개발용 폴더를 자동 연결하지 않습니다.

- 처음 읽는 분을 위한 [화면부터 따라가는 자세한 코드 설명서](docs/코드_이해하기.md): 버튼 → 컴포넌트 → controller → session → 파일 처리, 수동·자동저장과 F5 복원까지 설명합니다.

- [최신 폴더 구조·테스트 분리 검증](docs/verification/readable-structure/README.md), [소스 폴더 안내](apps/web/src/README.md), [검증 실행 안내](tests/README.md).
- 처음 코드를 읽는다면 [진입점·호출 흐름·리뷰 위치·pnpm 선택 근거](docs/code-map.md)와 [대화형 구조도](docs/diagrams/local-files.html)부터 확인하세요.
- [파일 다중 선택·연결 관리 팝업 검증](docs/verification/file-selection-dialog/README.md).
- [책임별 소스 분류와 연결 후 자동 이동 검증](docs/verification/feature-classification/README.md), [소스 폴더 안내](apps/web/src/README.md).
- [MD/TXT 미리보기 검증](docs/verification/source-file-preview/README.md): 명세·실패 테스트·구현·회귀 결과와 미검증 범위.
- [과거 시안 캡처와 화면 목록](docs/prototype/README.md): 디자인 결정 기록으로 보존하며 시안 실행 경로는 제거했습니다.
- 로컬 실행 주소: [데모 소개](http://127.0.0.1:3034/demo/intro) · [파일](http://127.0.0.1:3034/files) · [대화](http://127.0.0.1:3034/). 기존 `/preview`와 전용 시안 소스는 2026-11-12 정리했습니다. 실제 파일 미리보기와 `/demo`는 유지합니다.
- [디자인 기준](DESIGN.md): 현재 팔레트·레이아웃·공통 컴포넌트·기능 연결 경계.
- [로컬 보관 계약](docs/specs/local-ai-storage.md), [기록 형식](docs/specs/local-record-v1.md), [저장 복구 계약](docs/specs/local-record-recovery.md).
- [S0 검증 기록과 남은 일](docs/verification/s0/README.md), [구현 순서](docs/roadmap.md).

대화·기억·결과물·위키는 사용자가 지정한 AI 폴더에 보관합니다. 서버는 계정·세션·동의·사용량 등 운영 정보 중심이며, 원본 읽기·AI 폴더 쓰기·원본 정리·외부 전송 권한을 구분합니다. 현재 OpenAI/Gemini 어댑터와 Vercel 배포 설정이 있고, 과금 상품과 최종 운영 용량 정책은 별도 결정 사항입니다.

## 실행

프로젝트 실행 기준은 Node 24.22.1 LTS, pnpm 12.15.0입니다. `package.json`의 `devEngines.runtime`과 lockfile로 Node 버전도 고정합니다. pnpm 설치 시 해당 런타임을 준비하고 `pnpm` 스크립트와 `pnpm exec`에서 사용합니다. 설치가 필요한 환경에서만 `install --frozen-lockfile`을 실행합니다.

```powershell
pnpm install --frozen-lockfile
pnpm exec node --version
pnpm dev
```

로컬 앱은 `http://127.0.0.1:3034`에서 실행합니다. 폴더 연결 핸들과 브라우저 기록은 origin별로 저장되므로 기존 주소를 유지합니다. 서버 환경 변수는 `apps/web/.env.example`을 기준으로 Git에서 제외되는 `apps/web/.env.local`에 보관합니다. 로컬 `BETTER_AUTH_URL`도 같은 주소를 사용하고, Vercel Production에는 운영 주소를 설정합니다.

인증 DB의 [스키마·SQL 실행 안내](apps/web/prisma/README.md)와 [PostgreSQL 검증 결과](docs/verification/auth-database/README.md)를 분리해 관리합니다. `pnpm db:validate`, `pnpm db:generate`는 실제 DB 연결 없이 실행하며, dev/typecheck/build는 필요한 Prisma client를 먼저 생성합니다. `pnpm test:database`는 Docker의 임시 DB만 사용합니다. Supabase·Resend 연결의 과거 실행 결과는 [인증 DB 검증](docs/verification/auth-database/README.md)에 기록되어 있습니다. 현재 이메일·소셜 인증 및 브라우저 owner 교체 코드의 존재와 공급자별 실제 운영 로그인·공개 발신 도메인·현재 DB 적용 검증은 구분합니다. [Git 공개 전 검사와 배포 준비](docs/verification/publish-safety/README.md)를 참고하세요.

pnpm이 없는 다른 환경에서는 `npx --yes pnpm@12.15.0`을 위 명령의 `pnpm` 대신 사용할 수 있습니다. 현재 PC에는 pnpm 명령을 설치했습니다. Windows 전체 Node는 관리자 권한 때문에 24.16.0으로 남아 있으므로 이 프로젝트에서는 단독 `node` 대신 `pnpm exec node`를 사용합니다. [업데이트 판단과 검증](docs/verification/dependency-update-20261027/README.md).

S0 도구는 `pnpm exec node tests/s0/probe-server.mjs`로 실행합니다. http://127.0.0.1:4318/에서 별도의 합성 테스트 폴더를 사용합니다. `/api/health`는 웹 프로세스 상태이며 DB/AI 준비 완료를 뜻하지 않습니다.

## 검증과 기준

실제 기능 변경은 관련 테스트, typecheck, lint, build 순으로 검증합니다. 정적 시안 수정은 타입·린트·빌드·화면 확인을 수행하고 반복 Lighthouse/제품 테스트는 제외합니다. 성능 기준선은 제품 기능을 연결할 때 수집합니다.

- [프로젝트 규칙](AGENTS.md), [제품 범위](docs/PRD.md), [기술 경계](docs/architecture.md), [주의사항](docs/guidelines.md)
- [작업 명세](docs/specs/workflows.md), [테스트 전략](docs/testing-strategy.md), [성능 정책](docs/performance-policy.md)
- [스킬 구성](docs/skills.md), [초기 원본 스냅샷](docs/source/personal-ai-design-v0.1.md), [원형 메뉴 후속 기획](docs/planning/radial-menu.md)

과거 시안과 검토 기록은 최종 화면과 혼동되지 않도록 로컬 보관함으로 옮겼습니다. [보관 안내](docs/prototype/ARCHIVE.md)를 참고하세요. 원본 개인 자료는 수정하지 않았습니다.
