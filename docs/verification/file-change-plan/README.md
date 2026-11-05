# 선택 파일 변경 계획 검토 — 2026-10-29

이전 인수인계의 다음 기능인 **읽기 전용 이동·복사·확장자 분류 계획**을 `/files`에 연결했다. 기존 선택/연결 상태를 사용하고 실제 출발/목적지 이름 목록을 재확인한다. 원본 적용, AI 분류, 외부 업로드는 구현하지 않았다.

## 확인 방법

production 서버 `http://127.0.0.1:3010/files` → 자료 폴더 연결 → 파일 체크 → 변경 계획 검토 → 작업 종류/목적지 상대 경로 → 계획 만들기. 목적지를 비우면 연결 루트다. 분류는 MD/마크다운·TXT/텍스트·그 외/기타의 확장자별 이동 제안이다. 없는 분류 폴더는 생성 예정으로만 표시한다. 실제 쓰기 버튼은 없다. 닫기/Escape로 취소하고 선택은 유지한다.

## 코드 읽는 순서와 변경 이유

1. [명세 PLAN-001~008](../../specs/file-change-plan.md): 허용 행동·실패·미구현 경계.
2. [file-change-plan.ts](../../../apps/web/src/features/local-folders/lib/file-change-plan.ts): 입력 경로 검증·파일별 출발/도착·충돌 후보를 계산하는 순수 규칙. 목적지 이름을 Set/Map으로 한 번 구성해 파일마다 목록 전체를 재검색하지 않는다. 대소문자/NFC 이름은 보수적으로 충돌 후보로 표시한다.
3. [source-plan-controller.ts](../../../apps/web/src/features/local-folders/store/source-plan-controller.ts): 입력·순차 읽기·취소·늦은 결과 차단. listing 변경을 구독해 선택/목록/연결/소유자가 바뀌면 계획을 폐기한다. 계획용 파일 핸들이나 선택 상태를 중복 저장하지 않는다.
4. [source-connection-controller.ts](../../../apps/web/src/features/local-folders/store/source-connection-controller.ts), [hook](../../../apps/web/src/features/local-folders/hooks/use-source-folder-connection.ts): 계획 store를 생성/노출하고 기존 session의 목록 읽기와 권한 상실 처리를 재사용한다. source session/reader는 변경하지 않았다.
5. [FileSelectionToolbar](../../../apps/web/src/features/local-folders/components/listing/FileSelectionToolbar.tsx) → [FolderListingView](../../../apps/web/src/features/local-folders/components/listing/FolderListingView.tsx) → [SourceFolderBrowser](../../../apps/web/src/features/local-folders/components/listing/SourceFolderBrowser.tsx): 계획 진입 버튼·콜백과 dialog 조합. 새로운 전역 상태나 라이브러리는 없다.
6. [SourcePlanDialog](../../../apps/web/src/features/local-folders/components/plan/SourcePlanDialog.tsx) → [FileChangePlanView](../../../apps/web/src/features/local-folders/components/plan/FileChangePlanView.tsx)와 인접 CSS: 입력/초점 수명과 결과 표시 분리. 기존 actionClasses·StatusNotice·CSS 토큰을 사용한다.
7. [규칙 테스트](../../../apps/web/tests/local-folders/lib/file-change-plan.test.ts), [계획 수명 테스트](../../../apps/web/tests/local-folders/store/source-plan-controller.test.ts), [실제 session 조합 테스트](../../../apps/web/tests/local-folders/store/source-listing-controller.test.ts), [브라우저 검사](../../../tests/browser/check-file-change-plan.mjs).

변경은 위 기능과 해당 문서·검증 도구에 한정했다. 새 패키지·lockfile 변경·범용 추상화·any를 추가하지 않았다. 승인된 채팅/시안은 유지했다. Git 첫 커밋 전 untracked 파일 전체를 이번 변경으로 세지 않는다.

## 실행 증거

