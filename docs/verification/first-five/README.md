# 통합 이후 1~5 후속 — 2026-11-09

사용자 요청: “일단 5번까지는 해보자”. [작업 범위](../../planning/first-five.md). 현재 검증 결과와 미확인 범위를 분리한다. 기존 작업 전체의 완료나 배포 승인으로 해석하지 않는다.

| 번호 | 결과 | 증거와 남은 범위 |
| --- | --- | --- |
| 1. 통합 대화 실사용 경로 | 자동 검증 통과 | 일반 → 찾기 → 정리 → 일반, 공통 입력 노드 유지, 애매한 요청만 확인, 로컬 작업 문맥의 일반 전송 제외. 실제 제품 UI/상태/HTTP와 합성 SSE로 40개 통과. 실제 사용자 쿠키와 실제 모델을 결합한 전체 여정은 아님. |
| 2. AI 지연·정산 | 합성 스트림·실제 모델1회 확인 | 실제 서버 handler·서명한 합성 세션·일회용 PostgreSQL·실제 OpenAI로 정산 모델/토큰 일치. DB25+60 및 실제 모델 추가1개 통과. 첫 글자3074ms/완료3184ms/본문2묶음 사이109ms. 실제 사용자 쿠키와 원격 운영 DB를 결합한 사이트 전체 속도는 미측정. |
| 3. Windows 환경 | 자동 실패 경로 통과, 물리 확인 남음 | 합성 거부/철회·외부 파일 변경·읽기 취소·다른 owner/연결 차단과 브라우저 키보드/조합 이벤트 검사. 실제 Windows 권한 창, 실제 파일을 다른 앱에서 변경하는 경합, 물리 한글 IME는 미검증. |
| 4. 저장 근거 복원 | 구현·검증 완료 | 새 자료 답변의 최소 근거 메타데이터 저장, 새로고침/재열기 뒤 동일 원문 미리보기. 변경·권한·다른 연결·취소·좁은 화면 포함 브라우저22개 통과. 과거 형식에 근거 정보 자체가 없던 답변을 소급 복구하지는 못함. |
| 5. 대용량·접근성 | 정해진 상한과 합성 자료 검증 통과 | 100/500회 대화 복원과6개 JS heap 표본·현재 turn 수와 DOM 일치, 390px 줄바꿈, 공통 입력/검사기, 500문서·1000목록·50MiB 상한 단위검사, 실제 로컬 PDF Worker 경계. 장기 누수/현장 INP/p75, 실제 스캔 문서/OCR, 실제 장치 전체 성능은 미측정. |

## 주요 변경과 읽을 순서

1. `shared/grounded-evidence.ts`, `grounded-chat.ts`, `ai-records.ts`: owner·연결 ID·경로·전체 바이트 해시/크기·인용문만 저장하는 엄격한 형식. 원문 전체/전체 발췌/핸들/권한/전송 동의는 저장하지 않는다. 기존 기록은 선택 필드가 없어도 열린다.
2. `general-chat-state.ts` → `useGeneralChat.ts` → `useWorkspaceConversation.ts`: 완료 자료 turn에만 근거를 붙이며 일반 채팅 문맥에서는 제외한다.
3. `useGroundedConversation.ts` → `SourcePreviewController` → `FolderConnectionSession.readSourceFile` → `readSourceFilePreview`: 현재 답변과 저장 답변 모두 같은 경로. owner/선택한 연결/경로를 I/O 전에 검사하고, Worker에서 본문·해시·인용문을 확인한다. 재취득한 File도 해시 전용 경로로 검사한 뒤 권한을 확인한다. PDF 추출은 중복하지 않는다. 확인 직후 새 변경을 원천 차단하는 파일 잠금 기능은 아니다.
4. `GroundedAnswerView.tsx`, `grounded-answer.module.css`, `LiveConversation.tsx`: 동일 근거 목록과 입력/원문 보기 재사용. 230자 파일명·200자 공백 없는 인용문의 좁은 화면 넘침을 재현해 수정했다. 기존 승인 디자인은 유지한다.

