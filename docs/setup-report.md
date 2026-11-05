# 초기 설정 검증 기록
날짜: 2026-10-23. 작업 루트: E:/project/ai_folder_project.

## 완료
- taste-skill의 design-taste-frontend 설치. 공식 출처 Leonxlnx/taste-skill, skills-lock.json에 hash.
- personal-ai-ui / personal-ai-files / personal-ai-api 생성 및 quick_validate.py 모두 통과.
- 원본 Markdown 7개 사본 SHA256 일치. 원본 D: 문서는 변경하지 않음.
- pnpm web/domain workspace, Node 버전, TypeScript, Next/React, 환경 변수 예시, Git ignore 및 로컬 main 저장소.
- AGENTS.md / DESIGN.md / PRD / architecture / guidelines / roadmap / ADR 작성.

## 실행 증거
- pnpm typecheck: 통과.
- pnpm lint: 통과. 최종 ESLint 9.39.5 변경 후 재실행 통과.
- pnpm test: 1개 파일, 6개 테스트 통과(확장자/크기 경계/잘못된 크기).
- pnpm build: Next 16.4.2 프로덕션 빌드 통과.
- 프로덕션 localhost:3037 / 및 /api/health HTTP 200, 한글 본문·web-process scope 확인. 검사 후 서버 종료.
- pnpm peers check: No peer dependency issues found.
- .env.local / node_modules / .next Git 제외 확인.

## 유지보수와 미검증
ESLint 10은 현재 Next의 react/import/jsx-a11y 플러그인 peer 범위와 충돌했다.
현재 호환 가능한 9.39.5는 npm 지원 종료 경고가 있다. 플러그인 호환 개선 시 ESLint 10으로 올리고 재검증한다.
unrs-resolver postinstall은 pnpm allowBuilds에서 false로 명시했다. Windows 배포 binary로 린트 동작을 확인했다. 다른 OS는 설치·린트 재검증이 필요하다.
Windows python 명령 alias가 작동하지 않아 uv run --with pyyaml python -X utf8로 스킬 검증을 완료했다.
taste 도구 스크립트 실행/시각 디자인 검증은 아직 수행하지 않았다.
실제 채팅/로그인/DB/로컬 폴더/API 공급자/색인은 미구현이다. 제품 완료 기준은 아직 통과하지 않았다.
Docker/DB 서비스·외부 배포·원격 GitHub 저장소·CI 실행은 생성하거나 수행하지 않았다.
시각 브라우저·IME·접근성·제품 E2E는 해당 기능 구현 시 검증한다. 현재 HTTP smoke는 이를 대신하지 않는다.
