# 미확인 작업 대상 확인 — 2026-10-31

미확인 생성 기록의 현재 대상 존재·종류를 읽기 전용으로 확인한다. 앱 새로고침 뒤 사용자가 다시 연결하고 저장된 기록을 열어 확인할 수 있다. 현재 관측 시각을 별도로 표시하며 과거 작업 결과나 journal을 변경하지 않는다.

## 명세·구조·실패 경로

[TARGET-001~006](../../specs/history-target-inspection.md)을 먼저 정했다. service 테스트의 첫 실패는 모듈 부재 수집 실패였고, controller 테스트는 미구현 메서드로 7개가 실패했다. 구현 후 부모/대상 교체·기록 변경·소유자 변경·중간 취소·권한·읽기 전용 경계를 보강해 신규28개를 통과했다. 독립 holdout이나 실제 OS 검증으로 부르지 않는다.

새 파일 접근 service와 표시 컴포넌트를 추가하고 기존 session/history controller의 요청 수명을 재사용했다. 현재 관측은 controller의 별도 inspection 슬롯이며 새 요청/닫기/새로고침이 무효화한다. 기존 생성 writer와 journal 형식은 바꾸지 않았다. 새 의존성은 없다. [기능 코드 읽기 순서](../../reports/history-target-reading-guide.md).

## 실행한 검증

- `pnpm check`: 전체306개/28파일, 타입·lint 경고0·서버 경계21개·구조 검사·43페이지 production build 통과.
- [기록·현재 대상 브라우저42개](browser/results.json): 존재, 없음, 종류 차이, 현재 확인 후에도 미확인 유지, 기록 변경 감지, 권한 오류, 취소, 조회 새로고침, 명시적 재연결 후 저장된 기록 확인. 기존 기록 읽기27개에 대상/재연결15개를 더했다.
- [기존 폴더 기능57개](workspace-regression/result.json): 생성/선택/검색 도구/목적지/미리보기/합성 IME/권한 오류 회귀. 브라우저 합계99개다.
- 현재 확인에서 대상 파일의 getFile 호출0, 확인 구간 추가 쓰기/권한 요청0. 원본 sentinel SHA-256·size·mtime과 기존 생성 journal 동일. 합성 fixture 준비 및 명시적 생성/재연결 구간은 별도로 계산했다.
- 390/768/1440/1920px에서 현재 결과/버튼/경고의 넘침이 없고 실제 캡처4장을 직접 확인했다. 기존 native dialog의 Escape/초점 복귀와 배경 조작 접근 차단을 회귀 확인했다. taste 소스 검사0 FAIL/0 WARN.

기본 미연결 화면의 taste 브라우저 검사0 FAIL/3 WARN은 기존 목록/미리보기의 blank-gap·hero-void·unused-canvas다. 승인된 빈 작업면을 유지하고 예시 파일을 제품에 채우지 않았다. 기존 화면 검사6장과 실제 현재 확인 결과4개 폭을 직접 확인했다. 확인 버튼과 현재 관측은 해당 기록 안에 있으며 결과 미확인 표시와 혼합되지 않는다.

## 관측의 한계

확인은 원자적 스냅샷이나 지속 감시가 아니다. 권한과 부모·대상을 두 번 대조하지만 확인 직후 외부 변경을 막지 못한다. 기록의 원본성이나 생성 주체를 증명하지 않으며 현재 없음이 과거 실패/삭제의 증거는 아니다. 부모 경로 조회 실패를 대상 없음과 분리한다. 루트 핸들의 OS 저장 장치 상태 전체를 진단하는 기능은 아니다.

실제 Chromium OPFS + 합성 picker/권한 응답을 사용했다. 개인 파일·OS 권한창·물리 키보드/IME·실물 모바일·실제 인증은 미검증이다. 소유자 교체/같은 이름의 핸들 교체는 단위 테스트로 검증했다. 자동 복구·재생성·삭제·복사·이동은 이번 범위에 없다.

## 재현

```powershell
pnpm check
pnpm --filter @personal-ai/web start --port 3011
pnpm exec node tests/browser/check-folder-history.mjs docs/verification/history-target-inspection/browser http://127.0.0.1:3011
pnpm exec node tests/browser/check-folder-workspace.mjs docs/verification/history-target-inspection/workspace-regression http://127.0.0.1:3011
```

[성능 전후 기록](performance.md)은 기존 기능 최종 원자료를 기준선으로 보존한다. 신규 확인 작업 시간은 브라우저 원자료의 targetCheckMs에 별도로 둔다.