이동 취소 신호와 파일 읽기 수명을 연결했다. 질문 변경/대화 전환/다른 근거 요청 뒤 늦게 읽힌 본문이 파일 화면에 남지 않는다. 새 읽기가 시작되면 이전 신호가 새 작업을 닫을 수 없다. 검토에서 이 문제와 같은 크기/수정 시각의 바이트 교체를 발견했고, 실패 테스트 후 수정했다. 읽기 전용 재검토 결과 막는 문제 없음.

## 측정 결과와 조건

- [통합 채팅40](browser/checks.json), [검색55](browser/browser-checks.json), [저장 근거22](browser/grounded-checks.json), [AI 기록17](browser/records-checks.json): 격리 Chromium·제품 UI/controller/실제 OPFS·합성 HTTP/Action/권한. 개인 폴더 및 실제 모델 호출 없음.
- [긴 대화](browser/long-conversation.json): 1440px, 이미 읽힌 로컬 기록에서 두 animation frame까지. 최종100회 79.9/37.7/36.1ms, 500회 198.1/138.8/132.5ms. 복원 잘림/모델 재전송 없음. CDP JSHeapUsedSize 시작19.8MiB/마지막19.9MiB/6표본 최대46.6MiB이며 GC 시점을 통제하지 않았다. 최종 DOM은500turn의1000article로 이전 열기가 누적되지 않는다. 작은 표본이며 장기 누수·브라우저 RSS·저장소 초기화·현장 INP·안정된 분위수의 증거는 아니다.
- [실제 PDF Worker](browser/pdf-local.json): 유효 텍스트 PDF, 빈 문서 `pdf-no-text`, 손상 문서 `pdf-invalid`, 51쪽은50쪽까지만 추출/complete=false, 200,001자는200,000자까지만 추출/complete=false. 쪽 표시는 본문 문자 상한과 별도다. 2MiB+1 파일은 본문 읽기 전에 거절한다. 로컬 PDF.js Worker만 사용하고 원격 요청은 없다. 실제 이미지 문서/OCR·암호 PDF는 이번 브라우저 세트에서 검증하지 않았다.
- [격리 정산](../recording-latency/performance/chat-ledger-fixture.json): 합성 공급자, 실제 서버·DB. accepted63ms/본문198ms/완료198ms, 합성18토큰과 원장 일치. 실제 공급자 속도나 비용으로 사용하지 않는다.
- [실제 공급자·격리 DB](../recording-latency/performance/chat-ledger-live.json): 2026-11-09 17:31 KST, 짧은 합성 질문1회, OpenAI `gpt-6-luna`, accepted75ms/첫 본문3074ms/완료3184ms/본문2묶음 최대 간격109ms. 토큰 계산 HTTP961ms, 생성 HTTP의 응답 헤더 수신1037ms이며 생성 전체 시간이 아니다. 입력123·출력15·합계138토큰이 최종 원장과 일치했다. 실제 공급자 HTTP는 계산1+생성1, 모두200, 재시도0. 원격 운영 DB 지연·실제 계정·실제 Next HTTP/after·브라우저 표시까지 합친 측정은 아니다. 사용자 기존12초 사례와 같은 질문/조건의 전후 비교가 아니므로 항상3초 또는 개선율을 주장하지 않는다.
- [현재 원격 DB 왕복](../recording-latency/performance/database-roundtrips.json): Sydney, cold SELECT1654ms, warm224/224/224ms, 읽기 전용4왕복 transaction898/894/896ms. [두 transaction 비교](../recording-latency/performance/paired-roundtrips.json): 순차1801/1807/1808ms, 병행900/900/902ms. SELECT1만 사용했고 사용자 자료·한도·모델·DB 쓰기 없음. 네트워크 대기가 있다는 증거이며 실제 채팅 개선율이나 전체 지연 원인 비중의 증거는 아니다.

## 재현

`pnpm test`는 기본 단위 검사이며 유료 검증 파일을 포함하지 않는다. 유료 실행은 기본 작업/CI에 연결하지 않았다.

