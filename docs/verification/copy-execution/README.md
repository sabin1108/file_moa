# 브라우저 복사·기록·현재 내용 대조 검증 — 2026-11-01

## 2026-11-02 재개·마감

어제 세션 로그와 소스를 대조해 남은 회귀 확인·보고서를 마감했다. 새로고침 좌표의 기존 실패는 테스트 클릭 도구의 자동 스크롤과 미리보기 복원 시점이 겹친 결과였다. 어제 도구가 같은 viewport를 측정하도록 수정된 상태를 오늘 다시 실행해 **1021.734375 → 1021.734375**, 기존 1px 기준 통과를 확인했다. [어제 실패](workspace-regression/failure.json)와 [오늘 회귀](resume-20261102/workspace/result.json)를 모두 보존한다.

완료 화면에서 실제 복사 성공과 ‘아직 적용하지 않았습니다’라는 계획 설명이 함께 나오는 오류를 추가로 발견했다. `SourcePlanDialog`가 기존 실행 상태를 표시용 `executionStarted`로 전달하고 `FileChangePlanView`가 실행 후에는 ‘검토한 계획’과 파일별 결과 안내를 표시하게 수정했다. 실행 서비스·파일 접근·기존 생성 기록은 변경하지 않았다. [새 브라우저 검사 실패](resume-20261102/caption-red/checks.json) → 수정 → [최종 통과](resume-20261102/final-copy/checks.json) 순서를 남겼다.

새로 실행한 증거:

- 최종 `pnpm check` **331개/31파일**, web/domain/S0 타입, lint, 서버 경계21개, 구조 검사, production43페이지 통과(exit0).
- 최종 복사 브라우저 **18개** 통과: 기존16개 + 실행 전/후 설명2개. 최대16MiB×4=64MiB 실제 OPFS 복사와 원본/복사본 SHA-256 일치, 명시적 실행 제스처, 기록·재연결·내용 대조를 포함한다. [최종 원자료](resume-20261102/final-copy/checks.json).
- 기존 폴더 **57개**, 기록·현재 대상 **42개** 통과. [폴더](resume-20261102/workspace/result.json), [기록](resume-20261102/history/results.json). 이 두 검사는 최종 설명 수정 직전 같은 세션의 실행이며, 수정 후에는 해당 표시를 포함한 복사18개를 다시 실행했다. 초기 복사16개와 최종18개를 중복 합산하지 않는다.
- 최종 복사 결과390/1440px 캡처를 직접 확인했고, 자동 넘침 검사는390/768/1440/1920px를 포함한다. [390px](resume-20261102/final-copy/copy-result-390.png), [1440px](resume-20261102/final-copy/copy-result-1440.png). 화면 확인을 OS 입력/접근성 인증으로 확대하지 않는다.
- [성능 보고](performance.md)에는 기존 기준선·어제 측정과 오늘 최종 빌드6경로×2폭×3회 원자료를 구별했다.

이번 재개는 직접 검증했다. 추가 독립 검토를 위해 실행한 native 자식은 지정 모델 미지원으로 시작하지 못했으며 독립 리뷰 완료로 계산하지 않는다. 아래 architect 검토는 어제 기록이다. [마감 인수인계](../../handoff/2026-11-02-copy-execution-complete.md).

최신 사용자 요구에 따라 설치 없는 실제 복사, 진행/결과, 목적지 작업 기록, 재연결 후 조회와 현재 내용 대조를 구현했다. 원본은 읽기만 하며 검토한 계획 뒤 사용자가 직접 실행한다. 최초의 쓰기 보류 선택 뒤 사용자가 구현을 요청하고 보호의 초점을 AI에게 맡긴 폴더의 원본으로 설명했다. 외부 프로그램까지 차단하는 원자적 no-clobber를 구현했다고 주장하지 않는다.

## 변경과 읽을 순서

[명세](../../specs/copy-execution.md) → [기능 코드 읽기](../../reports/copy-execution-reading-guide.md) → lib/copy-journal → services/copy-journal-storage → services/copy-execution → services/connection-session → store/copy-execution-controller/source-plan-controller → 표시 → copy-history-inspection 순서다. 기존 생성 journal 포맷과 읽기 전용 검사 경계는 보존한다. 불필요한 공통 실행기/새 의존성을 추가하지 않았다.

