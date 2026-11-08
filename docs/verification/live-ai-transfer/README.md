# 정식 TXT/MD 전송 직전 재검사·인증된 AI 요청

2026-11-08. [LT-S01~06 명세](../../specs/live-txt-md-consent.md)에 따라 로컬 준비 다음 단위를 구현했다. **실제 정식 페이지에 전송 Action을 주입하고, 원본 재검사·인증/입력/중복/사용량 경계와 제안 표시를 연결했다.** 검증에서는 개인 파일과 실제 모델을 호출하지 않았다. [코드 실행 흐름](../../reports/live-ai-transfer-reading.md).

## 바뀐 책임과 읽는 순서

1. [홈 페이지](../../../apps/web/src/app/(workspace)/page.tsx) → [LiveConversation](../../../apps/web/src/features/conversation-workspace/components/LiveConversation.tsx): Server Action 참조를 전달한다. 자료 준비와 실제 전송은 다른 버튼이다.
2. [OrganizationPreparationController](../../../apps/web/src/features/local-folders/store/organization-preparation-controller.ts): 확인 키·checking/sending/review·취소/늦은 응답·세션 실패 초기화. [SourceConnectionController](../../../apps/web/src/features/local-folders/store/source-connection-controller.ts)가 재검사 함수를 주입하고 Provider가 메모리 상태를 소유한다.
3. [connection-session](../../../apps/web/src/features/local-folders/services/connection-session.ts): 선택된 원본만 기존 snapshot/Worker로 다시 읽고 경로·전체/발췌 hash·발췌·size/mtime를 대조한다. 같은 크기/mtime라도 전체 hash가 다르면 거부한다. 기존 feature 타입 경로는 [shared/source-snapshot](../../../apps/web/src/shared/source-snapshot.ts)을 재export해 기존 소비자를 유지했다.
4. [live-ai Action](../../../apps/web/src/app/actions/live-ai.ts) → [server/live-organization](../../../apps/web/src/server/live-organization.ts): fresh workspace·Origin·strict schema·64KiB 총량·scope/경로·발췌 SHA·atomic quota. owner 입력은 세션 불일치 탐지용이다. 로컬 소유/전체 파일 hash의 진실성을 서버에서 증명했다고 취급하지 않는다.
5. [organization-generation](../../../apps/web/src/server/organization-generation.ts): 기존 샘플 정책/JSON 생성 설정을 공통 함수로 옮겼고 샘플 호출자도 재사용한다. 실제 요청의 참고/목적지는 독립 context로 전달하며 읽지 않은 참고 폴더 구조를 안다고 하지 않는다. 기존 provider의 countTokens·timeout·응답 envelope 및 organization ID/인용/날짜/안전 경로 검증을 유지한다.
6. [OrganizationSnapshotView](../../../apps/web/src/features/local-folders/components/organization/OrganizationSnapshotView.tsx) → [OrganizationResultView](../../../apps/web/src/features/local-folders/components/organization/OrganizationResultView.tsx): Google Gemini·전송 항목·짧은 문서 본문 전체 포함 가능성·한도·취소 사용량을 안내하고 결과의 근거/확인 필요/모델/토큰을 표시한다. 기존 채팅/자료 창/버튼/행/토큰을 재사용했다.

본문·요청·확인·결과는 Provider 메모리에만 남긴다. 파일 handle만 기존 계정별 브라우저 저장소다. 본문/응답 DB 보관·로그·새 스키마/의존성·자동 재시도·유료 fallback·원본 적용은 추가하지 않았다.

## 실행 근거

| 검사 | 결과와 실제 경계 |
| --- | --- |
| 새 실패 테스트 | 첫 실행: 전송 메서드 없음 10실패/서버 모듈 import 실패. 이후 세션 실패 때 비공개 상태가 남는 회귀를 1실패로 고정하고 수정. |
| 전체 단위/통합 | `pnpm exec vitest run --maxWorkers=2`: **978검사/97파일 통과**. 공급자/인증/DB는 대체. 기존 실제 limiter의 rollback 검사 포함. |
| 새 전송 UI | [browser-checks.json](browser-checks.json): **23검사 통과**. 실제 React/Provider/session/Worker/IndexedDB/OPFS, 합성 owner/권한/Action. 명시 전송·키보드 초점/Enter·같은 크기 파일 변경·취소·한도/늦은 결과·10회 자료 창·화면 재마운트·F5·owner 교체·4폭·원본 쓰기0/외부요청0. |
| 기존 로컬 준비 회귀 | [local-regression/browser-checks.json](local-regression/browser-checks.json): **28검사 통과**. 읽기/재귀/발췌/선택/조건·IME 자동 이벤트·자료 창/초점·owner/F5 유지. |
| 실제 Next Action | [production-action.json](production-action.json): 실제 HTTP에서 **비로그인 응답과 Next의 cross-origin 거부 2검사 통과**. 로그인 성공 여정이나 모델 호출은 아니다. cross-origin 500은 주입한 거부 사례의 예상 결과다. |
| 최종 Next Worker | [production-worker.json](production-worker.json): binary SHA, UTF-8 발췌/해시, invalidUTF8 거부 통과. 실제 public Worker bootstrap을 로그인 페이지에서 실행했으며 인증을 우회한 화면 검증은 아니다. |
| 타입/린트/구조/빌드 | `pnpm typecheck`, `pnpm lint`, `pnpm test:boundaries`21, `pnpm test:structure`25web/6domain/3layout, `pnpm build`52정적 생성, diff whitespace 검사 통과. |
| 공개 자산 | [client-secret-check.json](client-secret-check.json): 최종 public JS/CSS41파일에 설정된 Gemini/인증/DB 비밀값의 정확한 원문 일치0. 모든 인코딩/민감 정보 부재의 증명은 아니다. |
| 성능 | [전후54+54표본/18행과 새 흐름](performance.md). 정적 JS/CSS **1,592,204→1,598,940 bytes(+6,736 = 6.6KiB)**. guest/redirect·shared cache/n3이며 실사용 개선 주장은 하지 않는다. |

