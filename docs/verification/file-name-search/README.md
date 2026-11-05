# 현재 폴더 이름 검색 — 2026-10-29

연결 → 탐색 → 이름 검색 → 파일 선택 → 미리보기/변경 계획 검토를 연결했다. 로그인은 사용자의 별도 요청 전까지 구현하지 않는다. Gothic A1은 [공식 자료를 확인한 서체 후보](font-reference.md)로 기록했고 시스템 폰트는 유지했다.

## 사용 흐름

`http://127.0.0.1:3010/files`에서 자료 폴더를 연결하고 이름을 입력한다. 현재 읽은 직접 자식 이름만 필터링한다. 검색 결과를 전체 선택해도 검색 밖의 기존 선택은 남는다. 총 선택 수와 숨겨진 선택 수가 표시되며 계획 검토에는 모두 포함된다. 검색 지우기/Escape는 검색만 초기화하고 별도 선택 해제는 전체 선택을 비운다.

미리보기나 같은 작업 화면의 왕복·현재 폴더 새로고침은 검색을 유지한다. 다른 폴더 이동 시도와 연결 교체는 검색을 초기화한다. 한글 조합 중에는 입력만 갱신하고 조합 완료 뒤 목록을 갱신한다. 본문 검색·재귀 검색·초성 검색·원본 적용은 구현 범위 밖이다.

## 변경과 코드 읽는 순서

1. [SEARCH-001~006 명세](../../specs/file-name-search.md): 사용자 결과, 검색 범위, 선택·입력 수명과 실패 조건.
2. [source-search.test.ts](../../../apps/web/tests/local-folders/store/source-search.test.ts): 11개 핵심 회귀. [처음 실패](red.md)는 모듈 부재로 수집 실패한 기록이다.
3. [file-name-search.ts](../../../apps/web/src/features/local-folders/lib/file-name-search.ts): 공백 제거·NFC·대소문자 비구분의 리터럴 부분 일치. 원본 이름/정렬을 바꾸지 않고 빈 검색어는 기존 배열을 반환한다.
4. [source-listing-controller.ts](../../../apps/web/src/features/local-folders/store/source-listing-controller.ts): 확정 검색어를 기존 목록/선택과 함께 소유한다. `selectAll`/`clearVisibleSelection`은 현재 보이는 파일만 바꾸고 `clearSelection`은 전체를 비운다. 늦은 콜백과 읽기 중 입력을 막는다. 새 전역 저장소와 파일 접근 경계는 추가하지 않았다.
5. [FileNameSearch.tsx](../../../apps/web/src/features/local-folders/components/listing/FileNameSearch.tsx)와 인접 CSS: IME 임시 입력·Escape·입력 초점. [FolderListingView.tsx](../../../apps/web/src/features/local-folders/components/listing/FolderListingView.tsx)는 필터 결과·상태·빈 결과를 표시한다. [FileSelectionToolbar.tsx](../../../apps/web/src/features/local-folders/components/listing/FileSelectionToolbar.tsx)와 기존 선택 CSS는 보이는/숨겨진 선택 수를 표현한다. [SourceFolderBrowser.tsx](../../../apps/web/src/features/local-folders/components/listing/SourceFolderBrowser.tsx)는 store 콜백만 연결한다.
6. [브라우저 검사](../../../tests/browser/check-file-name-search.mjs): 실제 화면/store/session을 통한 연결 흐름과 금지 부작용 확인. 테스트 코드는 제품 소스 밖에 둔다.

기존 버튼·토큰·세션·선택 상태를 재사용했다. 별도 서버/API·복제 목록·새 의존성·lockfile 변경·`any`를 추가하지 않았다. 문서 변경은 명세, DESIGN, 로드맵, 코드 지도, 기능/테스트 안내와 이 검증 기록이다. 첫 커밋 전 untracked 파일 전체를 이번 변경으로 세지 않는다.

## 실행 증거

