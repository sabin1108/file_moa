# 샘플 작업 공간 연결 검증

검증일: 2026-11-07. 대상: [샘플 작업 공간 계약](../../specs/sample-workspace.md).

## 결과와 범위

로컬 production의 `http://127.0.0.1:3034/demo`에서 가입 없이 샘플 세션으로 진입하고, 공개 샘플 10개 선택 → 준비된 분류 제안 → 목적지 변경/계획 검토 → 명시 적용 → 되돌리기/초기화를 확인했다. 샘플 위치는 탭 저장소의 가상 상태이며 운영 파일 이동/복구가 아니다. 실제 AI 호출과 운영 배포는 하지 않았다.

PDF는 확인한 두 페이지 이미지와 원본 다운로드, 엑셀은 확인한 셀 표와 실제 XLSX 다운로드를 제공한다. 일반 문서 업로드 파서나 사진 분류는 추가하지 않았다. 앱에는 평가 자료 34개 중 공개 후보 10개만 별도 카탈로그로 포함한다.

## 읽는 순서와 재사용

1. [`sample-session.ts`](../../../apps/web/src/server/sample-session.ts), [`/demo`](../../../apps/web/src/app/demo/page.tsx), [`start`](../../../apps/web/src/app/demo/start/route.ts): 서명/수명·전용 쿠키·같은 origin 진입.
2. [`sample-catalog.ts`](../../../apps/web/src/server/sample-catalog.ts), [`shared/ai-classification.ts`](../../../apps/web/src/shared/ai-classification.ts): 공개 카탈로그의 관계 검증, 모델 입력/응답 공통 계약, 원본·PDF 페이지 제공.
3. [`sample-state.ts`](../../../apps/web/src/features/sample-workspace/lib/sample-state.ts), [`sample-destinations.ts`](../../../apps/web/src/features/sample-workspace/lib/sample-destinations.ts): 샘플 위치/선택/계획/되돌리기와 공통 picker에 공급할 가상 폴더 목록.
4. [`sample-workspace-store.ts`](../../../apps/web/src/features/sample-workspace/store/sample-workspace-store.ts): 세션별·탭별 보관, 실패 안내, 상대 만료 타이머.
5. [`SampleWorkspace.tsx`](../../../apps/web/src/features/sample-workspace/components/SampleWorkspace.tsx): 공통 WorkspaceShell·WorkflowStepper·DestinationFolderPicker/PathForm/Controller·FileChangePlanView 조합. 실제 SourceFolderProvider는 사용하지 않는다.

기존 WorkspaceShell은 표시용 mode/tools만 확장했고 기본 live 동작을 유지한다. 기존 DestinationFolderPicker에는 선택적 onCancel만 추가했으며 기본값은 기존 controller.close다. 폴더 탐색을 새로 구현하지 않고 읽기 콜백만 샘플 목록으로 공급한다. 샘플의 고정 허용 폴더 제약으로 실제 새 항목 생성은 노출하지 않는다. 새 의존성을 추가하지 않았다.

## 실행 증거

| 검사 | 결과 |
| --- | --- |
| 최초 세션/상태 테스트 | 미구현 import 실패를 확인한 뒤 최소 구현 |
| 신규 세션·경로·상태·보관·샘플 자료 테스트 | 21개/5파일 통과 |
| 기존 분류 계약/테스트셋 | 17개/2파일 통과 |
| `pnpm exec vitest run --maxWorkers=4` | 최종 전체 737개/81파일 통과 |
| `pnpm typecheck` · `pnpm lint` | 통과, lint 경고 없음 |
| `pnpm build` | production 50페이지 생성 통과 |
| `pnpm test:boundaries` · `pnpm test:structure` | 서버 경계21, web25/domain6 import fixtures·layout3/실제 domain 경계 통과 |
| `node tests/browser/check-sample-workspace.mjs http://127.0.0.1:3034` | 최종 33개 통과, 브라우저 예외0 |
| `verify-binary-samples.py` | 원본 PDF 발췌·엑셀 셀/수식/캐시 합계와 앱의 표시 셀 대조 통과 |

