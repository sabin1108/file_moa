# 기능 중심 구조 개편 완료 — 2026-11-13

어제 중단된 요구258을 대화 로그와 실제 이동 상태에서 확인해 이어 마쳤다. 기능의 화면·상태·규칙·외부 접근이 역할별 폴더에 흩어져 읽기 어려웠던 구조를 기능 우선으로 모으고, 큰 조립점에서 작은 책임으로 내려가도록 정리했다. 기존 디자인과 동작은 유지했다.

## 바뀐 범위와 읽는 순서

- 소스294개, 단위 테스트138개와 보조파일1개의 이동을 모두 적용했다. 이동 명세433개에서 이전 위치는 없고 목적지는 모두 존재한다. 역할이 다른 동명 파일9개는 이름을 구분했다.
- `local-folders`는 connection/browsing/documents/content/operations/recovery/organization/search/creation/destination-picker/history/workflow 등으로, 대화·기록·인증·샘플과 서버도 실제 기능과 하위 책임으로 모았다.
- app의 기존30개 파일과 URL을 유지했다. app에는 Next 진입점만 두고 일반 기능 파일을 추가하지 않았다. 새 Provider도 만들지 않았다.
- 대화 기록 hook은 대화의 `records`에 두고 기록 UI는 자기 기능의 `ConversationRecordControls`로 필요한 값과 명령만 받는다. 기록 UI가 대화 구현을 import하는 방향은 lint 규칙과8개 허용/거부 사례로 막았다.
- 사용량 표시의 CSS7개 규칙은 대화 설정 옆으로, 실제 공유하는 펼침 표시3개 규칙은 공통 controls로 옮겼다. 값과 표시 동작은 같다.
- 현재 소스 안내·코드 설명서·읽기 보고서·관련 명세의 경로를 갱신했다. 과거 검증 결과와 원자료는 덮어쓰지 않았다.

처음에는 [소스 지도](../../../apps/web/src/README.md) → [행동별 호출 지도](../../code-map.md) → [실제 식과 반환값을 읽는 설명서](../../코드_이해하기.md) 순서로 읽는다. 파일 작업은 [local-folders 안내](../../../apps/web/src/features/local-folders/README.md), 테스트는 [웹 테스트 안내](../../../apps/web/tests/README.md)를 따른다.

중앙 `connection-session`의 내부 업무 로직은 이번에 재작성하지 않았다. 폴더 이동만으로 모든 내부 복잡성이 사라졌다고 주장하지 않는다.

## 새 검증 결과

| 실행 | 결과 |
| --- | --- |
| 기능 묶음별 이동 후 테스트·타입 | 모두 통과. 전체 이동을 끝내기 전에 관련 실패를 확인하며 진행 |
| `pnpm check` | Prisma schema·타입·린트·154파일1,332테스트·서버 경계26·구조32+6+3·production build 통과 |
| 최종 `pnpm typecheck` | 빌드가 바꾼 next-env를 시작 상태로 되돌린 뒤에도 통과 |
| 이동·본문 감사 | 이동433개 일치, 일반 본문384개는 경로 외 구문 보존. 타입/CSS 연결을 보정한 UI4개도 본문 동작 보존, CSS10개 선언 일치 |
| app·수명 감사 | app30개 AST, Provider 순서, owner key, records.stop→recovery.stop→controller.stop→switchOwner(null) 유지. 메모리상 실패 변형3개 감지 |
| `pnpm test:s0-graph` | 가상 endpoint를 유지하며 실제168개 모듈과 브라우저 export 확인 |
| root hydration | 깨끗한 SSR은 경고 없음. 외부 html 속성 주입 시 예상한 경고 재현 |
| 일반 채팅·자료 대화 | 각각40개·22개 통과. 패널10회 전환·초안·합성 composition Enter·스트림/취소/실패 포함 |
| 기록·찾기·위키 | 각각29개·55개·16개 통과. 합성 기록과 실제 제품 저장/열기·근거·편집 경로 사용 |
| 파일 관리·복원 | 합성 폴더 fixture에서 실제 제품 UI32개·43개 통과 |
| PDF·OCR·빌드 Worker | 실제 해시 Worker와 내부 PDF.js Worker의 텍스트 추출, OCR12개, production Worker의 해시·본문·잘못된 UTF-8 거부 통과 |
| 공개 실제 화면·데모 | 각각40개·42개 통과. 390/768/1440/1920px·키보드·익명 인증 경계 확인 |
| Ego 실제 브라우저 | 사용량 computed style·펼침 메뉴 Enter 조작, 소개→샘플 대화 진입, 화면 캡처 직접 확인. 가로 넘침 없음 |
| 문서·diff | 주요 안내와 읽기 문서의 로컬 링크 누락0, `git diff --check` 통과 |

원자료는 로컬 `.omx/verification/feature-first-restructure-20261112/`에 있다. `full-check.log`, `final-type.log`, `applied-audit.json`, `static-summary.json`, 각 브라우저 출력 폴더와 `usage-style.json`, `ego-checks.json`을 구분해 보관했다. 반복 실행을 고유 사례 수에 더하지 않는다.

이동 도구가 디렉터리 문자열을 파일 진입점처럼 해석해 구조 검사의 domain 폴더가 `src/index`로 바뀐 오류1곳은 원래 폴더로 고쳤다. 제품의 권한이나 오류 처리를 완화하지 않았다. 사용량 임시 fixture의 React 해석 오류는 검사 환경의 alias와 사전 준비로 수정했으며 제품 코드는 바꾸지 않았다. 독립 native 조회는 역방향 import·app 구조·Worker 상대 경로를 확인하고 읽기 안내의 옛 경로를 찾아 수정에 반영했다. 전용 문서 실행 담당 호출은 지정 모델 미지원으로 실패해 주 담당이 문서와 최종 검증을 수행했다.

## 정적 분석과 실행 한계

Fallow3.42.0 무캐시 분석은 후보271개를 보고했다. 미사용 파일134·export83·타입8·클래스 멤버26·unresolved17·미등록 의존성3이다. 제품 소스의 unresolved는0이며, 미사용으로 분류된 제품 파일1개는 S0 동적 복구 검사에서 사용하는 `ai-records/storage/record-recovery.ts`라 보존했다. 후보를 없애기 위한 일괄 삭제나 억제·의존성 추가는 하지 않았다. Fallow의 자체 architecture/policy 설정은 없으므로 해당0값을 검사 통과로 해석하지 않는다. 실제 경계 검증은 위 ESLint 기반 검사 결과다.

Docker API pipe가 없어 격리 DB·인증 폼 제출 검사는 실행하지 못했다. 실제 개인 폴더·OS 권한창·물리 IME·Safari/Firefox·OAuth·실모델/메일 전송은 이번에 확인하지 않았다. 합성 폴더와 공급자 응답 fixture를 실제 사용자 자료나 공급자 검증으로 보고하지 않는다. 앞선60분 Ego 메모리 관찰의 원인 미확정도 이번 개편으로 해결됐다고 표시하지 않는다.

기준 HEAD는 `1c72e57fc7403591f12a7586f2c779efbb1874d5`이며 기존 미커밋 변경을 보존했다. 새 의존성·유료 AI 호출·실제 DB 쓰기·커밋·푸시·배포는 없다. 로컬3034는 새 production build로 실행했다.

사용자가 어제 명시적으로 허용한 일반 코드 검토·회귀 검증 절차를 이어 수행했다. 이전 Ralplan의 host/Critic gate는 미완료 이력 그대로 두며 이번 완료 결과를 공식 receipt나 Critic 승인으로 바꾸지 않는다.