```text
node tests/browser/check-general-chat.mjs docs/verification/first-five/browser
node tests/browser/check-document-find.mjs docs/verification/first-five/browser
node tests/browser/check-grounded-chat.mjs docs/verification/first-five/browser
node tests/browser/check-ai-records.mjs docs/verification/first-five/browser
node tests/browser/check-pdf-local.mjs docs/verification/first-five/browser
node tests/database/auth-schema-check.mjs --chat-ledger-fixture
```

실제 모델용 `--chat-ledger-live`는 opt-in이다. 격리 DB·가짜 계정/메일 설정·서명한 합성 세션만 사용하고 공급자 설정 두 값만 읽는다. 앱처럼 `AI_PROVIDER` 생략 시 OpenAI 키 기반 기본 선택을 따른다. 외부 HTTP는 토큰 계산1회/생성1회만 허용하며 중복 endpoint/다른 서비스/자동 재시도를 막는다. 호출 전부터 최소 요청 횟수/상태 기록을 남긴다. 기존 실제 계정의 세션을 만들거나 운영 사용량을 변경하지 않는다. 직접 handler와 등록한 완료 promise를 검사하므로 실제 Next `after` 또는 배포 수명 검증을 대신하지 않는다.

실행 이력: 초기 위임 시도는 종료/최종 보고 증거가 없어 호출 여부를 모른다. 추가 유료 실행의 자동 승인 검토가 1회 상한 초과 가능성으로 거절했다. 이후 합성 스트림·격리 DB 검증과 endpoint별1회 제한/호출 전 기록을 보완하고, 초기 시도를 최대1회로 계산해 전체 계획2회 이내의 마지막 생성1회로 승인받았다. 중간 `AI_PROVIDER` assertion 실패는 자식 프로세스 spawn 이전 종료로 HTTP가 없음을 확인했다. 가짜 인증 메일 설정과 공급자 기본 선택을 보완한 뒤 실제 실행1회가 성공했으며, 더 호출하지 않았다. 초기 불명확 시도를 무료/미호출로 확정하지 않는다.

Windows 보안 권한 요청 자동 조작은 적용한 [Computer Use SKILL.md](C:/Users/sabin/.codex/plugins/cache/openai-bundled/computer-use/26.1103.32239/skills/computer-use/SKILL.md)의 필수 [guidance.md](C:/Users/sabin/.codex/plugins/cache/openai-bundled/computer-use/26.1103.32239/docs/guidance.md)에 있는 “Do not act on security or privacy permission requests.”에 따라 하지 않았다. 실제 사용자 권한 선택과 물리 IME 결과를 합성 결과로 대체하지 않는다.

## 최종 검증 상태

최종 타입·린트(경고0)·146파일1293테스트·production 빌드 `-tubPNZCpX1Cd9AbS9PW4` 통과. 서버 경계26/구조25+6+3 통과, S0는 제한 환경 Chromium `Page.enable` 시간 초과 후 일반 권한에서164모듈/브라우저 export 확인 통과했다. 코드 오류로 포장하거나 첫 실패를 숨기지 않는다. diff 공백 검사 통과.

[production 경로/자산](performance/routes-assets.json): 게스트 보호 경로3개+demo3개 각각3회, history 상태9검사 통과. 전체 JS/CSS49파일3,568,324 bytes, 직전 통합 빌드 대비3,473 bytes 증가. 배포 자산 총량이며 초기 다운로드 증가나 사이트 전체 성능 점수가 아니다. 로그인된 채팅/파일/설정의 현장 성능을 대신하지 않는다.

QA3035 종료 후 dev3034를 복구했다. [개발 로그인](dev-login.json): 실제 Next dev 화면6/6표시·강제 reload0·예외0. URL `http://127.0.0.1:3034`, owned exec session93198. 개발 서버 실행 중 타입/빌드/Prisma generate를 병행하지 않는다.

6번 이후 배포·운영 변경, OCR/의미 검색, 로컬 AI/위키/성장, 제한 제거는 작업하지 않았다. 현재 시간당10회 및 전역 한도를 유지한다. 개인 파일/실제 계정·운영 사용량 수정, 신규 운영 DB migration, commit/push/deploy는 이번 후속에서 하지 않았다.
