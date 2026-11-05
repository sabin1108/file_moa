# 최신 인수인계 — 2026-10-28 파일 목록 UI 단위 마무리

사용자가 memory 복원과 작업 계속을 요청해 27일의 중간 저장에서 이어서 마무리했다. 이 절이 아래의 ‘목록 UI 최종 마무리 남음’ 기록보다 우선한다. 다음 기능을 자동 시작하지 않는다.

## 완료 결과와 읽을 순서

1. `E:/project/ai_folder_project/docs/verification/source-folder-browser/README.md`: 이번 변경, 파일/줄별 코드 해설, 호출 흐름, 실행 근거와 한계를 담은 최종 검토 문서.
2. `docs/specs/source-folder-listing.md`: LIST/LIST-UI 계약. 목록 controller가 권한 오류와 연결 상태를 게시하는 현재 구현으로 설명을 갱신했다.
3. `FolderListingView.tsx`, `source-folder-browser.module.css`: ul/ol 기본 margin/padding 제거, 루트의 중복 breadcrumb 생략. 실제 목록·하위/상위 탐색·갱신·취소·재시도 기능은 유지한다.
4. `scripts/check-source-folder-browser.mjs`: 좌표/computed style·루트/하위 경로 검증 추가. `check-settings-folder-connection.mjs`: 접힌 연결 관리 열기, read 권한 조회와 request/picker/IDB 재복원 구분. `check-live-screens.mjs`: 실제 탐색 영역을 기다림. `measure-settings-performance.mjs`: 390px 별도 출력 지원.
5. DESIGN.md, live-workspace/연결 명세, docs/project-stack-and-security.md 현재 상태 갱신. 바탕화면 기술 요약 사본은 27일 스냅샷이며 이번에 동기화하지 않았다.

## 이번 실행 증거

- `pnpm check`: 타입(web/domain/S0), lint, 단위 88개/8파일, 서버 경계21개, production build43페이지 통과.
- `docs/verification/source-folder-browser/final-20261028/`: 목록 browser-checks.json 46개/실패0, connection-regression/browser-checks.json 51개/실패0(기능49+측정2), live-regression/screen-checks.json 69개/실패0. 166은 독립 테스트 케이스 수가 아니라 확인/측정 기록 합계다.
- 실제 UI/controller/session/IDB/Web Locks/OPFS, 합성 picker/권한/실패. sentinel hash/path/size/mtime 동일, 제품 본문 읽기/쓰기0·외부 전송 없음. 개인 원본은 사용하지 않았다.
- 연결 390/768/1440/1920, 하위/빈 폴더/읽기 오류/갱신/권한 총9캡처 직접 확인. 목록 앱 probe/judge 0 FAIL/0 WARN, 표시 소스 taste lint 0 FAIL/0 WARN. 기존 미구현/미연결 화면 여백 FAIL/WARN은 남아 전체 사이트 시각 통과로 부르지 않는다.
- 연결 회귀 첫 실행은 JSON/오류 로그 없이 exit1. 재실행은 같은 코드로51개 통과와 exit0. 최초 종료 원인은 미확정.
- `final-20261028/performance.md`: desktop6경로×3회, 390px6경로×3회. 기존 기준선 보존. 전체 staticBytes744911→771920(+27009bytes). 이전 Chrome155, 현재156으로 엄밀한 동일 환경 회귀 비교가 아님. `/` desktop LCP128–2376ms 변동으로 무회귀/최적화 성공 판정 보류. 390px는 실제 모바일 장치가 아닌 desktop viewport다. TBT/field INP/서버 부하 미측정.
- 목록100/1000/1001 각3회는 CDP조작+열거+렌더+polling이며 현장 INP가 아니다. 네이티브 OS 선택창/실제 디스크 권한/실제 계정/완전 재시작/스크린리더 인증은 미검증. 실제 입력창이 없어 OS IME는 해당 없음.

## 사용자 강조 기준과 실제 적용

- SDD 명세→실패 테스트→구현→검증→코드 해설 흐름 유지. 27일의12개 미구현 실패→구현 기록과 이번88개 재검증을 구분한다. CSS/문구 단위 테스트를 양산하지 않고 실제 브라우저 좌표·상태·키보드로 검증했다.
- 표시 컴포넌트는 값/콜백, 목록 controller는 요청·취소·오래된 결과, 연결 controller/session은 연결/소유자 수명, reader는 읽기 경계다. 원본 보호와 책임 분리를 실제 파일·호출 순서로 설명했다.
- 승인된 채팅·팔레트·토큰을 유지하며 작은 UI 단위에서 마감했다. 새 의존성/lockfile 변경 없음. 성능을 점수나 성공 여부로 뭉뚱그리지 않고 원자료·조건 차이·한계를 기록했다.

## 다음 세션

현재 UI 단위는 완료·코드 검토 대기다. 다음 후보는 MD/TXT 본문 미리보기이며 사용자의 다음 지시 후 별도 명세·실패 테스트부터 시작한다. 이동/복사/분류·실제 로그인·AI로 자동 확장하지 않는다. 원본 쓰기 권한을 얻은 것으로 간주하지 않는다.

마지막 production URL: http://127.0.0.1:3002/files. 서버 재시작 세션25887; 다음 세션에서 생존과 최신 빌드를 확인한다. origin이 바뀌면 IndexedDB 저장소도 달라진다. Git 첫 커밋 전/untracked 상태를 이번 신규 변경 전체로 오인하지 않는다. 현재 성능 비교의 브라우저 차이를 숨기거나 미구현 기능을 완료로 표현하지 않는다.

---

