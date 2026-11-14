# local-folders — 자료 폴더 기능

2026-11-13: 기능을 먼저 고르고 화면 조립에서 작은 책임으로 내려간다. 기존 연결·검사·실행·복구 동작과 Provider 수명은 유지한다. 실제 파일/폴더 복사·이동·앱 휴지통·복원·인라인 편집/저장이 연결되어 있으며, 예전 읽기 전용 시안 설명을 현재 기능으로 해석하지 않는다.

| 먼저 읽을 위치 | 맡은 책임 |
| --- | --- |
| SourceFolderProvider.tsx → use-source-folder-connection.ts | 공유 session·controller 생성, owner 전환과 종료 |
| SourceFolderBrowser.tsx | 파일 작업 화면과 기능별 조작 조립 |
| connection-session.ts | 소유자·권한·요청 세대 검증과 각 파일 작업 연결 |
| connection/ | 폴더 선택·재연결·해제, 핸들 저장, 권한 안내 |
| browsing/ | 목록·선택·이름 필터·방문 기록·폴더 프레임 |
| documents/ | 공통 문서 작업면, preview·inline-editor·본문 찾기 |
| content/ | 파일 읽기·해시 Worker, PDF·OCR, 로컬 텍스트 색인 |
| operations/ | 변경 계획·복사 검사·실행·보존·앱 휴지통 |
| recovery/ | 보관함 연결·목록·복구 사본·덮어쓰기·복원 |
| organization/ | 범위·자료 준비·질문·동의·정리 제안 |
| destination-picker/ + creation/ | 여러 작업이 공유하는 목적지 탐색과 새 항목 생성 |
| search/ + history/ + workflow/ | 검색·과거 작업 읽기·작업 단계와 공통 상태 |

설정에서 연결하면 화면 → connection controller → session → 브라우저 권한/picker·repository → 반환 상태 → 구독된 화면 순서로 이어진다. 목록과 문서는 SourceFolderBrowser → 해당 controller → session → reader/Worker → 값과 상태 → 화면으로 돌아온다. 선택 조작만으로 파일 본문을 전송하지 않는다.

복사·이동·복구는 계획 검토와 권한·버전/hash 재검사를 거쳐 기존 실행 경로를 호출한다. 화면은 DOM 초점과 표시, controller는 상태와 취소, session과 개별 서비스는 파일 접근을 맡는다. 중앙 session의 내부 로직을 이번 이동에서 재작성하지 않았다.

[전체 소스 지도](../../../../../docs/code-map.md), [사용자 행동으로 읽는 코드](../../../../../docs/코드_이해하기.md), [기능 테스트](../../../tests/local-folders)를 함께 읽는다. 테스트는 제품 소스 밖에 두며 실제 개인 폴더와 합성 fixture를 구분한다.
