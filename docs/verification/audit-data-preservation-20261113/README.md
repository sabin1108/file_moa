# 감사 후 데이터 보존 수정 — 2026-11-13

## 결과와 읽는 순서

[원본 감사](../../../.omx/verification/egm-system-audit-20261113/consolidated_review_report.md)의 A1/A2/A3를 수정했고 A4 개발 도구 취약점과 A7 문서 혼선을 보완했다. 기존 F1/F2의 한도·손상 격리·삭제 재개·경고 유지·원본 보호는 유지했다. A5 저장 비용과 A6 상태 책임 집중은 아래 이유로 후속에 남겼다. 전면 구조 변경·커밋·배포는 하지 않았다.

코드는 편집 이탈 → 저장소 삭제 의도 → controller → 현재 대화 분리 순으로 읽으면 된다.

1. [NavigationGuard](../../../apps/web/src/components/navigation/NavigationGuard.tsx), [RecordEditor](../../../apps/web/src/features/ai-records/editing/RecordEditor.tsx): 미저장 편집이 이동을 잠시 멈추는 흐름.
2. [AiRecordRepository](../../../apps/web/src/features/ai-records/storage/ai-record-repository.ts): 종류 전체 ID 검사, 삭제 표식 검증과 물리 삭제.
3. [AiRecordsController](../../../apps/web/src/features/ai-records/ai-records-controller.ts): 충돌 경고, 연결 세대 검사, 삭제 재개.
4. [AiLibraryPanel](../../../apps/web/src/features/ai-records/library/AiLibraryPanel.tsx), [useConversationRecords](../../../apps/web/src/features/conversation-workspace/records/useConversationRecords.ts): 삭제 확정 뒤 현재 본문·초안을 유지하고 임시 대화로 분리.

## 변경된 동작과 이유

### A1 — 미저장 편집 이탈

기억·프로필·위키·결과물 편집기가 dirty 또는 저장 중일 때만 `beforeunload`를 등록한다. 새로고침·문서 이탈에서는 `preventDefault()`와 `returnValue`로 브라우저 기본 확인창을 요청한다. 저장 성공과 unmount 뒤에는 해제하고 저장 실패나 저장 도중 추가 편집에는 계속 유지한다. 일반 결과물의 자동 저장도 pending 상태에 포함했다.

내부 메뉴의 공통 GuardedLink는 공식 Next `Link.onNavigate`에서 이동을 취소하고 목적지 callback을 보류한다. 빠른 전환과 저장된 인용문 열기의 직접 router.push도 같은 guard를 거친다. 편집기는 기존 ‘계속 편집 / 변경 버리고 나가기’ UI를 재사용한다. 계속 편집하면 보류한 이동을 버리고, 버리면 원래 목적지로 이동한다. 저장 중에는 버리기를 비활성화한다. 공통 provider에는 편집 본문·계정·폴더 핸들을 넘기지 않는다.

