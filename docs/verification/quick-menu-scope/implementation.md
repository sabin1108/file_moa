# 실제 콜백·searchParams·자료 창·퀵메뉴 범위 구현

사용자의 “콜백을 어떻게 썼고 searchParams의 무엇을 바꿨는가”에 대한 코드 기준 설명이다. 결과 요약과 구분하며 실제 소스 이름을 사용한다.

## 설정 탭: 서버 탐색과 URL 표시를 분리

`components/layout/SettingsTabs.tsx`는 `useSearchParams()`에서 현재 tab을 읽고 허용된 탭을 고른다. 선택을 별도 useState에 복사하지 않아서 URL과 화면이 서로 다른 상태가 되지 않는다.

```tsx
const params = useSearchParams();
const selected = tabs.find(tab => tab.id === params.get("tab"))?.id ?? "account";
```

Next Link의 `onNavigate`에서 기본 탐색을 막고 URL만 갱신한다.

```tsx
event.preventDefault();
const url = new URL(window.location.href);
url.searchParams.set("tab", tab.id);
if (params.get("tab") !== tab.id) window.history.pushState(null, "", url);
```

`useSearchParams`의 결과는 읽기 전용이므로 그 객체에 set하지 않는다. 별도의 URL을 만들어 tab만 바꾸고 나머지 query/path/hash를 유지한다. 이전 `router.push`는 서버 화면을 다시 요청하고 page의 인증 검사도 반복했다. native history는 Next가 useSearchParams와 동기화하므로 화면 선택은 바뀌지만 같은 탭 전환에 RSC가 필요하지 않다. `prefetch={false}`로 탭 링크의 사전 요청도 끈다. 수정 키 클릭/새 탭의 정상 href는 남아 있다.

```tsx
<section hidden={selected !== tab.id}>{panels[tab.id]}</section>
```

서버가 받은 패널을 모두 유지한 채 보이는 것만 바꿔 입력 DOM/상태를 보존한다. 최초 진입에서는 `requireAccountSession()` 뒤 두 조회를 `Promise.all`로 병렬 실행한다. 첫 진입/F5/명시 refresh의 인증·읽기는 여전히 서버에서 하며, 실제 변경 Action도 독립적으로 검증한다. 탭을 바꿀 때마다 새로운 계정 데이터가 조회된다고 설명하지 않는다.