[브라우저 원자료](browser/checks.json)는 390/768/1440/1920px 가로 넘침, PDF 두 페이지 로드, 실제 PDF/XLSX 응답, 키보드 Enter, 공통 경로 입력/선택, 합성 IME Enter 차단, 취소 후 초점, 승인 전 불변/적용/새로고침/되돌리기/초기화, 다른 탭 상태 분리, 모호한 목적지 차단, 정식 저장소 sentinel 보존, IndexedDB/파일 picker 미호출, 정식 `/files` 로그인 이동, 알 수 없는 자료/변조 세션 거부를 포함한다.

앱 화면 검사기는 네 폭에서 FAIL0이다. 작은 공통 상단 제목과 목록/읽기 면의 서로 다른 높이에 대한 WARN은 남겼다. 서로 다른 작업 면을 같은 높이의 빈 카드로 늘리지 않았으며, 점수만으로 디자인 완료를 주장하지 않는다. 화면은 [선택](browser/select-1440.png), [좁은 화면](browser/select-390.png), [PDF](browser/pdf-1440.png), [엑셀](browser/xlsx-1440.png), [공통 목적지 탐색](browser/destination-1440.png), [계획 검토](browser/review-390.png)를 확인했다.

## 발견·수정과 미해결 구분

- 초기 진입에서 내부 request URL의 localhost를 사용한 절대 redirect 때문에 127.0.0.1 → localhost로 origin이 바뀌었다. 그 뒤 127 주소로 새로고침하면 다른 탭 저장소를 읽었다. 상대 303 Location `/demo`로 고쳤고 origin 유지·결과 복원 검사를 추가했다.
- 서버 절대 시각을 장치 시계와 직접 비교하던 만료 검사를 서버의 남은 시간 + performance.now로 바꿨다. 서버 시계 오차·장치 시각 오프셋 테스트를 통과했다. 거짓 대상 수를 가진 되돌리기 기록도 거부한다.
- 브라우저 기본 PDF 뷰어는 headless 환경에서 빈 화면이 나와 준비된 페이지 이미지로 교체했다. 원본 PDF와 모든 페이지의 SHA-256을 별도 자료로 대조한다.
- 목적지 탐색 중 기존 계획을 적용할 수 있던 경로는 먼저 브라우저 검사를 추가해 실패를 재현했다. 탐색이 열린 동안 적용을 막고, 선택/취소 후 현재 계획만 적용하도록 고쳤다. [수정 전 실패](browser/initial-open-picker-checks.json)와 최종33개 통과를 구분한다.
- 검증기에서 DOM 객체를 값으로 반환하던 대기 조건과 다음 프레임의 초점을 기다리지 않던 취소 검사를 수정했다. 초기 검증기 실패와 최종 통과를 구분한다.
- 로컬 기존 `/api/auth/get-session`은 샘플을 열지 않은 별도 브라우저에서도 503 `AUTHENTICATION_UNAVAILABLE`이었다. 원인은 이번 작업에서 확정하지 않았고 실제 인증 코드는 바꾸지 않았다. 브라우저 보고서의 observations로 남겼으며 세션 조회 API의 정상 동작/실제 로그인 통합 통과로 세지 않는다. 샘플 쿠키 발급이 운영 쿠키를 바꾸지 않는 단위 검사와 `/files` 로그인 이동은 별도로 통과했다.

## 성능과 한계

[성능 기록](performance.md)은 기존 guest6경로 전36/후36 표본, 신규 demo6표본, 별도 HTTP cache 비활성6표본을 구분한다. 실제 인증 계정의 파일 작업 성능이나 field INP가 아니다.

실제 사용자 로그인/계정 연결·운영 DB·다중 인스턴스 부하·일반 문서 파싱·원본 파일 쓰기·물리 IME/Windows 권한창은 이번에 통합 검증하지 않았다. 샘플의 고정 제안은 모델 정확도 평가가 아니다. 운영 배포·커밋/push·유료 모델 호출·환경변수 변경은 하지 않았다.

다음 단계는 기존 인증 API의 로컬503을 별도 진단하고, 실제 AI 호출에 필요한 서버 권한/전송 동의·토큰·전체 예산 예약/정산·취소/중복/늦은 응답 처리를 연결하는 것이다. 외부 사용을 위한 배포는 로컬 구현과 구분해 진행한다.
