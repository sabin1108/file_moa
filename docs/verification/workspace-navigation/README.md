# 공통 탐색·직접 연결·빠른 전환·샘플 확장

2026-11-07, 최종 production 빌드 `P35v69WziYQC9Sgl0-w1u`. 로컬 `http://127.0.0.1:3034/demo`. 사용자 요청은 같은 대화/파일 구성,3개 메뉴, 빈 패널 축소, 직접 폴더 연결, 제목 테두리 수정, 현실적인 자료 확장이다. 명세 [WN-001~007](../../specs/workspace-navigation.md)와 기존 연결/가상 상태 회귀를 기준으로 구현했다.

## 결과와 읽기 순서

1. `shared/workspace-navigation.ts` → `WorkspaceSidebar.tsx` → `WorkspaceShell.tsx`/`FolderWorkspaceFrame.tsx`: 폴더·채팅·설정 라벨/경로와240px sidebar를 공유한다. 시안 보관함의 과거 화면까지 다시 디자인한 것은 아니다.
2. `WorkspaceFolderTree.tsx` → 실제 `SourceFolderTree.tsx`/샘플 `SampleFolderTree.tsx`: 표시와 연결을 분리했다. 실제 트리는 현재/방문 경로와 직계 자식만 사용한다. 새로운 전체 재귀 스캔이나 본문 읽기를 하지 않는다. 확장 상태를 경로마다 key로 재마운트하던 초기 구현은 제거했다. 페이지 전체 재진입의 트리 확장 상태 영속화는 하지 않는다.
3. `ConversationWorkspace.tsx` → `LiveConversation.tsx`/`SampleConversation.tsx`: 대화/입력 DOM은 유지하고 자료 창만 연다. 기본 오른쪽 빈 열이 없으며, 모바일은 modal이고 데스크톱은 대화와 비교 가능한 nonmodal이다. 명시 닫기·Escape·초점 복귀를 제공한다. 실제 미연결 상태는 작은 직접 연결 버튼을 사용한다.
4. `SourceConnectionControl.tsx` → 기존 Provider/controller: 클릭 안에서 읽기 선택기를 바로 호출한다. 취소/실패는 버튼, 성공은 보이는 폴더 루트/모바일 제목으로 초점을 옮긴다. 목록 읽기 중 루트는 초점을 받되 이동은 막는다. 보관함 제목은 자동 초점 때 전체 폭 파란 outline을 없애고 키보드 초점에는 밑줄을 사용한다. 일반 입력/버튼의 focus 표시를 없애지 않는다.
5. `quick-switch/lib` → `store/quick-preferences.ts` → `WorkspaceQuickSwitch.tsx`/`QuickSwitchSettings.tsx`: 중앙 닫기·원형3개 메뉴·이동하는 활성 표시. 기본 빈 배경 왼쪽500ms/8px, Alt+Q, 설정에서 호출 방식/허용 단축키 변경. 입력·글자·선택·파일650ms hold·modal을 제외한다. 화면 가장자리 보정, 명시 클릭/키 실행, Esc/외부/blur/scroll 취소, reduced-motion을 지원한다. 포인터를 떼기만 해서는 이동하지 않는다. data-active는 시각 선택, aria-current=page는 실제 경로다.
6. `sample-catalog.ts` → `business-documents.json` → `organization-candidates.ts`: 공개84개(MD43/TXT31/PDF1/XLSX9). 새42개 본문과 실제8개 XLSX는 기업/학교·논문/통계/매출/방문/개인 학습/개발/운영의 원본 합성 자료다. 개인 자료·실제 기관 문서·평가 holdout을 가져오지 않았다. 엑셀은 수식과 재계산 캐시를 보존한다.

내용 후보 검색은 사용자가 선택한 전체/선택/현재 폴더 범위에서 최대40개와 약6000문자(JSON/경로 여유 포함)로 입력을 줄인다. 날짜 표현은 검색 가중치일 뿐 최종 날짜/관련성 판정은 모델과 서버 근거 검사에 남아 있다. 이번 분석 개수를 표시하고 폴더를 좁히도록 안내한다. 모든84개를 모델이 읽었다고 표시하지 않는다. 서버 countTokens8192와 세션/동의/Origin/등록 ID/공통 원자 한도는 그대로다.

## 신선한 검증

