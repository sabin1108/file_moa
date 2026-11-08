# 정식 채팅에서 TXT/MD 자료를 준비하는 코드 따라 읽기

2026-11-07. 이 단계는 사용자의 로컬 파일을 읽어 발췌와 전송 후보를 확인하는 구현이다. AI 응답 생성이나 원본 변경은 없다. 아래 발췌는 해당 흐름만 남겼으며 생략한 앞뒤 코드는 소스 링크에서 볼 수 있다.

## 1. 요청을 입력하면 어디에 남는가?

[LiveConversation](../../apps/web/src/features/conversation-workspace/components/LiveConversation.tsx)의 입력 연결부터 시작한다.

```tsx
draft={state.request}
onDraftChange={request => organization.update({ request })}
```

화면이 `state.request`를 입력창에 표시한다. 사용자가 타이핑하면 등록된 콜백이 새 문자열을 받아 `organization.update()`를 호출한다. 아직 폴더를 읽지 않는다.

[controller](../../apps/web/src/features/local-folders/store/organization-preparation-controller.ts)의 `update()`로 들어가면 진행 중 읽기를 중단하고 조건을 갱신한 뒤 snapshot과 동의 키를 비운다. 앞 문장에 확인했던 자료를 다른 문장에도 확인한 것으로 처리하지 않기 위해서다.

`organization`은 LiveConversation이 매번 새로 만드는 객체가 아니다. [SourceConnectionController](../../apps/web/src/features/local-folders/store/source-connection-controller.ts)가 생성하고 공통 폴더 Provider가 유지한다. 그래서 설정/파일 화면에 갔다가 채팅을 다시 열어도 같은 요청과 준비 상태를 읽는다. 새로고침하면 이 메모리 상태는 사라진다.

## 2. ‘자료 준비’를 누르면 전달한 함수가 실행된다

LiveConversation이 공통 채팅 화면에 넘기는 부분이다.

```tsx
onSend={() => {
  void organization.prepare();
  setPanelOpen(true);
}}
```

이 줄을 렌더링할 때는 콜백만 전달한다. 실제 제출 때 공통 ConversationWorkspace가 빈 입력·중복 진행·한글 조합을 확인한 다음 호출한다. 그제야 `prepare()`로 들어가고 자료 창도 열린다.

## 3. 범위가 없으면 함수가 여기서 끝난다

controller의 `prepare()`는 요청과 범위를 먼저 읽는다. 조건 분기 발췌다.

```ts
if (!request.trim()) return;
if (!scope) {
  this.publish({ ...this.state, phase: "scope", submittedRequest: request.trim(), consentKey: null });
  return;
}
```

요청이 비었으면 시작하지 않는다. 범위가 없으면 확인 상태를 게시하고 반환한다. **이 return 아래의 파일 읽기로 내려가지 않는다.** 화면은 그 상태를 읽어 어디에서 찾을지 묻는다.

전체 폴더 버튼은 `update({ scope: { kind: "all" } })`를 호출한다. 참고 폴더 선택은 `reference`, 목적지 선택은 `destination`만 바꾼다. 참고 폴더를 골랐다고 scope를 그 폴더로 줄이지 않는다.

다른 폴더를 고를 때는 기존 DestinationPickerController/DestinationFolderPicker를 쓴다. `purpose`는 화면의 이름을 바꾸는 값이며 실행 기능을 바꾸는 권한이 아니다. 이 준비 화면은 `allowCreation={false}`라 폴더를 만들지 않는다. 선택된 상대 경로만 받아 각 조건에 보관한다.

## 4. 범위가 있으면 읽기 상태를 올린 뒤 기다린다

`prepare()`는 새 AbortController와 요청 순번을 잡고 `phase: "reading"`을 게시한다. 실제 호출은 다음 줄이다.

```ts
const snapshot = await this.read(scope, `${request}\n${basis}`, abort.signal);
```

여기서 `this.read`가 무엇인지 생성자로 거슬러 올라가자. SourceConnectionController가 전달한 `session.inspectSourceSnapshot`이다. 문자열 속 줄바꿈은 요청과 별도로 적은 기준을 함께 발췌 검색에 사용하기 위한 것이다. 서버 요청을 만드는 코드가 아니다.

## 5. session에서 현재 연결을 확인한다

[connection-session](../../apps/web/src/features/local-folders/services/connection-session.ts)의 `inspectSourceSnapshot()`으로 들어간다. 현재 소유자, 연결 handle, 연결 세대/순번을 보관하고 `check()`를 만든다.

연결이 바뀌거나 계정이 바뀌거나 취소됐으면 이 검사가 예외를 낸다. 새 snapshot 요청도 앞선 요청을 무효화한다. 목록을 열었다는 것만으로 이 검사를 생략하지 않는다.

