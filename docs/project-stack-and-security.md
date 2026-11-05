# 모아 — 현재 기술 구성과 서버·브라우저 경계

2026-10-27 · 실제 코드/package.json/설치된 Next 문서를 확인한 요약. 제안 단계와 구현 완료를 구분한다.

## 1. 지금 무엇을 구현했나

설정과 내 폴더에서 동일한 로컬 폴더 연결을 공유한다. 2026-10-28 현재 `/files`에서 연결된 폴더의 **파일·하위 폴더 탐색과 MD/TXT 원문 미리보기**를 구현했다. 목록과 본문은 독립 controller를 사용하고 연결/소유자 수명은 session에서 검증한다. 표시 컴포넌트는 값과 콜백을 받으며, 원문은 서버 전송·HTML 해석 없이 기기에서만 읽는다. [검증](verification/source-file-preview/README.md), [진입점·리뷰 순서·pnpm 근거](code-map.md).

프로젝트 위치: `E:\project\ai_folder_project`

| 읽을 파일(프로젝트 기준 상대 경로) | 역할 |
| --- | --- |
| `apps/web/src/features/local-folders/services/source-folder-listing.ts` | 읽기 권한 확인, 요청한 하위 폴더 열기, 직접 자식 목록/정렬, 1,000항목 제한. 본문/원본 쓰기 없음 |
| `apps/web/src/features/local-folders/services/connection-session.ts` | 연결 소유자·수명, listSourceFolder, 해제/계정 변경 뒤 늦은 결과 차단 |
| `apps/web/tests/local-folders/services/source-folder-listing.test.ts` | 권한·누락·취소·경로·제한·늦은 결과 15개 회귀 테스트 |
| `apps/web/src/features/local-folders/providers/SourceFolderProvider.tsx` | 대화/설정/파일 화면이 같은 연결 상태 사용 |
| `apps/web/src/app/(workspace)/files/page.tsx` | 실제 SourceFolderBrowser 조합. 연결·목록 상태는 공유 provider/controller가 소유 |

최신 검증 수치와 조건은 [현재 기능 검증](verification/file-selection-dialog/README.md)을 따른다. 실제 OS 폴더 권한창·계정·서버 DB 연결 완료를 뜻하지 않는다.

## 2. 무엇을 썼고 왜 골랐나

| 현재 사용 기술 | 역할과 프로젝트의 선택 근거 |
| --- | --- |
| Next.js **16.4.3**, App Router | 페이지/공통 layout과 서버 경계를 한 앱에서 관리. 선택 근거는 SEO보다 향후 인증·서버 기능의 통합과 작은 팀의 운영 단순화 |
| React / React DOM **19.3.1** | 채팅·파일·설정의 재사용 UI와 상호작용. Context/기본 hooks로 연결 상태를 공유하며 별도 전역 상태 라이브러리는 미도입 |
| TypeScript **5.9.3** | UI·순수 규칙·서버 계약의 타입 점검. 런타임 입력 검증과 보안 검사를 대신하지 않음 |
| CSS Modules + CSS 변수 | 컴포넌트별 스타일 격리와 승인된 색/간격 재사용. UI 라이브러리의 기본 외형에 종속되지 않음 |
| File System Access API / IndexedDB / Web Locks | 사용자 브라우저의 폴더 권한·기기별 핸들 보관·동시 저장 순서. npm 라이브러리가 아니라 브라우저 API |
| Node.js **24.22.1 LTS** / pnpm **12.15.0** workspace | 프로젝트 실행 버전 고정, web/domain 패키지 공유. 시스템 전체 Node와 프로젝트 실행 버전은 다를 수 있음 |
| Vitest **5.0.5**, ESLint **9.39.5**, eslint-config-next **16.4.3** | 권한·수명 규칙 테스트, 코드/Next 규칙과 서버 경계 검사. 브라우저 검증은 현재 저장소의 CDP 스크립트를 사용 |

Better Auth·PostgreSQL·Drizzle은 후보이며 미설치/미연결이다. TanStack Query·Redux·Zustand·Tailwind·Playwright를 현재 사용 기술로 기재하지 않는다. AI 모델/배포사도 미선정이다. 근거: package.json과 원문 설계 §18, 최신 architecture.md. 기존 서버 영구 보관/벡터DB 제안보다 사용자 로컬 보관 결정이 우선한다.

## 3. SSR인가 CSR인가

**Next의 서버/클라이언트 혼합 구조이며, 현재 작업 화면은 정적 사전 렌더링 + hydration + 브라우저 상호작용이다.**

