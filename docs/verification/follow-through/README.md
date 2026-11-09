# 앞선 작업 후속 검증 — 2026-11-09

사용자 ‘다음 작업도 이어서 하고 아까 지시했던 작업들’에 따라 [1~9 구현](../workspace-nine/README.md)의 실패 경로와 다음 검증·성능·운영 준비를 보완했다. 현재 10회 제한과 승인된 실제 DB/로컬 사용량 기록은 유지했다. 이번에는 migration·실제 사용자 삭제·유료 모델·배포를 실행하지 않았다.

## 발견한 문제와 수정

- **사용량 정산 누락**: 자료 질문·정리의 예약 성공 뒤 인증 실패 경로가 정산을 건너뛰었다. 예약 성공 여부를 추적하고 `finally` 한 곳에서 실제 모델/토큰 또는 `unknown`으로 정산한다. 생성 뒤 권한을 잃은 경우 답변은 숨기되 이미 발생한 사용량은 남긴다.
- **스트림 종료 뒤 정산 수명**: `/api/chat`은 전체 생성·취소·정산 Promise를 Next `after`에 등록한다. 응답이 끝나도 정산 작업을 플랫폼에 알리며, 플랫폼 실행 시간 한계를 보장한다고 주장하지 않는다. 최신 인증과 원장 예약을 동시에 시작하되 둘 다 성공해야 모델을 부른다. 인증을 캐시로 우회하지 않는다.
- **남은 예약 상태**: 사용량 조회에서 현재 작업 공간의 10분 넘은 `reserved`만 `unknown`으로 정리한다. 새 요청·다른 작업 공간·이미 정산한 행은 유지한다. 토큰을 0으로 추정하지 않으며 재시도 생성도 없다.
- **잘못된 인용의 화면 예외**: 서버 응답이 잘못된 문서 ID를 담으면 클라이언트에서 원문 경로를 읽다 예외가 났다. 기존 `validateGroundedAnswer`를 응답 경계에서도 재사용해 답변 게시 전에 거부한다. 실패 재현 뒤 같은 브라우저 검사가 통과했다.
- **S0 검증 도구의 오래된 모듈 경로**: 제품 저장 모듈을 재사용한 뒤 빠진 전이 의존성을 제한된 소스 경로에서 변환한다. Zod는 설치된 ESM을 사용하고 임의 URL을 파일 경로로 변환하지 않는다. 환경 파일 요청의 404도 검사한다. 별도 저장 알고리즘을 추가하지 않았다.

주요 코드: `server/chat.ts` → `app/api/chat/route.ts`, `server/grounded-chat.ts`·`live-organization.ts` → `server/ai-usage.ts`, `GroundedConversation.tsx`, `tests/s0/probe-server.mjs`.

## 이번 실행 증거

| 검사 | 결과와 조건 |
|---|---|
| 전체 단위 | 140파일·1,260개 통과. 추가 정산 인자 검사 후 관련 3파일·33개도 통과 |
| 타입·린트·빌드 | 통과. production build `XDT6fEffcnHlL3oTZZn7o`, 빌드 뒤 수정은 테스트/문서뿐 |
| 경계·구조 | 서버 경계 26, 기능 25·domain 6·layout 3 통과 |
| 임시 PostgreSQL | 25개 계약 + 4파일·60개 통합 통과. 오래된/새/외부 공간 예약, RLS, 늦은 정산 보존 포함. 실제 서비스 DB에 합성 행을 넣지 않음 |
| 선택 자료 UI | [11개 통과](browser/grounded-checks.json). 동의 변경, 정확한 인용, 공통 원문 열기, 전송 전/후 변경, 취소, 합성 권한 철회, 잘못된 ID, 계정 전환, 390px |
| 기록 UI | [14개 통과](../workspace-nine/browser/records-checks.json). 실제 제품 저장/복원·버전·기억 제안·임시 대화·다중 폴더·계정 격리·긴 대화. SSE와 권한은 합성 |
| 일반 채팅 UI | 32개 재통과. 받은 텍스트의 점진 공개·중지·키보드·합성 조합 입력·좁은 화면. 실제 모델 지연 아님 |
| S0 | 161개 모듈 로딩·환경 파일 차단, 실제 OPFS 저장 12·복구 10·계정 저장소 4·도구 4와 새로고침/두 탭 경쟁 통과. [원자료](../s0/chrome-storage.json) |
| production HTTP/UI | [채팅 거부 5개](production/route-checks.json), [설정/지연 표시 26개](settings/settings-loading-checks.json), [6경로 각 3회·history 등 9개](performance/routes-assets.json). 보호 경로는 비로그인 redirect |
| 노출 점검 | Git 대상 소스/문서 등 1,717개에서 실제 설정 비밀 8개 값과 credential 형태 검사 0건. 전체 보안 감사는 아님. diff 공백 오류 없음 |
| dev 복구 | [로그인 화면 6회](dev-stability.json): 양식 표시6/6·재로딩0·예외0. 기존 `http://127.0.0.1:3034` 실행 중. 실제 로그인 제출 검사는 아님 |

