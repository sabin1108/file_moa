# 로딩·전환·작업 피드백의 재사용 계약

목표는 같은 모양 복사가 아니라, 실제 상태와 데이터를 넣어 같은 표시 컴포넌트를 사용하는 것이다. 이번 코드는 정적 시안과 표시 계층이며 인증·저장·AI 스트림·파일 처리 구현은 포함하지 않는다.

## 의존 방향

`prototype/demo/scenes/feedback` → `workspace-feedback` → `shared/ui/Icon`

- 제품 표시 계층은 scene ID, 합성 데이터, 네트워크, 타이머, 저장소를 가져오지 않는다.
- 샘플 전환 버튼과 합성 응답은 prototype 아래에만 둔다.
- 기존 `prototype/components/Icon`은 공유 아이콘을 re-export하므로 승인된 화면의 import와 모양을 유지한다.
- 동작 버튼은 `action: ReactNode`로 전달한다. 버튼의 클릭 콜백·권한 확인·재시도 정책은 호출자가 소유한다.

## 컴포넌트 입력과 책임

| 컴포넌트 | 입력 | 소유하지 않는 것 |
| --- | --- | --- |
| `MoaLoader` | 크기 | 대기 시간·완료 판단·타이머 |
| `StartupState` | loading/slow/error/ready, 제목, 설명, action | 인증·초기 데이터 요청·화면 이동 |
| `StatusNotice` | pending/success/attention/error, 제목, 설명, action | 성공/실패 판단·자동 사라짐·재시도 |
| `LoadingRegion` | loading/refreshing/ready/error, 안내, placeholder, children, action | 요청·캐시·데이터 변경 |
| `ContentSkeleton` | list/document, 행 수 | 자료 개수나 실제 내용에 대한 추정 |
| `TaskProgress` | label/detail, 선택 progress `{completed,total}`, action | 실제 진행량 계산·가짜 퍼센트 |
| `AnswerStatus` | phase, 받은 text, sources, action | 모델 호출·스트림 reducer·중단/재개 방식 |
| `FileIssueList` | id/name/reason/resolution/action 배열 | 파일 판독·검증 규칙·원본 삭제 |

`TaskProgress`는 실제 완료량을 아는 경우에만 유한한 `0 ≤ completed ≤ total`, `total > 0`을 전달한다. 모르면 progress를 생략한다. 파일 형식·2 MiB 한도와 같은 정책은 제품 검증 계층이 결정하고 `FileIssueList`에는 판정 결과를 전달한다.

## 호출 예시

아래 값과 콜백은 실제 기능의 상태 소유자가 제공한다. 이 코드는 특정 요청 라이브러리나 백엔드를 전제하지 않는다.

```tsx
<LoadingRegion
  state={loadState}
  label={loadMessage}
  placeholder={<ContentSkeleton shape="list" rows={3} />}
  action={loadState === "error" ? <button onClick={reload}>다시 시도</button> : undefined}
>
  <DocumentList files={lastSuccessfulFiles} />
</LoadingRegion>

<AnswerStatus
  phase={answerPhase}
  text={receivedText}
  sources={sourceNames}
  action={canStop ? <button onClick={stopRequest}>답변 중지</button> : undefined}
/>
```

`LoadingRegion`의 loading은 아직 내용이 없는 첫 로딩이다. 이미 내용이 있으면 refreshing을 사용한다. refreshing/error/ready 사이에서는 children의 위치와 key를 유지한다. state 변경 때마다 key를 바꾸거나 데이터 자체를 지우면 호출자가 보존 계약을 깨뜨린다. 문서 교체의 160ms opacity 전환은 교체되는 표시 영역에만 적용하며 입력창과 탐색 메뉴는 그 밖에 둔다.

`AnswerStatus`는 전달된 부분 답변을 그대로 표시한다. 실패·중지 때 답변을 비우지 않는 것은 실제 스트림 상태 소유자의 책임이다. 본문 전체를 live region으로 읽지 않고 상태 문구만 알린다. 실제 중단, 재시도, 이어쓰기 지원 여부는 API 계약 후 연결한다. 시안의 '이어서 작성 예시'는 실제 스트림 재개를 보장하지 않는다.

## 현재 재사용 위치

- `MoaLoader`: 접속 로딩, inline 상태 알림, 진행량 미상 작업.
- `StatusNotice`: 자료 로딩, AI 답변, 이름 저장, 세션 복구, 파일 제외 결과.
- `TaskProgress`: 기존 자료 준비와 파일 이동 진행 시안의 중복 progress UI를 교체.
- `FileSelection`: 기존 파일 선택과 새 자료 로딩/사용 가능한 파일 목록.
- 기존 `RiskNotice`/`ImpactComparison`: 권한·삭제처럼 범위 비교가 필요한 경고에 계속 사용. 단순 완료 알림과 억지로 합치지 않는다.

## 접근성·실제 연결 시 지킬 사항

- 대기 마크는 장식이며 상태 텍스트가 의미를 제공한다. pending 결과 영역에 aria-busy를 사용한다.
- 결과 알림은 자동으로 사라지지 않는다. 조작 버튼은 live region 밖에 두고, 상태만 polite로 알린다.
- prefers-reduced-motion에서는 로고와 내용 전환을 정지한다. 완료를 늦추는 최소 노출 시간은 없다.
- 목록에서 행을 제거하면 호출자가 다음 조작 또는 남은 자료로 초점을 옮긴다. 시안은 이 동작을 구현했다.
- 초안 보존 시안은 메모리 안에서만 유지된다. 새로고침·창 닫기·다른 경로로 이동·다른 계정 로그인 후 복원은 아직 구현하지 않았다.
- 브랜드 로딩은 실제 앱 초기화 경계에, 부분 로딩은 요청 영역에 연결한다. 매 페이지 이동을 전면 접속 화면으로 가리지 않는다. 이번에는 실제 라우트 로더나 인증 흐름을 교체하지 않았다.

표시 계층의 간격·색은 기존 CSS 변수와 동일한 fallback을 사용한다. 승인된 채팅 레이아웃을 변경하지 않고 실제 통합 시 기능의 상태 소유자에서 조합한다.
