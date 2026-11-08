# 빈 폴더 작업 영역 높이 수정

2026-11-08. 사용자 Windows 화면에서 `source > 참고`에 하위 폴더만 있고 MD/TXT를 열지 않았을 때 목록/미리보기 면이 중간에서 끝나는 현상을 신고했다.

`FolderWorkspaceFrame`의 바깥 `.workspace`는 `min-height:100dvh`와 `auto 1fr auto` 행으로 화면 높이를 확보하지만, `.workarea` 안의 `.columns`는 일반 block의 내용 높이만 차지했다. 내용이 짧을수록 하단 상태줄 위에 빈 공간이 드러났다. `.workarea`를 grid로 바꿔 자식 열을 남은 높이에 stretch하고 모바일에서도 이 연결을 유지했다. 열 너비/본문/데이터/파일 처리 코드는 바꾸지 않았다. 같은 frame을 사용하는 정식/샘플에 적용된다.

- 수정 전 동일 standards-mode 합성 브라우저에서 빈 폴더의 열 끝이 상태줄보다 **324.42px 위**에 있어 회귀 검사가 실패했다. [전 geometry](before/checks.json).
- 수정 후 390/768/1440/1660/1920px 각각 빈 폴더, 하위 폴더만 있음, 파일 미열기, MD 열기, TXT 열기의 **25개 geometry 검사** 통과. 열/데스크톱 미리보기 끝과 상태줄 시작이 일치하고 가로 넘침 없음. 모바일은 기존 native 미리보기 modal 유지, 원본 쓰기0회/컴포넌트 예외0회. [결과](checks.json), [1660px 캡처](folder-only-1660.png).
- 실제 Provider/session/Worker/OPFS를 사용하고 owner/권한 선택/Next 라우팅은 대체한 브라우저다. 파일 화면의 실제 `ui.system`/파일 theme을 fixture에도 적용하고 scroll/focus frame 이후 실제 hit target으로 클릭한다. 실제 Windows 창의 수정 후 화면을 직접 관측한 근거는 아니다.
- 같은 작업 트리에서 전체995검사/102파일, typecheck/lint/build, 서버/기능 경계 통과. 빌드 `A8UUyGVs7Odfss2_iK1gR`. 앞선 정리 흐름 검증과 한계는 [전체 보고](../live-organization-completion/README.md).

재현: `node tests/browser/check-folder-workspace-height.mjs <결과 경로>`. 브라우저 문서에는 doctype을 지정한다. 외부 네트워크/사용자 Chrome 프로필/로그인 쿠키를 사용하지 않는다.

좁은 화면 캡처에서 예전 내부 사이드바용 workarea의144px 열 설정이 남아 있음을 추가 확인했다. 바깥 공통 메뉴로 역할이 옮겨진 현재 frame에서는 불필요하므로 제거했다. 열 끝/상태줄 일치뿐 아니라 가용 너비 사용과 모바일 목록 전체 폭을 검사해25개 모두 통과했다. 실패 원자료는 responsive-before/checks.json이다.