공식 근거: [Next native history](https://nextjs.org/docs/app/getting-started/linking-and-navigating#native-history-api), [useSearchParams](https://nextjs.org/docs/app/api-reference/functions/use-search-params). 공통 탭12전환의 RSC/POST0은 이전 검증에 기록되어 있다.

## 콜백: 전역 이벤트 수명과 동작을 연결

`features/quick-switch/hooks/use-quick-switch.ts`의 close/select/choose는 useCallback으로 함수 참조를 유지한다. 예를 들어 choose는 최신 route/close/onChoose가 바뀔 때만 바뀐다.

```tsx
const choose = useCallback((index: number | null) => {
  if (!activeScope() || blockedOverlay() || session.current?.route !== route) {
    close(false);
    return;
  }
  close(index === null);
  if (index !== null) onChoose(index);
}, [route, close, onChoose]);
```

역할은 “무조건 렌더가 빨라진다”가 아니다. global pointer/key listener를 설치하는 useEffect가 이 콜백에 의존하므로, 마우스 이동으로 메뉴 상태만 바뀔 때 effect가 정리/재설치되어 진행 중인 타이머·선택이 끊기는 것을 막는다. route/설정/실제 동작이 바뀌면 cleanup에서 listener와 타이머를 정리하고 다시 연결한다.

React state `menu`는 표시용이고 `session.current`는 이벤트가 즉시 읽을 입력 세션이다. React의 다음 render를 기다리지 않고 keyup/pointerup이 최신 선택을 확인할 수 있다. pointermove는 최초 누른 좌표와의 dx/dy를 `quickDirection`에 보내고 pointerup은 같은 방향 규칙으로 choose를 한 번 호출한다. null은 중앙 취소다. 타이머 만료와 실제 실행 직전에도 scope/overlay를 재확인해 누른 뒤 로딩·modal이 생기는 race를 막는다.

초점은 setMenu 직후 requestAnimationFrame에서 처리하지 않는다. native custom event의 React 업데이트는 그 frame 이전에 commit된다는 보장이 없어 root.current가 아직 null일 수 있었다. `useLayoutEffect([position, trigger])`에서 DOM ref가 연결된 뒤 click 호출은 채팅 항목, hold 호출은 메뉴 컨테이너에 초점을 준다. position 객체는 같은 열린 메뉴의 선택 변경 중 유지되므로 pointermove마다 초점을 되돌리지 않는다.

상위 `WorkspaceQuickSwitch.tsx`의 navigate도 useCallback을 쓰고 `[mode, router, startTransition]`를 의존성으로 둔다. mode에 따라 정식/샘플 경로를 만들고 `startTransition(() => router.push(...))`로 이동한다. transition pending은 중앙 로딩 표시용이며, 비용이 큰 작업 자체를 빠르게 만드는 장치는 아니다.

## 자료 창: 종료 후에 실제로 닫기

`ConversationWorkspace`는 부모가 준 `panelOpen`과 `onPanelChange`를 사용한다. 부모의 초안/대화/자료 저장소는 그대로 두고 창의 표시만 바꾼다.

`useDrawerDialog(panelOpen, onClosed)`가 직접 소유한 dialog ref를 반환한다. useLayoutEffect에서 네이티브 show/showModal 상태와 animation을 맞추고 transform/opacity를260ms 동안 움직인다.

닫는 순간 dialog.close()를 실행하면 보간할 화면이 사라지므로, false 요청 때도 dialog는 잠시 열린 채 closing animation을 수행한다. `animation.finished`가 완료되면 close하고 onClosed에서 requestAnimationFrame으로 원래 버튼 초점을 복원한다. 빠른 재열기는 현재 computed opacity/transform을 저장하고 이전 animation을 cancel한 뒤 그 위치에서 이어간다. generation 번호가 오래된 완료 callback의 close를 막는다. 재열기 때 초점이 창 밖이면 닫기 버튼으로 돌려 Escape도 유지한다. reduced-motion은 animation 없이 같은 완료 절차를 즉시 실행한다.

## 퀵메뉴: 주소 목록 대신 공통 작업 영역

이전에는 루트에 메뉴가 있어도 시작 표면이 채팅/파일 일부에만 표시되어 설정의 빈 영역에서 hold가 불가능했다. `WorkspaceShell`과 `FolderWorkspaceFrame`의 최상위에 아래 표시를 공통으로 둔다.

```tsx
data-workspace-quick-menu={quickMenu || undefined}
```

pointerdown은 `target.closest("[data-workspace-quick-menu]")`, 단축키/미리보기 이벤트는 보이는 scope의 존재를 검사한다. 새 작업 화면이 공통 프레임을 사용하면 별도 route 배열 수정 없이 지원된다. 로그인/가입/소개 등 표시가 없는 화면에서는 반응하지 않고, 안내 화면이 작업 프레임 모양을 재사용할 때는 `<WorkspaceShell quickMenu={false}>`로 제외한다. 이 속성은 UI 사용 범위이며 인증 권한 증거가 아니다.

route는 사용 허용 목록 대신 현재 입력 세대의 표식으로 남긴다. route 변경은 useEffect cleanup으로 이전 timer/listener/menu를 지우고, `menu.route !== pathname`이면 이전 메뉴를 그리지 않는다. 입력·문자 선택·파일650ms 선택·drag/modal/loading은 계속 보호한다.

우측 상단 버튼은 두 프레임에서 제거했고, 보이는 클릭/키보드 대체 조작은 설정 안의 “퀵메뉴 열어보기”에 둔다. 로그인/가입 같은 공개 화면에서 custom open 이벤트를 보내도 scope 검사를 통과하지 못한다.
