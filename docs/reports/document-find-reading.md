# 자료 찾기 요청에서 본문 근거와 원문까지

2026-11-08. [명세](../specs/document-find.md), [검증·제한](../verification/document-find/README.md).

## 요청을 입력하고 조건을 확인한다

`LiveConversation`의 기존 composer에 요청을 적으면 기존 request 초안만 바뀐다. 제출 시 `isFindRequest`가 찾기만 요청했는지 확인한다. 정리/복사/이동까지 요청한 문장은 기존 정리 경로를 유지한다. 찾기이면 기존 미리보기를 닫고 `finding.start(request)`를 호출한다.

`start`는 읽기를 하지 않는다. 요청 단어와 월/연도 단서를 `inferFindRequest`로 가져와 confirm 상태를 publish한다. 연도가 없거나 둘 이상이면 비우고, 날짜 기준도 여러 의미면 하나를 고르지 않는다. ‘쯤’의 넓이는 사용자가 해당 월/앞뒤7일 중 선택한다. Provider를 구독한 LiveConversation이 FindConversation을 보여 주고 공통 shell/composer 안의 조건 폼을 표시한다.

`DocumentFindPanel`의 `onChange`에는 `controller.configure`를 나중에 호출할 함수를 전달한다. 실제 입력 때만 조건을 바꾸고 이전 검색을 중단/폐기한다. 검색 시작의 `onSubmit`이 `controller.search()`를 호출한다. native required와 controller의 `confirmFindQuery`가 모두 유효해야 reader에 들어간다. 날짜는 UTC 달력 연산으로 시작/끝을 만들며 사용자에게 같은 값을 표시한다.

## 같은 로컬 읽기에서 전체 본문을 검사한다

`search()`가 세대 번호와 AbortController를 만든 뒤 주입된 `session.findSourceDocuments(scope, query, signal)`을 기다린다. session은 기존 `inspectSourceSnapshot`의 owner/연결 세대/현재 handle/권한 검사를 사용한다. 탐색은 기존 `readSourceSnapshot`이고 상대 경로/형식/크기/개수/시간 한도도 그대로다.

각 파일의 `createCopyHasher.readText(file, instruction, query)`는 기존 Worker에 File과 검색 조건을 보낸다. Worker는 원본 bytes를 한 번 읽어 SHA256을 만들고 UTF-8을 검사한다. 기존 AI 발췌/해시도 유지하며 새 `findTextEvidence(text, query)`는 이미 읽은 전체 본문을 검사한다. 첫1,200자 밖의 회의일도 이 단계에서 찾는다. 전체 텍스트를 UI로 반환하지 않는다.

이 순수 함수는 요청 단어를 모두 포함하는지 확인한 뒤 선택한 날짜 의미의 명시 필드를 찾는다. 기존 `contentDates`가 실제 달력 날짜를 검증한다. 그 함수를 별도 순수 모듈로 옮겨 정리와 검색이 함께 쓰며 Worker에 schema/SDK를 끌어오지 않는다. 날짜가 없으면 확인 필요, 기간 밖만 있으면 제외, 기간 안팎이 함께 있으면 확인 필요 후보로 반환한다. 범위 안 근거는 앞쪽에 보존하여 긴 문서의 앞선 날짜들이 가리지 못하게 한다.

Worker가 돌려준 값은 `copy-hash`의 형태/크기 검사 후 reader로 돌아온다. 원본 size/mtime/권한을 기존처럼 다시 확인하고 별도 findings 배열에 이름·경로·근거를 담는다. AI용 문서 DTO에는 검색 근거를 섞지 않는다. session은 결과/제외/완료 여부만 찾기 controller에 반환한다.

## 결과 표시와 원문 보기

controller는 취소/세대가 바뀌지 않았을 때만 ready와 결과를 publish한다. 연결/권한/owner 변경은 상위 connection controller가 찾기 상태를 reset하므로 늦은 결과를 게시할 수 없다. 같은 계정의 화면 전환은 같은 Provider 상태를 사용하고 F5는 새 상태로 시작한다.

`DocumentFindResults`는 후보 수/날짜 확인 필요 수를 실제 결과에서 계산하고20개씩 표시한다. 경로·검색어/날짜 근거를 보여 주며 실패·형식 제외·일부 결과도 숨기지 않는다. 파일 행은 기존 SourceFileRow다. 클릭하면 FindConversation이 `preview.open(path)`를 호출하고 기존 SourceDocumentPreview를 표시한다. 기존 navigation.openFile은 파일 화면의 history port가 활성일 때만 작동하므로 채팅에서는 동일한 preview controller의 읽기 API를 직접 사용한다.

목록은 미리보기 동안 숨겨 보존하고, 닫으면 원래 버튼에 초점을 돌린다. 새 요청은 미리보기를 닫고 조건 확인으로 돌아간다. 이 전체 경로에는 파일 writer나 모델 Action 호출이 없다.