- `pnpm check`: **154개 / 14파일 통과**. 타입 검사, ESLint, 서버 경계21개, 웹 import25개/domain6개·배치3개와 실제 domain import 검사, production **43페이지** 빌드 통과. 프로젝트 Node24.22.1/pnpm12.15.0/Next16.4.3.
- 이후 stale 목록 테스트를 보강해 기존 선택이 있어도 계획 열기가 차단됨을 실제 plan controller로 확인했다. 관련 11개 재실행 통과. 이 보강 뒤 제품 코드는 바꾸지 않았다.
- [검색 최종38](final/checks.json), [기존 계획32](plan-regression/checks.json), [선택/팝업39](selection-regression/checks.json), [폴더 목록46](listing-regression/browser-checks.json), [본문 미리보기53](preview-regression/checks.json): 합계 **208개 확인·측정 기록, 실패0**. 독립 시나리오 수나 테스트 데이터 파일 수와 구분한다. 이전 기능의 연결/로그인 회귀 결과를 이번에 재실행한 것처럼 합산하지 않았다.
- 검색·선택만 수행한 구간에서 폴더 열거·권한 요청·본문 읽기·제품 쓰기 증가0. 전체 검색 검사에서 sentinel 이름/size/mtime/SHA-256 동일, 제품 쓰기0, 외부 요청0, console error0. 이후 미리보기 단계는 실제 본문 읽기를 수행하므로 전체 검사 본문 읽기0으로 보고하지 않는다.
- 실제 UI/store/session/IndexedDB/Web Locks/OPFS를 사용했다. picker/권한/읽기 오류와 한국어 조합은 합성 fixture/CDP로 제어했다. 실제 OS 폴더 선택창·OS IME·기기 권한과 실제 사용자 데이터는 검증하지 않았다.
- 자료는 고정 합성 core와 100/1,000/1,001개 결정적 번호 파일이다(난수 seed 없음). Unicode/대괄호 사례는 단위 테스트와 같은 범주의 교차 계층 회귀이며 독립 holdout이 아니다. 최초 browser 원자료의 `holdout` 명칭을 바로잡고 최종 검사에서 `cross-layer regression`으로 기록했다. 탐색 상한 밖 파일 검색은 0건과 일부 목록 안내를 함께 확인했다.
- 단위 test와 browser fixture의 실제 실패 경로를 확인했으나 이번 검색 기능의 별도 mutation test나 외부 데이터셋 평가는 수행하지 않았다.

## 화면 검토와 성능

기존 achromatic-ledger·팔레트·서체와 공통 UI를 유지했다. 390/768/1440/1920px 검색/선택과 390px 빈 결과·긴 파일명·부분 목록·읽기 오류 **8개 캡처를 직접 확인**했다. 가로 넘침/상호작용 중첩 없음, 검색 입력44px, 초점 복귀와 결과 수 live region을 확인했다. [원자료 캡처](browser/filtered-selection-1440.png), [좁은 화면](browser/filtered-selection-390.png).

taste source lint는 4파일 **0 FAIL/0 WARN**. rendered probe는 **0 FAIL, 2 WARN**이다. 두 `hero-void` 경고는 검색 결과 한 건을 표시한 1440/1920px 화면의 작업 면 아래 여백이다. 작업 면은 내용 높이로 끝나며 고정 높이 빈 카드가 아니다. 검색 결과를 장식/합성 항목으로 채우거나 화면을 일괄 확장하지 않는 판단을 유지했다. 다른 6개 상태에는 경고가 없었다. 전체 접근성 인증이나 장시간 읽기 편안함을 자동 통과로 주장하지 않는다.

[성능 기록](performance.md)은 이전 기능의 최종 기준선과 이번 6경로×3회×2폭을 비교한다. 새 검색 동작 비용과 기존 선택 비용을 별도로 기록했다. 동일 기능의 최적화나 실사용 INP 결과가 아니다.

## 확인 중 정리한 사항과 다음 단위

보조 조사 중 중복 FILTER 명세/테스트가 끼어들어 한 차례 전체 검사가 실패했다. 보조 작업의 소유를 확인하고 중복 파일/테스트를 제거한 뒤 현재 SEARCH 계약 하나로 전체 검사를 다시 통과했다. 사용자 파일을 추정해 삭제하지 않았다.

다음 후보는 계획 검토에서 **연결 폴더 안의 목적지를 탐색해 선택**하는 기능이다. 목적지 수명·읽기 취소·권한/부분 목록 계약부터 정의하고 기존 계획 입력에 연결한다. 로그인·실제 원본 쓰기·인증/AI 제공자 선정은 별도 범위다. [진행 기준](../../roadmap.md).