기록은 목적지 .moa-history의 새 moa-copy-* family다. 한 항목 verified 후 다음을 시작하며, started 뒤 실패는 uncertain, 후속은 not-run이다. 실행 중 닫기/Escape는 중단 요청을 보내고 정산 결과를 남긴다. 연결/owner 종료는 구 결과 노출을 차단한다. 기록 누락·fork·불법 전이·일부 읽기는 미확인이다. 내용 대조는 과거 기록을 바꾸지 않는다.

## 실행 증거

- 최초 RED: copy-journal 및 copy-execution 새 모듈 부재로 각각 suite 수집 실패. 이후 최소 구현으로 GREEN. 리뷰 발견 문제와 현재 관측 경합은 추가 회귀 테스트로 고정했다.
- 최종 `pnpm check`: **331개/31파일**, web/domain/S0 타입, lint 경고0, 서버 경계21개, 구조 검사, production43페이지 통과. 이전306개 대비25개 추가다.
- 새 실제 브라우저 검사 **16개 통과**: 복사 전 쓰기0, 명시적 제스처의 권한 요청,2파일 실제 OPFS 복사/내용 동일/기록6개, 원본 sentinel hash·size·mtime 유지,390/768/1440/1920px 넘침 없음, 저장 기록 조회, 새로고침/재연결, 현재 내용 대조, 읽기 중 쓰기0, 최대16MiB×4=64MiB 복사 및 hash 일치, 브라우저 예외0. [원자료](browser/checks.json).
- 기존 기록/대상 확인 브라우저42개 통과: [원자료](history-regression/results.json). 이 결과는 최종 관측 재확인 보강 전 실행이며 해당 보강은331개 최종 테스트와 새 복사 브라우저 검사에 포함된다.
- 독립 native architect 읽기 검토: journal 디렉터리/파일 교체 감지, 실제 prepared bytes 예산, 취소 결과 보존, UI 단정 문구를 지적했고 수정했다. 최종 관측의 기록 재확인/없음 재조회 권고도 반영했다. 공식 Ralplan 합의/실행 receipt는 아니다. Critic 역할은 모델 미지원으로 실행되지 않았으며 그 승인으로 보고하지 않는다.

## 재현

```powershell
pnpm check
pnpm --filter @personal-ai/web start --port 3011
pnpm exec node tests/browser/check-copy-execution.mjs
pnpm exec node .omx/run-copy-browser.mjs tests/browser/check-folder-history.mjs docs/verification/copy-execution/history-regression http://127.0.0.1:3011
```

최종 표시 수정 후 재현은 `pnpm exec node tests/browser/check-copy-execution.mjs http://127.0.0.1:3011 <출력폴더>`를 사용한다. `.omx/run-copy-browser.mjs`는 로컬 검증 wrapper이며 Git 추적 대상이 아니다. 해당 파일이 없는 환경에서는 Chromium 기본 실행을 먼저 사용하고, 이 환경과 같은 sandbox 제한이 있을 때만 테스트용 임시 wrapper에서 `Browser.launch`에 `extraArgs: ['--no-sandbox', '--disable-gpu']`를 전달한다. 사용자 브라우저나 설치된 skill 파일을 수정하지 않는다.

격리 Chromium은 이 실행 환경에서 기본 sandbox renderer의 Page.enable이 시간 초과되어 테스트 profile에만 --no-sandbox/--disable-gpu를 사용했다. 사용자 브라우저 설정이나 설치된 skill 파일은 바꾸지 않았다. 이 시험은 UI/Worker/Web Crypto/OPFS의 실행 증거이며 OS 네이티브 사용자 폴더/권한창 검증과 구별한다.

## 한계

- 실제 OS 권한창, 개인 디스크, 외부 프로세스 경쟁, 물리 키보드/IME, 실물 모바일, 실제 인증은 미검증. 기존 localhost 개발 owner 제한은 유지한다.
- browser getFileHandle(create:true)는 외부에서 동시에 생성된 빈 파일의 소유자를 판별하지 못한다. 알려진 충돌은 거부하고 여러 시점의 identity/bytes를 검증하지만 OS 전체 잠금/배타 생성 보장은 없다. 원본을 AI가 임의 수정하는 경로는 추가하지 않았다.
- journal append/readback은 power-loss durability를 보장하지 않는다. 누락/손상은 미확인으로 남긴다. 자동 재실행/삭제/복구와 이동은 미구현.
- 복사 기록400개/직계1000개/총4MiB 한도로 다음 작업을 거부할 수 있다. 자동 삭제하지 않으며 장기 보존·작업별 partition은 후속 과제다.
- 성능은 [별도 기록](performance.md)을 따른다. 실사용 INP/TBT·전체 성능 개선/무회귀를 주장하지 않는다.
