# 연결 버튼·A4 지면·경고 간격·하단 알림

2026-11-04 사용자73~76. [명세](../../specs/document-a4-vault-actions.md), [코드 설명서](../../코드_이해하기.md).

## 변경

- `RecoveryVaultSettings`: ‘보관함 다시 연결’을 따로 노출하지 않는다. 기존 보관함 선택 버튼 하나로 재선택·권한 확인을 수행하고 연결된 상태에서는 ‘다른 보관함 선택’으로 표시한다. 기존 선택 서비스의 식별·위치 검사와 권한 경계를 유지한다.
- `source-document-preview.module.css`: 읽기/편집의 같은 지면을 최대CSS210mm(약793.7px)와297/210 최소 높이로 표시한다. `DocumentWorkspace`의 본문 컨테이너 폭을 사용해 작은 화면도 같은 비율로 줄인다. 긴 문서는 늘어나며 PDF 생성·물리 크기 측정·페이지 나누기는 추가하지 않았다.
- `InlineDocumentEditor`: 저장하지 않은 확인을 문서 폭으로 제한하고 경고와 버튼 사이12px을 둔다. 계속 편집/명시 버림 동작은 유지한다.
- `DismissibleNotice`와 공통 CSS: 일시 안내를 fixed 우측/하단24px·최대420px(작은 화면16px·안전 영역)의 작은 알림으로 옮겼다. 문서 상단을 밀지 않으며 닫기·5초·hover/키보드 pause를 유지한다. 중요한 오류와 저장 여부 확인은 자동 삭제하지 않는다.
- 확인 중 `FolderListingView.Props`에 실제 사용/전달되지 않는 필수 onSelectionOpen 선언이 남아 타입 검사를 막았다. 해당 선언만 제거했고 선택 동작은 바꾸지 않았다.

## 검증

`pnpm check` exit0:568테스트/56파일·타입·lint·server경계21·feature/domain/layout경계34·production43페이지 build. [로그](check.log). 네이티브 stderr를 PowerShell이 표시하는 형식과 실제 종료값을 구분했다.

최종 production3040 실제 Chromium OPFS/Worker/IndexedDB **70검사**, 실패·콘솔 예외0:

| 스크립트 | 검사 | 근거 |
| --- | ---: | --- |
| check-document-a4-vault.mjs |21|[결과](browser/checks.json)|
| check-workflow-ux.mjs |49|[결과](workflow/checks.json)|

390/768/1440/1920/2560/3840px의 읽기/편집 지면 폭·높이 일치와 A4 비율을 실제 rect로 확인했다. 권한 상실을 주입해 단일 연결 버튼으로 같은 기존 보관함을 다시 선택하고 파일 쓰기/재생성0을 검증했다. 저장하지 않은 경고의12px 간격·문서 폭, 우측 하단 fixed 알림의 크기/좌표·상단 비이동·직접/5초 닫기, 기존 편집 첫 사본1개·수동/주기 저장·외부 변경·F5·폴더 계획/실제 복사·단계를 검사했다.

직접 확인한 화면: [A4 편집2560px](browser/a4-editing-2560.png), [모바일 지면](browser/a4-editing-390.png), [정돈한 확인 경고](browser/unsaved-warning-1920.png), [오른쪽 아래 알림](browser/bottom-right-toast.png). 경로별 성능은 [별도 기록](performance.md).

## 재현·한계

```powershell
pnpm check
pnpm --filter @personal-ai/web start --port 3040
pnpm exec node tests/browser/check-document-a4-vault.mjs http://127.0.0.1:3040 docs/verification/document-a4-vault-actions/new-run
```

합성 자료만 사용했으며 사용자 note/실물 디스크에는 접근하지 않았다. 모니터의 인치·OS 배율에 따른 종이 실물 크기를 보장하지 않는다. native OS 권한창·물리IME·외부 프로그램의 원자적 경쟁·실사용 INP는 미검증이다. 사용자 확인 서버는 기존3034 origin에 같은 build로 재시작해 브라우저 연결 저장 위치를 바꾸지 않았다.