- 프로젝트 Node **24.22.1**, pnpm **12.15.0**, Next **16.4.3**. 설치된 타입과 기존 File System Access reader를 재사용하고 새 외부 API를 도입하지 않았다.
- [구현 전 실패](red.md): 두 suite 모두 제품 모듈 부재로 수집 실패. 개별 assertion이 실행된 실패와 구분한다. 구현 후 신규 순수/수명 20개 통과, 실제 connection/session 통합 2개 추가.
- 최종 `pnpm check`: **143개 / 13파일 통과**, web/domain 타입·ESLint 경고0·서버 경계21개·웹 import25개/domain6개·배치3개와 실제 domain import 검사·production **43페이지** 빌드 통과.
- [테스트 효과 확인](mutation-checks.json): 정확한 이름 충돌 검사와 pending 읽기 abort를 각각 의도적으로 제거하면 해당 assertion이 실패했다. 원본 바이트 복원 후 관련 20개 다시 통과했다. [충돌 실패 로그](mutation-exact-name-conflict.txt), [취소 실패 로그](mutation-abort-pending-read.txt).
- [계획 최종 브라우저](final/checks.json): **32개 확인·측정 항목 실패0**. 실제 UI/store/session/IndexedDB/Web Locks/OPFS, 합성 picker/권한/오류를 사용했다. 입력 변경→이전 결과 폐기, 이동/복사/분류, 충돌, 잘못된 경로, 부분 목록의 단위 경계, 취소/늦은 응답, 읽기 오류/재시도, 권한 상실, 초점·Tab·Escape·합성 IME Enter·reduced-motion·긴 파일명·100/1,000개를 확인했다.
- 기존 회귀: [선택/팝업39](selection-after/checks.json), [연결51](connection-final/browser-checks.json), [목록46](listing-regression/browser-checks.json), [본문53](preview-regression/checks.json) 확인·측정 기록 실패0. 이 숫자는 독립 시나리오 수가 아니다.
- 추가 회귀: [연결 후 이동13](navigation-regression/checks.json), [실제/시안 화면 경계69](screens-regression/screen-checks.json) 실패0. 최종 계획32와 기존 회귀271을 합쳐 **303개 확인·측정 기록**이다. 변경한 선택 진입 화면도390/768/1440/1920 캡처를 직접 확인했다.
- sentinel 이름/size/mtime/SHA-256 동일, 계획 검사에서 제품 본문 읽기0·원본 쓰기0, 권한 모드 read만 호출, 외부 요청0, console error0. sentinel 외 전체 파일시스템의 무변경을 hash로 증명했다는 뜻은 아니며 쓰기 경계 프로브와 함께 해석한다.

## 발견한 문제와 수정

- 새 primary 버튼의 활성/비활성 색 보간 도중 대비가 약 1.4~1.5:1로 낮아지는 것을 실제 probe가 잡았다. 새 버튼만 상태를 즉시 표시하고 disabled 색도 명시했다. 최종 화면 probe/judge **0 FAIL/0 WARN**. 읽기 취소 버튼 제거 시 초점이 빠지면 dialog 제목으로 돌린다.
- 기존 연결 회귀의 버튼 높이 `>=40` 비교가 실제 DOMRect **39.999969px**에서 실패했다. [검사](../../../tests/browser/check-settings-folder-connection.mjs)에 **0.001px** 부동소수점 오차만 허용하고 재실행51개 통과. 40/44px 기준 자체는 유지했다. 최초 실패를 제품 크기 문제로 보고하지 않는다.
- 제한 환경의 Chrome `Page.enable` timeout은 격리 Chrome 테스트의 승인된 제한 밖 실행으로 해결했다. 개인 브라우저 프로필/폴더는 사용하지 않았다.

## 시각 검토

기존 achromatic-ledger(seed 2044201404), 팔레트·서체·토큰을 유지했다. 새 스타일 추첨/페이지 재설계는 하지 않았다. 화면의 질문은 “선택 파일이 어디로 가며 무엇을 확인해야 하는가?”이며 실제 경로 비교가 중심이다.

최종 캡처11개(이동390/768/1440/1920, 분류390/1440, 충돌390, 잘못된 경로390, loading390, 읽기 오류390, 긴 이름390)를 직접 열어 확인했다. 이름/경로·대상 수/문제 수는 계획 결과에서 계산하며 빈 슬롯을 장식으로 채우지 않는다. 모바일 입력은 쌓이고 경로는 줄바꿈하며 표시는 dialog 안에서 세로 스크롤한다. 대량 결과에서 닫기 버튼이 위로 스크롤될 수 있으며 Escape는 계속 동작한다.

taste 소스 lint: 0 FAIL, 그림자 WARN1. 실제 떠 있는 native dialog 한 곳의 6% 그림자로 기존 설정 dialog와 같은 허용 용도라 유지했다. 원자료 `browser/`는 대비 수정 전 첫 실행이며 최종 판정에는 `final/`을 사용한다. 기존 미구현 화면까지 전체 사이트 디자인 완료로 부르지 않는다.

## 성능과 남은 범위

[성능 비교](performance.md)와 전후 원자료를 함께 읽는다. 기능 추가 비용과 최적화를 구분하며 lab/CDP 시간을 field INP로 부르지 않는다.

실제 OS 선택창/권한 철회·실제 디스크·OS 한국어 IME·스크린리더·인증은 미검증이다. 현재 localhost 개발 소유자/IndexedDB 제한도 유지했다. 이름 목록은 시점의 스냅샷이며 파일 hash/내용·계획 후 외부 변경을 확인하지 않는다. 생성 예정 폴더/충돌 없음 표시는 실제 적용 허가가 아니다. 실제 원본 적용에는 별도 쓰기권한·hash 재검사·충돌 정책·journal·부분 실패/복구 검증이 필요하다.

후속 진행 순서는 [로드맵](../../roadmap.md)에 정리했다. 현재 폴더 파일명 검색은 [SEARCH-001~006](../../specs/file-name-search.md)으로 구현·검증했으며, 실제 원본 쓰기·인증·AI·유료 서비스로 자동 확장하지 않았다.
