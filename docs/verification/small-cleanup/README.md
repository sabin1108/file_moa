# 작은 중복·불필요한 연결 코드 정리 — 2026-11-05

Ponytail 최소 변경 기준과 Fallow 3.39.0의 후보를 실제 호출 관계로 확인했다. 최신 사용자 지시로 일반 단독 로컬 수정·검증을 수행했다. 이전 OMX 합의 계획의 로컬 검토를 공식 실행 receipt로 취급하지 않았다. VS Code 미저장 버퍼는 사용자 지시로 제외했다.

## 변경과 감소량

측정 범위는 기존 코드 14파일과 새 공통 도우미 1파일이다. 문서·스크린샷·검증 산출물은 코드 감소량에서 제외했다. 새 파일의 19줄도 변경 후 합계에 포함했다. 줄 수는 실제 UTF-8 파일의 물리적 줄 수다.

| 항목 | 변경 전 | 변경 후 | 차이 |
| --- | ---: | ---: | ---: |
| 변경 대상 코드 전체 | 1,343줄 | 1,311줄 | -32줄 / -2.38% |
| 코드 바이트 | 89,231 | 87,266 | -1,965 / -2.20% |
| 관련 CSS 3파일 | 171줄 | 153줄 | -18줄 / -10.53% |
| 브라우저 검사 2파일 + 새 도우미 | 536줄 | 521줄 | -15줄 / -2.80% |
| wait/click 함수 정의 | 4개 | 2개 | 중복 정의 2개 제거 |
| 경로 함수 우회 소비자 | 8곳 | 0곳 | 순수 규칙 모듈 직접 연결 |

import 정리는 type import를 명시적으로 분리해 총 1줄 늘었다. 이 증가분까지 전체 감소량에 반영했다. [파일별 원자료](metrics.json).

Fallow의 동일 옵션·캐시 없는 전체 분석에서 중복 줄 수는 2,486→2,455(-31), 중복률은 11.2235%→11.0996%(-0.1239%p)다. clone group 수는 114→121로 늘었다. 공통 블록 추출로 긴 clone이 여러 그룹으로 나뉘므로 그룹 수 감소를 성과로 주장하지 않는다. 미사용 export 후보는 43→38이며, unused file 후보는 61→62다. 새 도우미의 호출자가 수동 실행 테스트라 도우미도 정적 진입 그래프에서 미사용 후보로 잡힌다. 실제 브라우저 실행에서 사용됨을 확인했고 삭제/숨김 처리하지 않았다. 정적 분석의 나머지 후보를 결함으로 확정하거나 모두 해소했다고 보고하지 않는다.

## 리뷰할 파일과 이유

1. [folder-path.ts](../../../apps/web/src/features/local-folders/lib/folder-path.ts): 실제 순수 경로 함수 소유자이며 구현·검증 규칙은 그대로다.
2. [source-folder-listing.ts](../../../apps/web/src/features/local-folders/services/source-folder-listing.ts): 불필요한 재export만 삭제했다. destination-picker-controller와 create-entry/copy-journal-storage/folder-creation-journal/folder-history/history-target-inspection/folder-tree-search/source-file-preview의 8곳은 lib를 직접 import한다. 9개 TypeScript 파일의 import/reexport 이외 본문이 원본과 같음을 assert로 확인했다.
3. history/folder-history.module.css의 rowTitle, managed/managed-files.module.css의 location, plan/file-change-plan.module.css의 steps/inputs/destinationActions와 하위·media 선택자를 삭제했다. 실제 사용하는 다른 CSS 모듈의 location은 보존했다. 모든 기존 소비자·동적 참조를 검색했고, 세 CSS 파일이 삭제만 포함함을 원본과 비교했다.
4. [browser-actions.mjs](../../../tests/fixtures/browser-actions.mjs): 두 recovery 검사에서 같던 wait/click을 그대로 추출했다. page를 명시적으로 전달한다. 600회/30ms polling, timeout throw, modal 우선 선택, visible/enabled 조건, scroll, CDP press/release를 유지했다. factory·옵션·공통 runner는 추가하지 않았다.
5. [archive 검사](../../../tests/browser/check-recovery-archive-ui.mjs), [restore 검사](../../../tests/browser/check-recovery-restore-ui.mjs): 검증 문구/순서/시나리오/assert/결과 저장을 보존했다. choosePlanDestination에는 해당 page를 사용하는 클릭 callback을 전달한다.

