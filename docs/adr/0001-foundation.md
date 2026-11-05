# ADR 0001: 초기 개발 기반
날짜 2026-10-23. 상태: 초기 골격 채택, 외부 연동 미정.

사용자 설계 v0.3의 Next App Router/React/TypeScript/CSS Modules, pnpm workspace를 따른다.
현재 Node 24.16.0에서 Next 16.4.2 + React 19.3.1, TypeScript 5.9.3을 고정한다.
TypeScript는 Next와 함께 검증할 보수적인 5.9 계열을 사용한다. 무조건 latest 갱신하지 않는다.
pnpm 12.15.0을 packageManager에 명시하며 npx --yes pnpm@12.15.0으로 전역 변경 없이 실행한다.
현재 web/domain만 생성한다. worker/db/Query/인증/ORM은 실제 기능 착수 시 호환 버전을 확인해 추가한다.
모델·임베딩·리전·호스팅·예산·보존 기간은 미확정. 실제 비용이나 서비스를 생성하지 않는다.

## 2026-10-27 유지보수 개정

사용자는 필요한 최신 업데이트만 적용하고 호환되지 않는 업데이트는 제외하도록 요청했다. Next와 eslint-config-next는 16.4.3으로 함께 올렸다. Node는 보안 수정이 포함된 24.22.1 LTS로 고정하며 pnpm의 `devEngines.runtime`으로 프로젝트 실행 환경을 관리한다. 시스템 MSI 교체는 관리자 권한 오류로 실패했으므로 Windows 전체 Node 24.16.0과 프로젝트 런타임을 구분한다. pnpm 12.15.0은 사용자 명령 경로에 설치했다. nvm은 추가하지 않았다.

TypeScript 7은 현재 typescript-eslint의 `<6.1.0` 지원 범위를 벗어난다. ESLint 10은 React/import/jsx-a11y 플러그인의 peer 범위를 벗어난다. TypeScript 5.9.3과 ESLint 9.39.5를 유지하며 도구 체인의 지원 범위가 맞을 때 다시 검토한다. React 19.3.1, Vitest 5.0.5, pnpm 12.15.0은 최신 안정판이라 유지한다. [판단 근거와 검증](../verification/dependency-update-20261027/README.md).