같은 문서 Back/Forward는 Navigation API가 있고 해당 이벤트가 cancelable일 때만 막는다. 승인 후에는 목적지 key로 traverseTo를 호출하고 해당 한 번만 허용한다. Next 내부 history 상태나 브라우저 history 함수를 덮어쓰지 않는다. [Next Link 공식 방식](https://nextjs.org/docs/app/api-reference/components/link), [문서 이탈 이벤트](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event), [history 이벤트 취소 조건](https://html.spec.whatwg.org/multipage/nav-history-apis.html#fire-a-navigate-event)을 기준으로 했다.

### A2 — 종류가 다른 같은 ID

ID는 기존 전역 키 계약을 유지한다. 읽기·목록·갱신·신규 예약·쓰기 직전·삭제·삭제 재개에서 다른 종류 폴더의 같은 ID를 직접 조회한다. 새 생성의 기존 workspace 잠금 안에서도 재검사하므로 서로 다른 종류의 동시 생성은 하나만 성공한다.

기존 충돌은 양쪽 파일을 남기고 표시 목록과 자동 삭제 대상에서 제외하며 충돌 경고를 유지한다. 새 삭제 표식에는 반드시 type을 넣고 다시 읽어 확인한다. 종류 불일치 표식과 종류가 없는 예전 자기 삭제 표식은 자동으로 적용하지 않는다. conversation의 typed cascade 표식만 파생 기록 삭제를 시작할 수 있다.

호환 예외: 예전 무종류 source 표식이 cascade=false이거나 생략된 경우에는 연관 기록을 삭제하지 않고 계속 표시한다. 이전의 ‘대화만 삭제하고 결과물은 남기기’ 계약을 보존하기 위한 선택이다. 무종류 cascade=true는 삭제 의도를 확정할 수 없어 파일을 보존하고 읽기 경고로 남긴다. 종류가 명시된 source 표식은 cascade=false도 종류를 검사한다. 기록 전체를 type:id 형식으로 옮기는 마이그레이션은 추가하지 않았다.

### A3 — 삭제 실패와 미저장 초안

삭제 전에 호출하던 forget을 제거했다. owner·연결·ID 검사 → typed 표식 쓰기/close → 표식 재읽기 → 종류·범위·ID 재검사까지 통과한 뒤 onCommitted callback을 한 번 호출한다. 그 뒤에 실제 폴더를 삭제한다.

표식 전 실패는 화면 상태를 바꾸지 않는다. 표식 후 물리 삭제 실패는 기존 refresh/resumeDelete로 이어 간다. callback은 controller의 연결 세대와 store의 현재 ID를 다시 확인한 뒤 id=null, temporary=true, lastSaved=""로 분리한다. transcript·draft·프로젝트 선택은 유지한다. 삭제한 ID에 늦은 자동 저장이 도착해도 삭제 표식 검증으로 거부한다. UI에도 현재 내용이 임시 대화로 남는다고 안내한다. 새 대화나 다른 계정으로 바뀐 뒤 도착한 callback은 무시한다.

### A4 — 개발 도구 minimatch

eslint-config-next → typescript-eslint → typescript-estree 경로의 minimatch 10.2.6만 11.0.8로 고정했다. 직접 의존성은 추가하지 않았으며 잠금 파일에 필요한 전이 의존성 갱신만 반영했다. 기존 minimatch 3.1.5 경로는 유지했다. `pnpm why minimatch --recursive`와 실제 parser 경로의 resolve 결과에서 11.0.8을 확인했다.

공식 [기존 취약점](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249)과 이후 [11.0.7 수정](https://github.com/isaacs/minimatch/security/advisories/GHSA-cf2h-pxjq-68xw), [11.0.8 수정](https://github.com/isaacs/minimatch/security/advisories/GHSA-hqmv-qgp3-jx75)을 함께 확인했다. 상위 안정 도구가 아직 10 계열을 선언해 좁은 임시 override를 사용했다. 상위 안정 버전에 수정이 들어오면 override를 제거해야 한다. 갱신 후 실제 npm 감사 결과는 info/low/moderate/high/critical 모두 0이며 타입·린트·전체 테스트·빌드를 통과했다. 운영 요청을 통한 기존 취약점 악용 경로를 새로 확인한 것은 아니다.

### A7 — 현재 구조와 과거 문서

architecture·guidelines·workflows·testing-strategy 맨 앞에 현재 구현과 권한 경계를 정리했다. 과거 미구현 문장에는 당시 날짜와 현재 기준 안내를 붙였다. 코드 흐름 설명서의 RootLayout, 공통 이동 보호, 삭제 callback 흐름도 실제 코드에 맞췄다. 과거 검증 결과는 새 실행으로 덮어쓰지 않았다.

## 새 검증 증거

| 검사 | 새 실행 결과 |
| --- | --- |
| 수정 전 회귀 | 저장소/controller 50개 중 10개 실패, 브라우저 dirty memory unload 실패를 확인한 뒤 구현. 추가 typed source mismatch도 실패 확인 뒤 수정. |
| pnpm check | Prisma schema, 타입, 린트, 154개 파일·1,397개 테스트, 서버 경계 26개, web import 32개·domain import 6개·layout 3개와 실제 domain 의존 검사, Next production build 통과. |
| 격리 브라우저 | 실제 제품 코드 + 별도 OPFS/Web Locks + 합성 SSE에서 61개 통과. 기존 F1/F2 46개 회귀 포함. |
| A1 실제 브라우저 | dirty/clean/pending/failure unload, 실제 Page.reload의 beforeunload 확인창과 취소 후 보존, 내부 keep/discard, 같은 문서 Back 취소·목적지 재개, unmount 해제 통과. |
| A2 실제 OPFS | 종류 간 ID 생성 거부, 외부 준비된 중복 양쪽 보존, pending 대상 제외와 삭제 재개 거부 통과. |
| A3 실제 UI | 삭제 시작 전 root 권한 오류에서 초안·turn·선택·기존 기록 유지, 재시도 확정 뒤 임시 대화에 같은 내용 유지 통과. |
| Root SSR/hydration | 깨끗한 문서 hydration 통과. 기존 외부 확장 속성 주입 시 warning 재현도 유지. |
| S0 | 실제 모듈 168개와 브라우저 export 검사 통과. |
| 설명서 | 30개 절·31개 anchor·로컬 링크 476개·실제 코드 인용 20개 일치. |
| npm audit | 모든 등급 0건. |
| 독립 코드 검토 | architect가 A1/A2/A3 실제 소스를 읽고 추가 삭제·데이터 손실 문제를 찾지 못함. 테스트를 독립 재실행한 EGM 전체 감사는 아님. |

큰 500개 fixture 테스트가 브라우저·전체 테스트 동시 실행 중 기존 5초 제한에 한 번 걸렸다. 검증 항목은 유지하고 해당 대량 저장소 테스트에만 기존 501/503개 검사와 같은 15초 제한을 적용했다. 최종 check는 새로 통과했다.

원시 로그·JSON은 [감사 폴더](../../../.omx/verification/egm-system-audit-20261113/repair-result.md)에 모았다. 이전의 버그 존재를 확인하는 audit probe는 수정하지 않았고 일반 회귀 테스트와 구분한다.

## 남은 범위

- A5: 모든 버전의 해시·연결 검증을 유지하므로 누적 읽기 비용은 아직 남아 있다. 감사의 64KiB×80 계측은 같은 본문을 반복 저장한 합성 결과이며 실제 디스크 지연이 아니다. 검증을 생략하는 캐시나 의미 없는 동일 본문 최적화로 해결됐다고 주장하지 않는다. head/체크포인트 설계와 변경 본문·외부 변조·실제 파일시스템 계측을 함께 검증할 후속 작업이다.
- A6: 공통 연결 권한 무효화와 generation 책임은 유지했다. 기능별 준비값을 기존 controller로 옮기는 작업은 해당 기능 변경 시 점진적으로 진행할 대상이다.
- 브라우저의 강제 종료·모바일 프로세스 종료·취소할 수 없는 반복 Back은 경고를 보장할 수 없다. 이는 자동 저장 성공 보장이 아니다.
- 브라우저 검사는 실제 제품 컴포넌트와 브라우저 API를 사용하지만 Next 탐색과 서버 인증은 fixture로 대체했다. 배포된 Next 앱의 경로 전환·운영 Set-Cookie·DB/RLS·세션 무효화는 이번에 재검증하지 않았다. 실제 개인 폴더·유료 AI·배포도 실행하지 않았다.