## 지연과 긴 대화 측정

[실제 런타임 DB 읽기 전용 진단](../recording-latency/performance/database-roundtrips.json): `ap-southeast-2`에서 warm `SELECT 1` 215~217ms, BEGIN/READ ONLY/SELECT/COMMIT 861~865ms였다. [독립 트랜잭션 2개 비교](../recording-latency/performance/paired-roundtrips.json)는 순차 1,789/1,793/2,218ms, 병행 892/893/894ms다. 두 연결을 미리 준비한 작은 표본이며 실제 예약 쓰기·인증 SQL·모델 호출을 실행한 수치가 아니다. 병행 가능성을 보여 주지만 실제 채팅 개선 시간을 대신하지 않는다. 원격 DB 왕복과 공급자 첫 응답 대기는 남는다.

[긴 대화](../workspace-nine/browser/long-conversation.json): 1440px에서 이미 읽어 둔 저장 대화 100개/500개를 세 번 번갈아 열고 두 animation frame까지 측정했다. 100개는 23.2~47.3ms, 500개는 79.3~167.8ms였다. 500개 질문·답변 1,000개 표시와 390px 줄바꿈 입력이 통과했다. 디스크 초기 읽기·최대 크기 본문·장기 heap·실사용 INP·물리 IME 결과는 아니다. 아직 화면 가상화가 필요하다는 증거로 확대하지 않았다.

production 전체 JS/CSS는 49파일·3,557,453bytes다. 이전 기준 43파일·1,703,941bytes 대비 증가분에는 동적으로 불러오는 PDF 런타임/Worker가 포함된다. 전체 산출물 합계를 초기 채팅 전송량으로 표현하지 않는다. 이번 서버를 미리 실행한 로컬 lab의 비로그인 경로 기록은 로그인 체감 개선의 증거가 아니다. 완료 전 탐색의 0ms 표본은 측정 도구에서 거부하도록 고쳤다.

## 남은 경계

실제 유료 요청의 토큰 정산·첫 글자/완료 시간·배포 스트림, 인증 경로의 field INP, 큰 원본 폴더·대형/손상 PDF·장기 저장 부하와 실제 Windows 권한·물리 IME는 남았다. 사용자는 로그인 성공을 이미 확인했으며 로그인 속도는 요청대로 최하 순위다. 실제 권한창의 허용/철회는 computer-use guidance의 보안·개인정보 권한 조작 금지 때문에 자동 실행하지 않았다.

10번 실제 Windows는 부분 미검증, 11번 성능/접근성은 이번 제한된 lab만 완료, 12번 운영 준비는 로컬 검증/노출 검사만 완료다. 전체 제품 완료·운영 배포 완료가 아니다. 로컬 AI/위키/성장은 후속이며 현재 횟수 제한 제거로 해석하지 않는다.

재현은 루트 `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm test:boundaries`, `pnpm test:structure`, `pnpm build`, `node tests/database/auth-schema-check.mjs`, `node tests/browser/check-grounded-chat.mjs`, `node tests/browser/check-ai-records.mjs`, `node tests/architecture/check-s0-module-graph.mjs`, `node tests/s0/run-browser-checks.mjs`다. dev와 Prisma 생성/빌드를 병행하지 않는다. 실제 DB 진단은 `MOA_RUN_CHAT_NETWORK_READONLY=1` 명시 opt-in과 `tests/database/vitest.chat-network-live.config.mts`가 필요하다.