- `app/layout.tsx`, `(workspace)/layout.tsx`, `files/page.tsx`는 Server Components다. 최근 빌드에서는 `/`, `/files`, `/settings`가 정적 HTML로 사전 생성되었다. 요청마다 SSR하는 상태와 다르다.
- `SourceFolderProvider.tsx`, `use-source-folder-connection.ts` 등은 `"use client"` 경계다. 초기 HTML에도 참여할 수 있고, 브라우저에서 hydration 후 이벤트/상태를 처리한다. `use client`가 HTML 생성까지 전부 브라우저 전용이라는 뜻은 아니다.
- 로컬 폴더 선택·권한·IndexedDB·목록 읽기는 브라우저에서 실행한다. 서버는 사용자의 로컬 파일 핸들을 직접 열 수 없다. SSR/Server Actions로 옮길 기능이 아니다.

## 4. 앞으로의 요청·보안 기준

```text
초기 화면 조회: Server Component → 서버 전용 서비스/데이터 접근 → API/DB
브라우저 업무 요청: UI → Server Action → 서버 전용 서비스/데이터 접근 → API/DB
로컬 파일: UI → 브라우저 파일 접근 모듈 → 사용자가 허용한 폴더
```

브라우저가 시작하는 업무 요청은 Server Actions로 제한한다. 서버 전용 모듈은 `src/server/` + `import "server-only"`, Action은 `src/app/actions/` + `"use server"`로 구분한다. 직접 fetch·외부/DB SDK·환경변수 접근을 UI에서 금지하는 린트를 추가했다. 아직 서버 업무 API가 없어 이전할 실제 호출이나 인증 Action은 없다.

사용자 기준인 **“프론트엔드에서 API 데이터를 가공하지 않는다”**를 적용한다. API 응답 정규화·업무 집계·가격/한도 계산·권한 필터링·DTO 변환은 서버에서 끝낸다. UI는 최소 표시 DTO와 입력/선택/접힘 상태를 사용한다. 날짜 표시 형식 같은 표현과 업무 값 변경을 구분한다. 로컬 파일 목록 정렬은 서버 API 데이터 가공과 다르며 전송 동의를 만들지 않는다.

**Server Actions로 F12를 막을 수는 없다.** 브라우저에 도착한 요청·응답·props·RSC·Action 결과는 보인다. API 비밀키/DB 접속정보/서버 스키마/공급자 토큰을 보내지 않고, Action마다 인증·소유권·입력·비용을 검증해야 한다. HttpOnly 쿠키도 페이지 JS의 읽기를 막을 뿐 사용자 자신의 DevTools까지 숨기지 않는다. 로컬 IndexedDB 구조는 해당 사용자에게 보인다.

## 5. 판단과 남은 검증

책임을 서버에 모으려는 방향은 이 프로젝트에 적합하다. 장점은 비밀정보 최소 전달, 업무 규칙의 단일 기준, 변조된 클라이언트 입력에 대한 서버 재검증, 작은 단위 테스트와 코드 검토다. React만의 단점을 없애는 방식이라기보다 브라우저를 신뢰하지 않는 웹 개발 원칙이다.

다만 모든 조회를 Server Action으로 돌리면 Action 큐 때문에 순차 실행 비용이 생긴다. 초기 조회는 Server Components의 서버 데이터 접근을 사용하고, Action은 명시적인 브라우저 작업에 둔다. OAuth callback·webhook·실시간 스트림은 별도 프로토콜 검토가 필요하며 현재 구현하지 않았다. 서버 연결 단계에서 실제 계정 교차 접근/위조 요청/응답·번들 비밀정보 부재를 검증해야 한다. 지금 린트 통과를 보안 완성으로 보지 않는다.

이번 경계 변경 검증: 린트 위반/허용21개, 제품 테스트76개, 타입·린트·build43페이지 통과. 실제 인증/API 보안 완료를 의미하지 않는다.

상세 규칙: `docs/guidelines.md`, 구조: `docs/architecture.md`, 이번 변경 검증: `docs/verification/server-boundary/README.md`.

공식 근거: [서버/클라이언트 컴포넌트](https://nextjs.org/docs/app/getting-started/server-and-client-components), [데이터 보안](https://nextjs.org/docs/app/guides/data-security), [Server Actions와 조회](https://nextjs.org/docs/app/guides/backend-for-frontend#server-actions). 실제 설치된 Next16.4.3의 동봉 문서와도 대조했다.