최종 build ID: `K0pIR9TcwuM-X5KNqcRgc`. 실제 실행 Node24.22.1/pnpm12.15.0, Next16.4.3/Vitest5.0.5, 설치 Prettier3.7.4로 이번에 손댄 코드만 정돈했다. source snapshot/패키지 정책은 유지했다.

초기 전체 실행은 빌드/브라우저와 겹친 상태에서 기존 auth-config의 첫 동적 import 테스트가5초 timeout(974통과/1실패)이었다. 시간 제한이나 인증 코드는 수정하지 않았다. 단독7검사와 이후 전체975, 최종978검사가 통과했으며 정확한 원인은 확정하지 않는다.

기존 로컬 브라우저 스크립트는 미리보기 클릭 직후 React 반영을 기다리지 않고 확인해 한 번 실패했다. 발췌 DOM을 기다리도록 보완했고 새 결과 디렉터리 인자를 추가했다. 초기 재실행이 이전 browser-checks.json 경로에 실패 결과를 썼으므로 해당 파일은 이번 성공 결과로 갱신하고 날짜 안내를 추가했다. 과거 성능/Worker/스크린샷과 당시941검사 요약은 현재 실행 결과로 바꾸지 않았다.

추가 키보드 검사 첫 실행은 CDP Enter의 문자 입력 누락으로 대기 시간이 끝났다. foreground/초점과 실제 Enter 문자 이벤트를 보내도록 검사 도구만 보완했고 버튼 초점·단일 전송을 포함한23검사를 최종 통과했다. 제품 키보드 이벤트를 대체하거나 `.click()`으로 성공을 만들지 않았다.

화면은 [390](result-390.png), [768](result-768.png), [1440](result-1440.png), [1920](result-1920.png). 실제 데이터 UI를 합성 공급자 응답으로 확인한 그림이며 의미 정확도 증거가 아니다.

## 재현

```powershell
pnpm exec vitest run --maxWorkers=2
pnpm typecheck
pnpm lint
pnpm test:boundaries
pnpm test:structure
pnpm build
pnpm exec node tests/browser/check-live-ai-transfer.mjs
pnpm exec node tests/browser/check-live-local-preparation.mjs docs/verification/live-ai-transfer/local-regression
# 별도 production 서버3035 실행 뒤:
pnpm exec node tests/browser/check-live-ai-action.mjs http://127.0.0.1:3035
pnpm exec node tests/browser/check-production-snapshot-worker.mjs http://127.0.0.1:3035 docs/verification/live-ai-transfer
```

## 남은 범위와 위험

- 이번 실제 모델/개인 문서 전송/공급자 청구/운영 DB quota 경합 검증0. 매번 fresh 인증을 사용하는 코드는 대체 인증으로 시험했고 실제 production은 거부 경계만 확인했다. 배포/커밋/push하지 않았다.
- 재검사와 외부 파일 변경 사이에 OS 잠금을 걸지 않는다. 읽은 시점 버전의 일관성을 확인하며, AI 결과를 원본 적용할 때는 다시 검사해야 한다. 서버도 클라이언트 전체 파일 hash나 로컬 소유를 증명하지 못한다.
- 취소는 전송 전 읽기 중단/늦은 결과 차단이다. 서버에 간 호출의 공급자 중단/환급을 보장하지 않는다. 공급자는 서버 timeout25초와 세션 만료로 제한한다.
- 요청 ID는5분 유효(+30초 미래 오차)다. 크게 틀린 클라이언트 시계는 요청 거부 원인이 될 수 있다. 같은 ID 응답 재전달 캐시는 없으며 재시도는 새 확인과 명시 전송이다.
- 실제 Windows 폴더·권한창·물리IME·field INP·장기 메모리·실제 대용량 디스크·전체 인증 여정은 미검증이다. 합성 OPFS/자동 입력을 그 증거로 쓰지 않는다.
- 날짜/혼합 기준의 후속 질문·답변 반영, 복사/이동 선택, 기존 실행 projection/원본 적용은 후속 단위다. PDF/XLSX/다중 루트로 확장하지 않았다. 전체 선택 해제 모드 유지 불일치도 별도 미해결이다.
- native executor가 설치 역할의 모델을 현재 계정에서 지원하지 않아 시작에 실패했다. 독립 에이전트 리뷰/병렬 구현 완료를 주장하지 않고 직접 구현·검사했다.
