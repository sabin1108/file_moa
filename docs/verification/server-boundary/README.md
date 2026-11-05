# 서버 통신·데이터 책임 경계 — 2026-10-27

사용자가 현재 구현 위치·SSR/CSR·기술 선택 이유의 바탕화면 요약, Server Actions를 통한 업무 요청, 프론트엔드 API 데이터 가공 금지 규칙을 요청했다.

## 확인과 적용

- 실제 제품 코드에는 현재 외부 API/AI/서버 DB 호출과 Server Actions가 없다. 서버 라우트는 비민감 상태를 반환하는 `/api/health`다. 현재 로컬 폴더는 브라우저 파일 API이며 서버 통신으로 변경하지 않았다.
- 서버 호출을 숨겨 보안을 확보한다는 전제는 수정했다. Action의 POST/응답·RSC·브라우저 쿠키·로컬 IndexedDB는 사용자 DevTools에서 볼 수 있다. 서버 자격증명을 전송하지 않고 요청마다 권한을 검증하는 계약을 작성했다.
- 브라우저 업무 요청은 Action, 초기 조회는 Server Component가 서버 서비스로 위임한다. UI의 직접 네트워크/외부 API·DB SDK/환경변수 접근을 제한했다. API 정규화/업무 계산/권한 필터링/DTO 생성은 서버 책임으로 명시했다. 데이터 의미를 바꾸지 않는 표시와 로컬 파일 처리는 구분했다.
- 실제 인증·DTO·DB 유스케이스가 없어 빈 서버 폴더나 가짜 인증 Action은 추가하지 않았다. 인증, workspace 격리, 실제 DTO 보안은 후속 기능에서 구현·검증해야 한다.

## 변경 파일 읽는 순서

1. [짧은 기술 요약](../../project-stack-and-security.md): 현재 코드 위치, 버전·선택 근거, 정적 사전 렌더링/hydration, 서버·브라우저 구분. 바탕화면에는 이 파일의 동일 사본을 제공한다.
2. [guidelines.md](../../guidelines.md): 사용자 요구를 명시하고 허용/금지 및 검증 계약을 정의한다. [architecture.md](../../architecture.md)는 기존 Route Handler 중심 초안보다 이 경계를 우선하도록 개정했다.
3. [server-boundary.mjs](../../../apps/web/tooling/server-boundary.mjs): 서버 모듈의 실제 `server-only` 부수효과 import, Action의 지정 경로/`use server`, 서버 디렉터리의 `use client` 금지, 일반 모듈의 fetch/XHR/WS/EventSource/환경변수/알려진 SDK 패턴을 검사한다. 공유 의존 파일도 검사하므로 `use client`가 없는 helper에 직접 fetch를 숨기는 실수를 잡는다.
4. [eslint.config.mjs](../../../apps/web/eslint.config.mjs): 기존 Next 규칙 뒤에 경계 규칙을 적용한다. raw I/O는 `src/server/`로 한정하며 Action/Server Component도 같은 데이터 접근 계층을 사용한다.
5. [check-server-boundary.mjs](../../../scripts/check-server-boundary.mjs): 실제 ESLint 설정에 위반/허용 가상 파일21개를 넣어 판정한다. 테스트에서 네트워크나 인증/DB를 실행하지 않는다. 비밀값을 쓰지 않는다.
6. [package.json](../../../package.json): `test:boundaries`를 추가하고 `check`에 연결했다. 새 의존성과 lockfile 수정은 없다.

## 검증 근거

- 최초 검사: 직접 UI fetch를 기존 lint가 허용해 `UI direct fetch: []`로 실패했다. 규칙 구현 후 최초19개 통과.
- 추가 반례: 타입 전용 `import type {} from "server-only"`가 보호 표식으로 인정되는 문제를 테스트로 재현했다. 실제 부수효과 import만 인정하도록 고친 뒤, inline Action 위치 검사까지 포함한 **21개 통과**.
- `pnpm test:boundaries`: 최종21개 통과.
- `pnpm test`: 기존 제품 규칙76개 통과.
- `pnpm typecheck`, `pnpm lint`: 통과. 최종 규칙 보강 뒤 lint 재실행 통과.
- `pnpm build`: Next16.4.3 production build43페이지 성공. `/`, `/files`, `/settings`의 `○ Static`과 `/api/health`의 `ƒ Dynamic`을 실제 출력으로 확인했다.
- 설치/실행 버전: Next16.4.3, React19.3.1, ESLint9.39.5, pnpm12.15.0, 프로젝트 Node24.22.1 확인. 코드/설계와 설치된 Next의 data-security/fetching-data/server-and-client-components/backend-for-frontend/mutating-data 가이드를 대조했다.

이번 제품 UI 변경은 없어서 브라우저 시각/IME/Lighthouse를 반복하지 않았다. 이전 목록 로직의 실제 OPFS8확인은 [이전 단위 기록](../source-folder-listing/README.md)이며 이번에 재실행한 결과로 계산하지 않는다.

## 한계

정적 규칙은 알려진 직접 접근과 경계 표식의 누락을 잡는 보조 장치다. 임의 별칭·동적 import·새 SDK·규칙 비활성화·응답 본문의 민감값·잘못된 권한 계산을 완전 탐지하지 않는다. 실제 인증·서버 DB/모델 서비스가 없으므로 보안 침투검사·A/B 계정 격리·서버 DTO 변조·프로덕션 토큰 비노출 검증 완료로 주장하지 않는다. 배포 전 서버 기능별 실패 테스트와 번들/네트워크 확인이 필요하다.

공식 참고: [Next 데이터 보안](https://nextjs.org/docs/app/guides/data-security), [서버/클라이언트](https://nextjs.org/docs/app/getting-started/server-and-client-components), [Action 큐와 조회](https://nextjs.org/docs/app/guides/backend-for-frontend#server-actions).