검사를 통과하면 `readSourceSnapshot(handle, scope, instruction, check, signal)`을 기다린다. 절대 Windows 경로나 클라이언트가 임의로 준 handle을 새 권한처럼 받지 않는다. session이 이미 가지고 있는 원본 연결을 사용한다.

## 6. 실제 하위 폴더와 TXT/MD를 읽는다

[source-snapshot](../../apps/web/src/features/local-folders/services/source-snapshot.ts)에서 scope를 시작 경로 목록으로 바꾼다. `all`은 연결 루트, `folder`는 그 하위 경로, `selected`는 지정한 파일/폴더다. 경로를 복사하고 `..` 등 잘못된 값을 막는다.

대기열에서 폴더를 꺼내면 기존 `readSourceFolderListing()`으로 직접 자식을 읽고 하위 항목을 다시 넣는다. 파일이면 확장자/크기를 확인해 읽는다. 같은 경로를 중복 처리하지 않고 앱 기록/보관함을 읽지 않는다.

파일당/전체 바이트·문서 수·폴더 수·깊이·시간 상한이 있다. 상한이나 일부 읽기 실패를 만났으면 complete=false와 이유를 반환한다. ‘파일 없음’이나 ‘연결 전체 분석 완료’로 바꾸지 않는다.

## 7. 같은 파일 바이트가 해시와 발췌가 된다

서비스가 `reader.readText(file, instruction)`을 기다리면 기존 [copy-hash](../../apps/web/src/features/local-folders/services/copy-hash.ts)가 Worker에 File과 요청 문장을 보낸다. 이전 복사 검사의 `hash(file)` 호출도 그대로 지원한다.

[Worker](../../apps/web/src/features/local-folders/services/copy-hash.worker.ts)는 `file.arrayBuffer()`를 한 번 호출한다. 그 바이트로 전체 SHA256을 구하고, fatal UTF-8 디코딩을 한 다음 요청 단어 주변의 최대1,200자를 발췌한다. 발췌에도 별도 해시를 만든다. CPU 작업을 화면 스레드에서 하지 않는다.

Worker가 반환하면 service로 돌아와 현재 파일의 크기/수정 시각과 권한을 다시 확인한다. 그 뒤 문서 ID·상대 경로·발췌·전체/발췌 해시·크기·수정 시각을 결과 목록에 넣는다. 이것은 읽은 시점의 사본이며 외부 변경을 계속 감시한다는 뜻은 아니다.

## 8. 이제 controller로 돌아와 화면을 바꾼다

service → session의 마지막 검사 → 처음의 `await this.read(...)` 순서로 돌아온다. controller는 요청 순번이 아직 최신인지 확인한다. 취소 뒤에 늦게 도착했으면 여기서 버린다.

[공통 후보 함수](../../apps/web/src/shared/organization-candidates.ts)는 본문/제목 단어와 입력량으로 후보를 최대40개/약6,000자로 제한한다. 기존 샘플도 같은 함수를 쓴다. 이 점수는 AI의 의미 판정이나 정답이 아니다.

controller가 snapshot/candidateIds/selectedIds와 ready 상태를 게시하면 구독 중인 화면이 다시 읽는다. service가 HTML을 만들어 반환하는 구조가 아니다.

## 9. 발췌 보기와 확인 체크는 무엇을 실행하는가?

[OrganizationSnapshotView](../../apps/web/src/features/local-folders/components/organization/OrganizationSnapshotView.tsx)의 파일 버튼은 `previewId`를 바꿔 이미 읽은 발췌를 표시한다. 다시 파일을 읽거나 Gemini를 호출하지 않는다. checkbox는 전송 후보에서 제외/포함할 항목을 바꾼다.

불완전 탐색이면 일부 범위만 준비한다는 확인이 먼저 필요하다. 그 후 `controller.consent(true)`는 요청·scope·basis·reference·destination과 선택 문서의 버전/발췌 해시로 키를 만든다. 이 키가 있는 현재 조건에서만 확인 완료로 표시한다.

요청/범위/기준/선택 변경·다시 읽기·연결 변경은 이 키를 지운다. 현재는 **외부 전송 후보 확인 상태까지만** 구현했다. 이 체크로 서버 Action이나 복사/이동 함수를 실행하지 않는다. 실제 전송 전 재검사와 새 전송 확인은 다음 단위다.

검증 범위와 남은 기능은 [검증 기록](../verification/live-local-preparation/README.md)을 따른다. 이 설명을 읽는 것만으로 파일 접근이나 모델 호출이 발생하지 않는다.