## 검증

- 변경 전: 568테스트/56파일, typecheck, lint 통과. production build 43페이지 성공.
- import 정리 후: listing/preview 관련 단위 검사 28개 통과.
- 변경 후 `pnpm check`: typecheck, lint, 568테스트/56파일, server boundary 21검사, feature boundary 25 web+6 domain fixture/3 layout 및 실제 domain import, build 43페이지 통과.
- 캐시 없는 Fallow 재분석 수행. Fallow architecture boundary 설정은 추가하지 않았으며 실제 경계 검증은 기존 프로젝트 검사로 수행했다.
- 테스트 도우미의 원본 함수 본문 일치를 assert로 확인했다. 새 helper 추출 전후 archive/restore 검사 이름·순서도 JSON으로 비교해 동일함을 확인했다.

브라우저는 새 production build를 127.0.0.1:3041에서 재시작해 사용했다. 개별 실행마다 격리된 합성 OPFS/권한 fixture만 사용했다. 사용자 폴더/핸들/원본은 선택하지 않았다. before는 기존 빌드, helper는 추출 후 기존 빌드, after는 수정한 빌드다.

| 검사 | 변경 전 | helper 추출 후 | 수정한 빌드 |
| --- | ---: | ---: | ---: |
| 보관함 archive | [37](before/archive/checks.json) | [37](helper/archive/checks.json) | [37](after/archive/checks.json) |
| restore | [43](before/restore/checks.json) | [43](helper/restore/checks.json) | [43](after/restore/checks.json) |
| managed files | — | — | [20](after/managed/checks.json) |
| 최신 workflow UX | — | — | [49](after/workflow/checks.json) |

수정한 빌드에서 전체 통과한 브라우저 assertion은 149개다. 부분 통과한 과거 스크립트는 이 수에 넣지 않는다. workflow는 390/768/1440/1920px 문서 작업면, 파일/폴더 계획 입력, 단계 표시, 초안·연결 F5 복원과 쓰기 자동 재실행 금지 등을 확인했다.

## 과거 검증 스크립트의 실패와 대체 확인

기존 check-folder-history/check-file-change-plan의 기본 Chrome 실행은 navigation 전 Page.enable에서 timeout이었다. .omx의 임시 사본에 성공한 기존 검사와 같은 no-sandbox/disable-gpu 실행 옵션 및 파일 이동에 필요한 import URL만 적용해 재시도했다. 원본 검사 파일은 수정하지 않았다.

- history는 [40개 assertion 통과](after/history-launch/results.json) 후 F5에서 예전 ‘다시 연결’ 버튼을 기다리다 종료했다. 최신 허용 연결 자동 복원 계약과 맞지 않는다. 전체 성공으로 보고하지 않는다.
- plan은 [검사 0개](after/plan-launch/checks.json) 상태에서 예전에 제거된 상시 ‘선택’ 버튼을 찾다가 종료했다. 현재 선택은 길게 누르기/Space다.
- 이 두 실패를 제품 회귀로 확정하거나 검사 조건을 완화하지 않았다. 최신 동작을 검증하는 check-workflow-ux를 대체 확인으로 실행한다. 과거 검사의 최신화는 이번 작은 정리에서 제외했다.

## 제외한 큰 구조 변경과 한계

FolderConnectionSession을 연결/권한/복구/편집 서비스로 더 분리하거나, useWorkspaceWorkflow의 URL·IndexedDB·F5 복원/저장 구독 구조를 재설계하는 일은 제외했다. 이런 변경은 세대 무효화·취소·공유 상태 소유권·쓰기 재실행 금지까지 함께 검증해야 하므로 별도 범위다. 현 구조가 잘못됐다고 단정하지 않는다.

사용자 실물 디스크, OS 권한창, 물리 IME, 외부 프로세스 경쟁 및 실사용 성능은 검증하지 않았다. 이번 감소량은 소스 크기이며 번들·실행 속도 개선을 뜻하지 않는다. 새 의존성·commit·PR·배포는 없다.
