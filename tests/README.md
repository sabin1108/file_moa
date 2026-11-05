# 검증 코드 안내

이 폴더는 제품 소스가 아니다. 기능 코드만 읽을 때는 apps/web/src/README.md부터 읽고 이 폴더는 접어두어도 된다.

| 위치 | 책임 |
| --- | --- |
| architecture | 실제 ESLint 설정을 통한 server/feature 경계 및 app/테스트 배치 검사, S0 모듈 graph |
| browser | 실제 경로·연결·목록·본문·다중 선택·팝업의 CDP 회귀 |
| fixtures | 개인정보 없는 합성 폴더/권한/실패 주입. 제품에서 import 금지 |
| performance | 경로별 측정과 Lighthouse 실행 |
| s0 | 독립 저장/복구/연결 probe. 앱에 연결되지 않은 검증 도구이며 원본 제품 기능과 구분 |

단위 테스트는 각 패키지의 tests에 둔다: apps/web/tests/local-folders와 packages/domain/tests. S0의 *.test.mjs도 pnpm test에서 함께 실행한다. 실행 결과·화면·측정값은 docs/verification에 보관하며 테스트 코드 폴더와 구분한다.

```powershell
pnpm check
pnpm exec node tests/browser/check-destination-picker.mjs http://127.0.0.1:3010 docs/verification/plan-destination-picker/new-run
pnpm exec node tests/browser/check-file-browser-navigation.mjs http://127.0.0.1:3010 docs/verification/file-browser-navigation/new-run
pnpm exec node tests/browser/check-file-name-search.mjs http://127.0.0.1:3010 docs/verification/file-name-search/new-run
pnpm exec node tests/browser/check-file-change-plan.mjs http://127.0.0.1:3010 docs/verification/file-change-plan/new-run
pnpm test:s0-graph
pnpm exec tsc --noEmit -p tests/s0/tsconfig.json
pnpm exec node tests/browser/check-file-selection-dialog.mjs http://127.0.0.1:3010 docs/verification/readable-structure/browser
pnpm exec node tests/browser/check-source-file-preview.mjs http://127.0.0.1:3010 docs/verification/readable-structure/preview
pnpm exec node tests/browser/check-source-folder-browser.mjs http://127.0.0.1:3010 docs/verification/readable-structure/listing
pnpm exec node tests/browser/check-settings-folder-connection.mjs http://127.0.0.1:3010 docs/verification/readable-structure/connection
pnpm exec node tests/browser/check-connection-navigation.mjs http://127.0.0.1:3010 docs/verification/readable-structure/navigation
pnpm exec node tests/browser/check-live-screens.mjs http://127.0.0.1:3010 docs/verification/readable-structure/screens
```

브라우저 검사에는 로컬 production 서버가 필요하다. 격리 프로필/합성 OPFS만 사용하며 개인 자료를 선택하지 않는다. 실제 OS 권한창·로그인을 검증한 것으로 보고하지 않는다. 재실행은 다른 출력 경로를 주어 과거 원자료를 보존한다.

`tests/architecture/check-file-plan-mutations.mjs`는 계획 충돌/취소 규칙 두 곳을 한 번씩 의도적으로 깨뜨려 테스트가 실패하는지 확인하고 원본 바이트를 finally에서 복구하는 별도 검증이다. 소스 편집·빌드와 동시에 실행하지 않는다. 일반 `pnpm check`에는 포함하지 않는다.