- 단위: **798개 /88파일**. 후보 상한·본문 우선·위조 설정·키 조합/IME·포인터 경계·공통 트리 접두어·기존 보고서6/성능5 후보 유지 포함. 이것은 새로운 모델 정확도 평가가 아니다.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`(52경로), 서버 경계21·구조25/6/3, `git diff --check` 통과. 새 앱 의존성 없음.
- [빠른 메뉴36검사](browser-checks.json): 실제 CDP 마우스/키,4폭390/768/1440/1920,500ms/이동/짧은 클릭/blur, 편집 중 단축키 제외, 설정 변경 후 reload, 파일650ms 선택, reduced-motion, drawer4폭 Escape와 트리거 초점 복귀.
- [직접 연결7검사](direct-connection-checks.json): 실제 Provider·LiveConversation·Settings를 격리 harness에서 렌더링하고 합성 owner/Chromium OPFS로 취소·성공·읽기권한·사용자 제스처·초점·보관함 제목을 확인했다. Next 라우팅만 shim이며, 실제 인증된 경로/물리 디스크 검증이라고 보고하지 않는다. 제품 원본 쓰기와 본문 읽기0.
- 기존 대화17검사(입력/초안/10회 자료 창 전환/합성 IME/Shift Enter/동의/샘플 격리), 파일39검사(목적지/미리보기/적용/되돌림/복원), 기록된 계획4폭 replay 통과. 현재 결과는 `../conversation-organization/browser-checks.json`, `../conversation-organization/files/checks.json`, `../conversation-organization/plan-replay-checks.json`와 해당 스크립트 출력 참조. 과거 실제 모델 결과 JSON은 당시 빌드/범위를 유지한다.
- `verify-business-samples.py`:50개 fixture 해시,8개 XLSX 수식·캐시·합계·원본/미리보기 셀 일치. artifact-tool로 작성 후 독립 openpyxl 읽기로 검사했다. 두 엑셀 렌더와4폭 메뉴/자료/파일 화면을 육안 확인했다.
- 공개 정적41개 JS/CSS/map에 로컬 Gemini/인증 secret 값이 포함되지 않음을 확인했다. 값은 출력/기록하지 않았다.

## 발견과 수정

- 모바일 상단 추가 버튼으로390px에서 약9px overflow → 작은 화면에서 빠른 메뉴는 이름 있는 아이콘 버튼으로 축소, 제목 줄바꿈 방지 →4폭 재검증 통과.
- 직접 연결 성공 직후 목록 로딩의 disabled 루트 때문에 초점 상실 → 루트 초점은 허용하고 클릭 이동은 차단 → 실제 컴포넌트 회귀 통과.
- 새 후보 예산으로 날짜 보고서가 빠짐 → 일반 명령어 가중치 제거·명시한 월의 본문 표기 가중치, 최종 날짜 필터 아님 → 기존 보고서6/성능5 후보 보존 회귀 통과.
- 별도 architect가 데스크톱 nonmodal Escape 미처리와 시각 활성=aria-current 오용을 재현 → 직접 Escape 처리와 실제 경로 의미 분리 →4폭 재검증36통과.

## 한계와 남은 별도 검사

이번 변경은 로컬 구현이며 외부 배포/커밋/push와 새 Gemini 요청을 실행하지 않았다. 실제 개인 자료 AI와 일반 PDF/XLSX 업로드 파서는 여전히 후속이다. 샘플 자료의 대표 기대값은 사용자 검토 전이고 실제 확대 자료의 모델 정확도도 새로 측정하지 않았다. 검색 후보에서 제외된 자료의 누락 가능성은 남아 있다.

물리 Windows 파일 선택기·실제 계정의 디스크 연결·물리 한국어 IME·OS 단축키 충돌·실사용 INP는 미검증이다. 이전 S0 단독 모듈 smoke는 현재 session 의존성에 대한 probe의 `../lib/folder-path` 매핑 부재404로 실패했다. 이 선택 검사를 통과로 보고하지 않으며 제품의 타입/단위/경계/빌드·실제 컴포넌트 연결 검사와 구분한다. 제품 권한이나 인증을 완화해 우회하지 않았다.

성능은 [별도 로컬 측정](performance.md)을 참조한다. 녹화 영상은8.335964초의 제공 로컬 파일을 HTML5로12프레임 확인했고, 원본 영상/추출 이미지는 공개 앱 자산에 포함하지 않았다. URL 동영상 재생 성공을 주장하지 않는다.
