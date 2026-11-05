# 최종 시안 적용·새 폴더 생성 작업 상태

후속 정정: 별도 기록 폴더 지정과 폴더만 생성 범위는 [현재 위치의 폴더·TXT·MD 생성](../current-folder-creation/README.md)이 대체한다. 아래는 개정 전 검증 스냅샷이다.

2026-10-30. 구현·코드 검사·최종 브라우저 회귀를 완료했다. 한때 자동 승인 검토 서비스 사용량 한도로 실행이 보류되었으나 안내된 갱신 시각 뒤 정상 승인되어 재개했다. 초기 증거와 최종 증거를 아래에서 구분한다.

## 사용자 요청 반영

- `최종안_시안.zip`을 기준으로 /files를 경로·상위 폴더 열·현재 목록·미리보기 구성으로 교체. 모바일은 목록을 유지하는 native dialog 하단 미리보기. 제품에는 예시 즐겨찾기/파일/숫자를 넣지 않았다.
- 파일 `선택`은 테두리 있는 버튼, checkbox, 개수, `선택됨` 텍스트로 표시한다. `선택 취소`는 숨은 검색 선택까지 비운다. 목적지 취소는 `목적지 탐색 취소`로 구분한다.
- 도착 위치에 실제 이름/경로를 표시한다. 새로고침은 44px 고정 조작과 제자리 상태 표시를 유지한다.
- 목록/목적지에서 실제 새 폴더 생성. 이름/경로 검증, 클릭에 이어 readwrite 권한, 이름 충돌, 앱 내부 lock, 소유자·자료/기록 연결 세대, 부모·결과 핸들 동일성 확인.
- 작업 기록 폴더를 명시적으로 선택한다. pending 기록을 디스크에 쓰고 재읽어 확인한 뒤 생성한다. 상태별 JSON을 보관한다. 기록 실패/불명확 결과에 자동 재생성·삭제·롤백을 하지 않는다.
- 과거 로그와 memory를 읽고 [59개 요구사항 문서](../../reports/사용자_개발_요구사항_정리_2026-10-30.md)를 작성했다. `C:\Users\sabin\Desktop\사용자_개발_요구사항_정리_2026-10-30.md` 복사 및 SHA-256 일치 확인 완료.

## 코드 리뷰 순서

1. [명세](../../specs/folder-workspace-revision.md), DESIGN.md 최신 절.
2. `components/listing/FolderWorkspaceFrame.tsx` / `folder-workspace.module.css`: 화면 배치·범위 한정 토큰.
3. `store/folder-trail-controller.ts`: 기존 방문 목록 재사용, 연결 세대/40개 한도.
4. `components/preview/FilePreviewPane.tsx`: 데스크톱 열/모바일 native dialog.
5. `store/source-listing-controller.ts`의 cancelSelection과 행/선택 toolbar.
6. `components/listing/NewFolderForm.tsx` → `store/folder-creation-controller.ts` → `services/connection-session.ts` → `services/create-folder.ts` → `services/folder-creation-journal.ts`.

실제 파일 접근과 기록은 service, 요청 결과는 controller, React 연결과 공유 기록 폴더 표시는 hook, 입력·배치는 component가 맡는다. 추가 패키지는 없다. 기존 테스트는 src 밖에 유지한다.

## 실행한 검증

- 생성 서비스 미구현 import 실패 → 구현 → 권한 거부/이름 충돌/intent 실패/미확인 결과/완료 기록 실패/entry 교체/terminal 중복 방지 테스트.
- 초기 화면 빌드에서 브라우저22개 확인 통과 후, 최종 빌드의 [폴더 화면23개 확인](browser/result.json)을 실행했다: 실제 Chromium/OPFS 폴더와 JSON 기록, 생성 위치 선택, 이름 충돌·권한 거부·원본 sentinel 보존, 선택 취소, desktop 동시 목록/미리보기, mobile native modal, Escape, 새로고침 행 위치, 여러 생성 폼의 기록 폴더 공유.
- 초기 캡처 `browser/*.png` 직접 확인 후, CSS 토큰 우선순위와 1920px 열 너비를 보완했다. 이어 기록 폴더 변경 경쟁·결과 핸들 교체·완료 기록 후 연결 변경·기록 재읽기·여러 폼의 기록 폴더 표시 공유를 보완했다.
- 보완 후 pnpm check: **220개/23파일**, 타입·린트, 서버 경계21, 웹 구조25/domain6/배치3, 43페이지 production build 통과.
- 최종 브라우저: 폴더23 + 탐색/history/IME23 + 목적지29 + 복사 검사27 = **102개 확인 항목 통과**, 실패0. 독립 사용자 시나리오 수로 세지 않는다. 각각 browser, navigation, destination, copy-inspection에 원자료를 보관한다.
- 최종 PNG 390/768/1440/1920을 직접 확인했다. 모바일/태블릿 edge-text FAIL을 수정하고 재실행했다. 최종 probe FAIL0. 데스크톱 미선택 미리보기의 빈 면과 modal 뒤 배경에 hero-void/unused-canvas WARN은 남는다. 이는 미리보기 대기 영역이며 가짜 자료로 채우지 않았다. 소스 taste lint15파일 FAIL0, 선택 행의 inset 상태 선에 shadow WARN1. 일반 장식 그림자가 아니라 색 이외 선택 표시다.
- 최신 바탕화면 문서와 저장소 문서 SHA-256: `39C6216ACDD1D8D58763F327AE17872945F176CE5ABC419EB210D376EABD75CB`. 마지막 memory 저장 요청을 문서에 추가한 뒤 재복사·일치 검증했다.

## 검증 진행 중 발생한 제한과 해소

자동 승인 검토 요청이 “usage limit … try again at 8:52 PM … review failure, not unsafe determination”로 거절되어 당시 명령 자체가 실행되지 않았다. 승인 검토를 우회하지 않았고, 21시 이후 다시 요청해 정상 승인된 격리 브라우저 검증을 완료했다.

[성능 비교](performance.md)는 6경로×2폭×3회와 전체 배포 자산을 구분한다. 브라우저 회귀를 병렬 실행한 검사 소요 시간은 최적화 전후 비교로 사용하지 않는다.

OS 선택창·실제 사용자 디스크 권한/물리 입력·실기기는 미검증이다. OPFS 파일 생성은 브라우저 실제 파일 API를 통과하지만 사용자 디스크의 OS 대화상자까지 인증하지 않는다. 코드에 실제 디스크 adapter는 연결되어 있다.

## 현재 한계

파일 이동/복사/분류 실행, 로그인, AI, 업로드는 미구현이다. 복사 전 검사는 읽기 검사다. 원본 파일을 수정/삭제하지 않는다. 새 폴더와 지정 기록 폴더의 새 JSON만 쓴다. 외부 앱의 동시 생성까지 배제하는 원자적 no-clobber는 보장하지 않는다. pending만 남으면 결과 미확인으로 취급하고 실제 폴더/기록을 확인한다. 브라우저 자동 복구 UI는 추가하지 않았다.
