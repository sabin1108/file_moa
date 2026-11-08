# 트리·방향 해제·단축키·설정 전환 후속

2026-11-07. 사용자 제공 실제 트리 스크린샷과 조작 정정에 맞춘 WN-008~012 구현이다. 기본 빠른 메뉴 목적지3개와 원본/샘플 격리는 유지했다. 이전 명시 재클릭·고정3개 단축키·상단 설정은 최신 요청으로 변경했다.

## 변경과 근거

- `workspace-folder-nodes.ts`는 경로 문자열 전체 비교 대신 경로 조각을 비교한다. 회귀에서 A/A-2/A.B/하위가 섞이는 실패를 재현한 뒤 부모 아래에 전체 하위가 모이도록 수정했다. `WorkspaceFolderTree`는 중첩UL, 고정22px 펼침 열, 왼쪽 정렬·수축하지 않는 아이콘·연결선을 공유한다. 입력 길이로 아이콘 위치가 변하지 않는다. 바쁜 행은 aria-disabled+클릭 가드로 초점을 유지한다.
- `SourceFolderTree`는 `/files`에서 기존 navigation/history, 채팅·설정에서는 기존 guarded listing.open을 사용한다. 실제 컴포넌트 심화 검증 중 채팅의 폴더 열기가 파일 화면 전용 port 때문에 no-op인 문제를 찾아 수정했다. LiveConversation의 자료 창 행도 같은 읽기 controller를 사용한다. 핸들/원본 권한·전체 스캔·본문 전송을 추가하지 않았다.
- `WorkspaceSidebar`는 위쪽 폴더/채팅과 하단 설정→계정 순서다. 실제/샘플 모두 동일하고 모바일/원형 메뉴에는3개 목적지가 남는다.
- `use-quick-switch.ts`가 입력 세션·취소·해제를, `WorkspaceQuickSwitch`가 표시/라우팅을 맡는다.500ms 전8px 이동은 취소, 열린 뒤에는 원 밖에서도 방향을 추적하고 pointerup에1회 이동한다. 최초 누른 곳의 중앙42px은 취소, 메뉴 표시만 가장자리 보정한다. 키 호출도 누른 동안 선택하고 본 키 해제 시 실행한다. 파일650ms 선택·입력/IME·선택 영역·blur/scroll/cancel·trailing click 가드는 유지한다. 보이는 버튼에는 클릭/Enter 대체 조작이 남는다.
- `QuickSwitchSettings`는 readOnly 입력에 실제 키 조합을 기록한다. 기존 Alt+Q 등 저장 값은 호환되고 문자/숫자/기능키/CapsLock·modifier 조합을 검증한다. 조합키만/IME/repeat/지원하지 않는 키는 저장하지 않고 Escape로 기록을 취소한다. 브라우저/OS가 선점하는 조합을 앱이 보장하지 않는 안내를 제공한다.
- `SettingsTabs`는 모든 받은 패널 DOM을 유지하고 탭 표시만 native history+useSearchParams로 전환한다. 링크 prefetch도 껐다. URL 자체가 느린 것이 아니라 이전 router.push가 매번 RSC/page guard를 수행하던 구조를 바꾼 것이다. 계정 두 조회는 첫 진입에 병렬 수행한다. 인증/Action별 권한 검사는 그대로이며 실제 계정 데이터의 신선한 조회는 첫 진입/새로고침/기존 mutation 후 refresh에서 수행한다. 숨은 폴더 패널에도 기존 복구 존재 확인/로컬 구독은 유지되지만 picker나 쓰기는 실행하지 않는다.
- `LoadingOverlay`는 기존 PageLoading/MoaLoader를 재사용한 중앙 상태 면과 dim 배경이다. Link 이동과 quick-switch의 router 이동에 적용했다. 즉시 끝나는 로컬 탭에 인위적인 지연은 넣지 않았다.

공식 근거: [Next native History API](https://nextjs.org/docs/app/getting-started/linking-and-navigating#native-history-api), [useSearchParams](https://nextjs.org/docs/app/api-reference/functions/use-search-params). query 표시만 client가 소유하고 서버 인증/DTO/쓰기 계약을 옮기지 않았다. F5 자체의 서버 인증이 없어지는 것은 아니다.

## 검증 범위

- 단위801개/88파일. 새 트리 정렬 실패와 방향/실제 키 입력 회귀를 포함한다. 타입·린트·서버 경계21/구조25·6·3·빌드52경로 통과.
- `browser-checks.json`: 원 밖 방향→추가 클릭 없는 이동·중앙취소·가장자리 무이동 취소·키 해제 이동·직접키기록/reload·기존 파일 hold·4폭/Escape/초점/reduced-motion/샘플 격리.
- `settings-loading-checks.json`: 실제 Next 샘플 route의 공통 SettingsTabs12전환, 탭으로 인한 RSC/POST0, back/forward/F5/DOM 유지, 임의Ctrl+Alt+J 기록/Escape취소,4폭. 로컬 RSC를 의도적으로 지연한 실제 Link 이동의 중앙 dim 표시/완료 제거를 확인했다. 샘플 계정으로 정식 인증/DB 성능을 측정했다고 보고하지 않는다.
- `direct-connection-checks.json`: 실제 Provider/LiveConversation/Settings와 합성owner·OPFS/Next 라우팅 shim. 직접 연결/취소/읽기 사용자제스처/3단계 폴더 탐색/동일 깊이 정렬/하단설정/보관함focus를 확인했다. 실제 Windows 디스크가 아닌 격리 검증이다.
- 기존 대화17·파일39검사는 유지됐고 실제 Gemini 호출/개인 파일 열람·전송/원본 쓰기는 이번에 실행하지 않았다. 공개41개 정적 파일에 로컬 Gemini/인증 secret 값이 없음을 검사했다. 새 의존성/결제 변경/운영 배포 없음.

architect는 숨은 패널 효과와 기존 권한 경계까지 읽고 CLEAR로 판단했다. 실제 Windows 선택기·물리IME·OS가 선점하는 키 조합·실제 계정의 DB 지역 지연·실사용 INP는 미검증이다. 기존 S0 단독 probe 매핑404는 별도 과거 한계이며 이번 검사를 통과했다고 바꾸지 않았다. 최종 빌드와 로컬 성능은 performance.md에 기록한다.
