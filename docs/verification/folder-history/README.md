# 현재 폴더 작업 기록 — 2026-10-31

현재 목록의 `작업 기록`에서 해당 위치의 `.moa-history` 생성 기록을 읽는다. 같은 작업의 시작/결과를 묶고 완료 기록·실패 기록·결과 미확인을 구분한다. 기록 폴더가 없으면 생성하지 않는다. 검색·선택 상태는 보존한다. 새 의존성이나 서버 전송은 추가하지 않았다.

## 명세와 구현

[HISTORY-001~007](../../specs/folder-history.md)을 먼저 정리하고 서비스/요청 수명 테스트를 작성했다. 첫 실패는 두 구현 모듈 부재에 따른 수집 실패였으며, 27개의 개별 동작이 각각 red였다고 주장하지 않는다. 구현 후 27개가 통과했고 열거/총량/중첩 경로/개별 파일 삭제/크기 불일치 경계를 추가해 관련 31개가 통과했다.

입출력 DTO·순수 해석, 파일 접근 service, 연결 session, 요청 controller, dialog 수명, 표시 view를 분리했다. 기존 생성 writer를 수정하지 않았다. [기능 코드만 읽는 순서](../../reports/folder-history-reading-guide.md).

## 실행 결과

- `pnpm check`: 278개/26파일 통과. 타입·ESLint·서버 경계21개·구조 검사·43페이지 production build 통과.
- `tests/browser/check-folder-history.mjs`: [27개 통과](browser/results.json). 실제 OPFS 생성 기록을 읽어 한 작업으로 표시, 빈 기록 폴더 미생성, 다른 소유자 제외, HTML 텍스트 비실행, 손상·권한 거부·취소·닫기 후 늦은 응답·하위 위치 전환·선택 보존을 확인했다.
- `tests/browser/check-folder-workspace.mjs`: [기존 흐름57개 통과](workspace-regression/result.json). 생성·확장자·선택·미리보기·목적지·IME 합성 입력·권한 오류를 회귀 검사했다. `failure.json`은 수정 전 행 위치 실패 기록이다.
- 조회 구간 추가 쓰기/권한 요청0. 원본 sentinel의 SHA-256·크기·mtime과 기존 journal JSON 동일. 합성 fixture 준비와 생성 시나리오 자체의 쓰기는 이 수치에서 분리했다.
- 390/768/1440/1920px native dialog 넘침 없음, Escape 초점 복귀, Tab 배경 조작 접근 차단, 브라우저 오류0. Chromium Tab 순환에서 document.body가 activeElement인 순간도 기록되어 있으며 매 순간 dialog 내부 요소만 활성화됐다고 주장하지 않는다.

## 발견과 수정

새 history UI의 taste 정적 검사0 FAIL/0 WARN, 기본 `/files` 화면 검사0 FAIL/3 WARN. 기존 미연결 상태의 비어 있는 목록/미리보기 공간에 대한 blank-gap·hero-void·unused-canvas 경고다. 승인된 작업면을 유지하고 합성 내용을 제품에 채우지 않았다. 검사 캡처6장과 기록 팝업의 네 너비·부분 조회 캡처를 직접 확인했다. 작업 이름·결과·시각이 읽기 순서에 맞고 긴 경로는 줄바꿈되며 기록 ID는 접힌다. 정적 검사 통과를 화면 만족도나 전체 접근성 인증으로 대체하지 않는다.

도구 줄에 작업 기록 버튼을 추가한 뒤 새로고침 상태 문구가 길어져 행이48px 내려갔다. 상태 문구에 고정 최소 여유를 주고 줄바꿈을 유지해 기존 행 위치 불변 검사를 다시 통과했다. 검사의 기대 허용값1px는 완화하지 않았다. 처음 캡처는160ms 진입 전환 중이어서, 최종 캡처는 전환 이후 찍어 직접 확인했다.

읽기는 최대 직계1000항목/200기록/파일64KiB/전체2MiB다. 일부 실패·상한 도달 시 모든 표시 작업을 미확인으로 남긴다. 최신200개 전체를 보장하지 않는다. [성능 기록](performance.md).

## 재현과 한계

production 서버를 `pnpm --filter @personal-ai/web start --port 3011`로 띄운 뒤:

```powershell
pnpm exec node tests/browser/check-folder-history.mjs
pnpm exec node tests/browser/check-folder-workspace.mjs docs/verification/folder-history/workspace-regression http://127.0.0.1:3011
```

Chromium의 격리된 합성 OPFS와 제어된 권한 응답을 사용했다. 개인 디스크·OS 권한창·실물 모바일·물리 키보드/IME·실제 인증을 검증한 결과가 아니다. 조회 중 owner 교체는 session 단위 검증이며 native OS 연결 교체 검증은 아니다. 실제 존재 재확인/복구/복사/이동/삭제는 이번에 구현하지 않았다.
