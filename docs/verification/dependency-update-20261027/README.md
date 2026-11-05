# 필요한 의존성 업데이트 — 2026-10-27

사용자 요청: 최신 버전이라는 이유만으로 전부 올리지 않고 필요성과 호환성을 확인해 적용한다. 제품 기능·디자인은 변경하지 않았다.

## 적용과 유지 판단

| 항목 | 결정 | 근거 |
| --- | --- | --- |
| 프로젝트 Node | 24.16.0 → 24.22.1 LTS | 같은 24 계열의 보안 수정. `devEngines.runtime`, `.node-version`, lockfile로 고정 |
| Next / eslint-config-next | 16.4.2 → 16.4.3 | 공식 버그 수정 릴리스, 함께 업데이트. 관련 env/SWC/plugin만 lockfile 갱신 |
| pnpm | 12.15.0 유지, 사용자 명령 경로에 설치 | 이미 최신. 이전에는 npx 캐시의 실행 파일만 사용 가능했음 |
| React / React DOM | 19.3.1 유지 | 확인 당시 최신 안정판 |
| Vitest | 5.0.5 유지 | 확인 당시 최신 안정판 |
| TypeScript | 5.9.3 유지 | 최신 7.0.2는 설치된 typescript-eslint 8.72.0의 `>=4.8.4 <6.1.0` 지원 범위 밖. 기존 ADR의 5.9 기준 유지 |
| ESLint | 9.39.5 유지 | 최신 10.11.0은 React/import/jsx-a11y 플러그인의 ESLint 9까지인 peer 범위 밖 |
| 시스템 npm | 11.13.0 유지 | 프로젝트 실행/설치는 pnpm 사용. npm 12 전환 필요 없음 |
| nvm | 추가하지 않음 | 이 프로젝트의 런타임 고정은 pnpm으로 충족 |

ESLint 9 설치 시 deprecated 경고는 남는다. 감사에서 발견된 취약점은 없지만 장기 지원을 의미하지 않는다. 관련 플러그인이 ESLint 10을 지원할 때 함께 전환한다. 기존 타입 패키지와 기타 전이 의존성을 일괄 업데이트하지 않았다.

공식 근거: [Node 보안 릴리스](https://nodejs.org/en/blog/release/v24.22.1), [Next 버그 수정 릴리스](https://github.com/vercel/next.js/releases/tag/v16.4.3), [pnpm 프로젝트 런타임](https://pnpm.io/package_json#devenginesruntime), [pnpm runtime 명령](https://pnpm.io/cli/runtime). 호환성은 설치된 package.json 및 [typescript-eslint](https://registry.npmjs.org/typescript-eslint/8.72.0), [React plugin](https://registry.npmjs.org/eslint-plugin-react/7.37.5), [jsx-a11y](https://registry.npmjs.org/eslint-plugin-jsx-a11y/6.10.2), [import plugin](https://registry.npmjs.org/eslint-plugin-import/2.32.0)의 peerDependencies를 확인했다.

## Windows 전체 Node와 프로젝트 Node의 차이

공식 Node MSI의 SHA-256 및 OpenJS Foundation 서명을 확인한 뒤 설치를 시도했다. 기존 시스템 설치를 제거하는 단계에서 관리자 권한 오류 1730, 설치 종료 코드 1603으로 실패했다. 시스템 `E:\nodejs\node.exe`는 **24.16.0 그대로**다. 시스템 교체·재부팅을 완료했다고 보고하지 않는다. 설치 로그는 로컬 `.omx/dependency-update-20261027/node-install.log`에 남겼다.

대신 pnpm 공식 런타임 관리 기능으로 프로젝트 Node 24.22.1을 내려받고 버전·체크섬을 lockfile에 저장했다. 루트/web/domain에서 `pnpm exec node --version` 모두 v24.22.1 확인. `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm start`도 해당 런타임을 사용한다. 다른 프로그램에 영향을 주는 전역 Node shim은 추가하지 않았다.

```powershell
pnpm --version                  # 12.15.0
pnpm exec node --version        # v24.22.1 (프로젝트)
node --version                  # v24.16.0 (Windows 전체)
pnpm install --frozen-lockfile
pnpm check
```

pnpm은 사용자 npm 경로에 설치했으며 Windows 실행 파일 연결도 검증했다. `saveExact`는 pnpm 12가 읽는 `pnpm-workspace.yaml`로 옮겼고 실제 설정 true를 확인했다.

## 이번 검증

- 변경 전: 전체 단위 테스트 61개, workspace 타입 검사, 웹 린트 통과. 패키지 감사 0건.
- 변경 후: `pnpm install --frozen-lockfile --strict-peer-dependencies` 통과.
- `pnpm check`: web/domain 타입 검사, 웹 린트, 6파일 61테스트, Next 16.4.3 프로덕션 빌드 43페이지 통과. S0 별도 타입 검사도 통과.
- 새 런타임으로 서버를 다시 시작해 실제 브라우저 확인: 연결 상태 공유 49개 확인 + 2개 측정 기록, 주요 화면·시안 경계 69개 확인, 모두 통과.
- 브라우저는 격리 Chrome 프로필의 실제 IndexedDB/Web Locks/OPFS를 사용했다. picker/권한/실패는 합성 주입이며 OS 네이티브 권한과 사용자 실제 폴더, 실제 계정·AI는 검증 범위 밖이다.
- 기존 자동 시각 검사에서 미구현 화면의 빈 공간 지적은 남는다. 기능 검사 통과를 모든 시각 검사 통과로 해석하지 않는다. 이번에는 성능 전후 측정이나 성능 개선 주장을 하지 않는다.
- 변경 후 패키지 감사도 0건. npm 의존성 감사는 Node 런타임의 보안 판정을 대신하지 않는다.

원본 증거: [환경](environment.json), [전체 검사 로그](check.log), [변경 전 감사](audit.before.json), [변경 후 감사](audit.after.json), [연결 브라우저 검사](connection/browser-checks.json), [화면 검사](screens/screen-checks.json). check.log 첫 부분의 PowerShell NativeCommandError 표시는 pnpm이 명령 안내를 stderr에 출력해서 생긴 래퍼 표시이며, 이후 실제 검증 명령 종료 코드는 0이다. 첫 `ErrorActionPreference=Stop` 시도는 이를 오류로 처리했으므로 계속 처리 모드로 재실행했다.

## 리뷰 순서와 남은 일

1. 루트 `package.json`과 `.node-version`: 프로젝트 Node 고정.
2. `apps/web/package.json`과 `pnpm-lock.yaml`: Next 관련 패키지만 갱신하고 런타임 해시 기록.
3. `pnpm-workspace.yaml`, `.npmrc`, 루트 README, ADR 0001: 정확한 버전 저장 및 실행 안내.
4. 이 문서의 실제 검증 결과와 시스템 Node 미변경 경계 확인.

다음 제품 기능은 기존 계획대로 연결 폴더의 실제 파일·하위 폴더 목록 읽기다. 이번 업데이트에서 착수하지 않았다. Windows 전체 Node 교체는 관리자 권한이 있는 별도 설치가 필요하지만 이 프로젝트의 실행·검증은 새 버전으로 완료했다.
