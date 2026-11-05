# 2026-10-28 추가 요구와 적용 — 원문 미리보기·구조·웹표준

사용자는 중단된 구현을 이어서 진행하되 “유지보수성과 재사용성이 높아야 한다”, “구조로 해결될 것을 소스코드로 해결하지 말라”고 강조했다. 코드를 검토할 위치를 찾기 어렵다는 문제와 함께 주석, main.tsx/App.tsx에 대응하는 실행 흐름, 웹표준과 의미 있는 태그/속성, 보안 문제 수정, pnpm 선택 이유를 요청했다. 임의의 줄 수 기준 분할이나 모든 div 제거를 뜻하는 것으로 해석하지 않았다.

## 요청을 어떻게 반영했나

- SDD: docs/specs/source-file-preview.md에 입력·실패·권한·원본 보호·닫기/취소 수명·표시 계약을 명시했다. TDD: reader13개와 controller10개의 미구현 실패를 기록한 뒤 구현했다. 이후 실제 브라우저에서 취소 초점 실패를 먼저 재현해 수정했다. 계획된 테스트와 실행한 테스트를 구분했다.
- 구조: Provider/hook은 수명과 React 연결, UI는 표시/초점, controller는 상태, session은 소유자·연결/요청 세대, reader는 브라우저 접근, domain은 파일 규칙을 맡긴다. 목록과 본문이 서로의 요청을 취소하지 않도록 독립 순번을 사용하되 연결 해제/교체는 공통 경계를 따른다.
- 재사용: 기존 버튼·상태 안내·토큰·경로검증·domain 상한을 사용했다. 새 의존성을 넣지 않았고 사용 근거 없는 공통 계층을 만들지 않았다.
- 주석과 코드 찾기: 새 핵심 코드에 책임/경로 복사/취소 한계/HTML 비실행/DOM 보존 이유를 적었다. docs/code-map.md에 실제 파일 링크·7단계 리뷰 순서·진입과 한 번의 파일 클릭 흐름·상태 소유 표·pnpm 근거를 작성했다. README와 architecture/DESIGN에서 연결했다.
- 구조도: docs/diagrams/local-files.html. 현재 Next App Router의 layout/page→Provider→화면→controller→session→reader를 그렸다. 향후 서버/DB 아키텍처를 현재 구현으로 오인하지 않도록 구분했다. artifact9검사 오류0/경고0, 실제 브라우저 검증 및 두 테마 캡처 검토. Viewer UI/lang은 영어, 설명은 한국어다.
- 웹표준: p의 콘텐츠 모델과 상호작용 중첩을 구분했다. p 안의 div는 부적합하지만 button은 phrasing content라 무조건 금지되지 않는다. 실제 Lighthouse가 찾은 h1→h3 건너뛰기는 summary의 실제 구획명을 h2로 삼아 구조적으로 수정했다. DOM·키보드 검사와 소스 점검을 함께 수행했다.
- pnpm: workspace의 web/domain 연결, workspace:* 계약, 정확한 버전/lockfile/Node 런타임, filter/재귀 스크립트 실행이 실제 근거다. npm에서도 가능한 점과 미측정 설치속도/용량 이점을 구분했다. 공식 문서 링크와 실제 설정 파일을 코드 안내에 넣었다.
- 보안: 읽기 권한·상한·UTF-8 확인, create:false, 오래된 성공/오류 차단, React 텍스트 출력, 본문 영구 저장/전송/원본 쓰기 금지. 합성 OPFS만 검사하고 개인 파일을 사용하지 않았다.

## 결과와 다음 읽을 위치

`E:/project/ai_folder_project/docs/verification/source-file-preview/README.md`가 최신 구현/검증 보고서다. pnpm check: 단위111/10파일, 경계21, 타입/lint/build43 통과. 브라우저53+46+51+69=219 확인·측정 기록, 실패0. Lighthouse desktop/mobile 접근성100, 성능100/98이며 단일 미연결 초기 화면 기준이다. 실제 OS 권한창·로그인·스크린리더·디스크 경쟁·field INP 인증이 아니다. 성능 원자료와 최종 해석은 같은 폴더의 performance.md를 본다.

최신 production URL은 http://127.0.0.1:3004/files, 서버 생존은 다음 세션에 확인한다. origin이 달라지면 IndexedDB도 다르다. 미리보기는 원문 보기이며 Markdown HTML 렌더링/쓰기/업로드/색인은 미구현이다. 기존 미구현 화면의 여백 경고를 이번 기능 실패와 구분했고 전체 제품·디자인 완료를 주장하지 않았다. Git은 첫 커밋 전 untracked 상태이므로 저장소 전체를 이번 변경으로 세지 않는다.

사용자의 지속 기준은 docs/guidelines.md에도 반영했다. 다음 작업은 이 단위의 코드/화면 검토 결과와 새 사용자 지시에 맞춘다.
