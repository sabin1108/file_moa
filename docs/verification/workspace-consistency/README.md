# 보관함·문서·공통 계획 화면 일관성

2026-11-04 사용자 요구68~72. [명세와 변경 전 검증 계획](../../specs/workspace-consistency.md), [코드 설명서](../../코드_이해하기.md).

## 결과와 읽을 순서

1. `RecoveryVaultSettings`는 현재 연결/상태 확인/사본 조회와 연결 관리(생성·기존 연결·해제)를 별도 의미 있는 묶음으로 표시한다. 같은 버튼 이름과 실제 연결 처리는 유지한다.
2. `DocumentWorkspace`는 미리보기/편집의 도구줄·제목·상태·정보 접힘·본문·하단 정보를 공유한다. `SourceDocumentPreview`는 article을, `InlineDocumentEditor`는 textarea를 같은 자리에 넣는다. 공통 `.preview .body`가 기존 전역 입력 폰트 규칙보다 우선하게 해 글자/행간 차이도 제거했다.
3. `FileOperationHeader`는 파일/폴더의 헤더·요약·Stepper를, `DestinationPlanStep`은 작업 선택·목적지 지정·계획 확인을 공유한다. 기존 `PlanDestinationInput`은 file controller 어댑터다. `ManagedOperationView`도 같은 입력을 사용한다. 폴더는 계획 화면→목적지 버튼→공통 picker→확정→명시 계획 확인으로 진행한다.
4. `ManagedFilesController.destinationConfirmed`로 미선택 계획을 막고, 선택만으로 자동 검사하지 않는다. 작업 종류를 바꾸면 이전 검사 근거를 폐기한다. 파일 복사→이동 전환에도 확정 목적지를 유지한다.
5. workflow 초안은 `destination`과 탐색 중 `pickerPath`, 확정 여부와 열림 여부를 구별한다. F5 뒤 탐색을 취소해도 미확정 위치를 확정한 것으로 바꾸지 않는다. 기존 one-shot 쓰기 승인 비복원 계약은 유지한다.
6. `DismissibleNotice`가 기존 StatusNotice 디자인과 닫기 버튼·기본5초 수명을 조합한다. hover/키보드 초점 동안 멈추고, 중요한 오류·실행 확인·진행은 자동 삭제하지 않는다. 알림 닫기는 파일 작업 상태를 바꾸지 않는다.

파일-only 충돌/백업/overwrite와 재귀 트리 검증은 기존 처리 계약을 유지한다. 기능 차이가 필요한 실제 검증을 보존하면서 입력·표시·목적지 조작을 공유한다. 새 의존성·아토믹 전면 전환은 없다.

## 검증

`pnpm check` exit0: **568테스트/56파일**, 타입·lint·server경계21·feature/domain/layout경계34·production43페이지 build. [로그](check.log). PowerShell의 native stderr 포맷 안내를 실제 실패와 구별하고 각 단계 완료와 종료0을 확인했다. 변경 전 추가한 controller 시험은 기존 ‘열자마자 picker’ 동작에서 실패한 뒤 수정 후 통과했다.

최종 production3039의 실제 Chromium OPFS/Worker/IndexedDB **207검사**, 실패·콘솔 예외0:

| 시나리오 스크립트 | 검사 | 근거 |
| --- | ---: | --- |
| check-workflow-ux.mjs |48|[결과](browser-final/checks.json)|
| check-managed-files-ui.mjs |20|[결과](managed-final/checks.json)|
| check-restore-current-ui.mjs |45|[결과](current-final/checks.json)|
| check-restore-resume.mjs |35|[결과](restore-resume-final/checks.json)|
| check-recovery-overwrite-ui.mjs |38|[결과](overwrite-final/checks.json)|
| check-recovery-connection.mjs |21|[결과](connection-final/checks.json)|

390/768/1440/1920px에서 미리보기/편집의 본문 시작 위치·폭·글자·행간·안쪽 여백을 실제 computed style/rect로 비교했다. 좁은 화면의 공통 도구줄 행 배치도 맞췄다. 생성/연결 그룹390/1440px와 공통 폴더 계획 네 폭을 확인했다. 문서 편집 시작 시 입력에 초점, picker 확정 후 목적지 버튼으로 초점 복귀, 취소·버림·원본 재읽기를 확인했다.

실제 첫 원본 사본1개·반복 수동/15초 주기 저장·타이머 권한 요청0·외부 변경 차단, 목적지 선택/미선택/탐색 F5, 작업 종류 변경, 명시 검사·복사 실행과 완료 F5,5초 일시 안내 자동 닫기/직접 닫기를 확인했다. 16MiB 트리 copy/move·원본 비재귀 처리·보관함/복원/충돌/취소·늦은 충돌 회귀도 통과했다.

직접 본 화면: [보관함 묶음](browser-final/vault-groups-1440.png), [공통 폴더 계획](browser-final/folder-plan-1440.png), [미리보기](browser-final/reading-1440.png), [편집](browser-final/editing-1440.png), [모바일 편집](browser-final/editing-390.png). [성능](performance.md)과 [정적 소스 확인](static-review.json)을 별도로 기록한다.

## 개발 중 발견한 조건

- `.system :is(input, select, textarea)`의 font 상속이 textarea 글자/행간을 바꿨다. 공유 본문 선택자 우선순위를 명확하게 해 실제 비교로 확인했다.
- 창 크기 변경 직후 native preview dialog의 media effect가 실행되기 전에 측정하면 이전 modal 폭을 읽었다. 시험에서 두 프레임을 기다리고 현재 레이아웃을 비교한다. 이 개발 실패를 통과 수에 넣지 않는다.
- 연결 화면 초기에 controller 로딩 중 버튼을 클릭하던 시험은 버튼이 활성화될 때까지 기다리도록 수정했다.

## 브라우저 권한창의 범위

사용자 이미지의 ‘변경사항 저장’ 창은 Chromium의 File System Access 권한 UI다. 앱의 DOM/CSS로 꾸미거나 JS 타이머로 닫는 대상이 아니다. 앱은 직접 저장 행동에서 권한을 요청하고 결과를 처리한다. 기존 앱 권한 안내를 사용하며 네이티브 요청을 임의 대체/생략하지 않는다. 근거: [Chrome File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access), [requestPermission](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemHandle/requestPermission), [Permissions 명세](https://www.w3.org/TR/permissions/).

## 재현과 한계

```powershell
pnpm check
pnpm --filter @personal-ai/web start --port 3039
pnpm exec node tests/browser/check-workflow-ux.mjs http://127.0.0.1:3039 docs/verification/workspace-consistency/new-run
pnpm exec node tests/browser/check-managed-files-ui.mjs http://127.0.0.1:3039 docs/verification/workspace-consistency/new-managed
```

최종 사용자 확인 서버는 기존 origin3034에도 같은 build로 재시작해 연결 저장 위치를 바꾸지 않았다. 다음 세션에는 서버 생존을 확인한다. 사용자 note 내용·개인 디스크를 테스트하지 않았다. 네이티브 OS 권한창/실물 디스크·물리IME·외부 프로그램 원자적 경쟁·실사용 INP는 미검증이다. 링크 공유만으로 다른 기기에 핸들/본문이 생기지 않는다. 코드 설명서와 외부 요구사항·짧은 오류·상세 인수인계에도 반영한다.
