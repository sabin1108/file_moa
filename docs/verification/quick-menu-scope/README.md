# 자료 창 전환·공통 퀵메뉴 범위·구현 설명

2026-11-07, WN-013~015. 사용자는 함수/이벤트/콜백/검색 파라미터의 구체적인 구현 설명과 자료 창 애니메이션, 헤더 버튼 제거, 작업 화면 공통 퀵메뉴·공개 화면 제외를 요청했다.

실제 코드와 dependency 배열은 [implementation.md](implementation.md)에 기록했다. 결과 요약만으로 설명을 대체하지 않는다. 이전 설정 탭 fix의 useSearchParams/onNavigate/native history/prefetch/hidden 패널과 이번 useCallback/useEffect/useLayoutEffect/ref/animation.finished의 책임을 나누었다.

- 공통 WorkspaceShell/FolderWorkspaceFrame의 opt-in 표시는 앞으로 같은 프레임을 쓰는 작업 화면에도 적용된다. route6개 배열을 없앴고 공개/인증 화면에는 표시가 없으므로 pointer/key/custom-event로 열리지 않는다. 튜토리얼이 프레임을 재사용할 때는 quickMenu=false로 제외한다. 이것은 UI 범위이며 서버 인증 경계를 대체하지 않는다.
- 헤더 버튼은 두 공통 프레임에서 제거했다. 접근 가능한 명시적 대체 조작은 설정 안의 퀵메뉴 미리보기로 남겼다. 자동 호출 끄기는 마우스/키 호출을 끄는 설정이다.
- 자료 창은 열기와 닫기 모두260ms transform/opacity animation이다. 닫기 완료 전에 dialog를 닫지 않는다. 현재 computed 상태를 저장해 취소/반전하고 generation으로 낡은 완료 callback을 무시한다. 재열기 focus/Escape와 reduced-motion 즉시 전환, 초안/자료 DOM 유지도 확인했다.

## 검증과 발견

- 단위803개/89파일: 미래 작업 프레임 opt-in/튜토리얼 opt-out2개를 추가했고 기존 상태 계약은 유지했다.
- scope-drawer-checks.json: 실제 Next 샘플의 채팅·폴더·설정3화면 hold/키 호출과 헤더 버튼 부재, 설정 미리보기, opening/closing/반전/focus/4폭/reduced-motion. 로그인·가입 안내·비밀번호2경로·시안 보관 화면5개에서 hold/key/event 모두 차단했다. 아직 없는 소개/튜토리얼을 구현한 것처럼 보고하지 않는다.
- loading overlay가 hold 중 또는 해제 전에 나타나는3개 race는 호출·이동을 취소한다. 해제 후2rAF+안정구간을 두어 비동기 navigation 이전의 false-pass를 피했다. 선택 시 중앙 choose guard를 공유해 pointerup/keyup/버튼 모두 같은 정책을 적용한다.
- native open event에서 requestAnimationFrame이 React commit보다 먼저 실행되어 초점을 놓치는 문제가 드러났다. DOM 연결 뒤 useLayoutEffect에서 최초 focus를 수행하도록 고쳤다. callback identity와 DOM commit 시점은 서로 다른 책임이다.
- 닫는 중 재열기 때 dialog가 이미 open이면 기본 show()의 focus가 다시 실행되지 않던 문제를 수정했다. 기존 dialog의 닫기 버튼으로 focus를 돌려 desktop Escape 회귀를 유지했다.
- useDrawerDialog가 외부 ref를 받아 DOM을 변경하는 형태는 React lint immutability 검사에 걸렸다. hook이 useRef를 직접 소유하고 반환하도록 수정했으며 lint 규칙을 끄지 않았다.

최종 빌드 zTqIHw1ImSr-2r0-WJ0Ep에서 범위/자료 창33·탐색42·대화17=92검사,803단위/89파일,타입·린트·서버21/구조25·6·3·빌드52경로·diffcheck 통과,architect CLEAR. [최종 성능](performance.md)은54+6표본이다. 공개정적41개에서 로컬secret값 노출0을 확인했다.

실제 Gemini 요청/개인 디스크 읽기·전송·원본 쓰기/새 의존성/외부 배포는 실행하지 않았다. 물리 IME/OS 단축키/실제 Windows 선택기는 미검증이고 기존 S0 probe 매핑404는 별도 과거 한계다.
