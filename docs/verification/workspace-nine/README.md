# 1~9번 구현과 검증 — 2026-11-09

2026-11-09 후속 검증: [최신 보고서](../follow-through/README.md)를 함께 확인한다. 정산 수명/오래된 예약/잘못된 인용을 수정했고 전체1,260개·임시DB25+60·자료UI11·기록14·일반채팅32·설정26·S0가 통과했다. 100/500개 대화와 SELECT-only 지연을 측정했으며 실제 유료 정산/속도와 Windows 권한창은 미검증이다.

사용자 승인: 직전 작업 목록1~9 계속 실행, PDF `pdfjs-dist@6.5.438` 추가. 2026-11-09 설명 후 사용자가 사용량 테이블의 실제 DB 적용과 로컬 활성화를 승인해 반영했다. 리전 이관·추가 유료 평가·실제 사용자 삭제·배포는 수행하지 않았다. 제품 전체 완성 선언이 아니다.

## 구현 결과

| 번호 | 결과 | 한계 |
|---|---|---|
| 1 | 기존 중복 인증 제거·quota SQL 일괄 예약·숫자 단계 진단을 보존하고 스트림 회귀 32개 확인 | [실제 지연 분석](../recording-latency/README.md)의 원격 DB 왕복 약900ms와 공급자 대기 잔여. 수정 뒤 실모델 재측정 없음 |
| 2 | 내 AI 폴더·대화 자동 저장/목록/새 대화/복원/삭제·임시 모드·충돌/tombstone 연결 | 물리 권한창·프로세스 강제 종료·외부 프로그램 실경합은 미검증 |
| 3 | 선택 발췌 질문용 별도 action, 전후 원본 재검사, 인용 ID/정확한 문장 검증·원문 열기 | 공급자 응답은 mock 검사. 실제 근거 정확도 평가와 해당 UI 전체 여정은 미실행 |
| 4 | 답변→초안 편집·자동/직접 저장·확정·버전 불러오기·MD/TXT 내보내기 | 내보내기의 실제 OS 다운로드 확인은 미실행 |
| 5 | 직접 프로필·제안/승인/비활성 기억·범위 편집·명시적 전송 선택 | 자동 추출/개인 모델 학습 없음 |
| 6 | stable ID의 복수 자료 연결·활성화/개별 해제·legacy/새로고침·계정 격리 | 합성 OPFS/IDB 검사이며 실제 개인 폴더 권한창 검증은 별도 |
| 7 | 로컬 PDF 본문/쪽 표식/상한/제외 사유, 제한된 로컬 색인·갱신·전체 성공 후 삭제·개별 해제 정리 | OCR·벡터 검색 제외. 실제 PDF 검사는 합성 1쪽으로 대형·악성·복잡한 표를 대표하지 않음 |
| 8 | 최소 원장 schema/migration·중복 정산 방지·RLS·조회·남은 한도/대기·검증 단가의 예상 비용. 실제 DB 적용·로컬 활성화 확인 | 실모델 토큰 정산·속도는 미검증. Gemini와 미등록 snapshot 단가는 미확인으로 표시 |
| 9 | 확인 메일/최근 인증/동일 세션 토큰·원자 삭제/공유 잠금·연결 계정 차단·cascade·로컬 파일 유지 | 실제 사용자 삭제·실제 메일·Kakao 재개 없음 |

## 실행한 증거

- 전체 단위/서비스 검사: 139파일 1,253개 통과. 마지막 관련 29개·타입·린트·Next build도 통과했다. 최종 production build는 `5USxhNMaxqMpduO94ViCL`이다.
- 타입·린트·Next production build 통과. 서버 경계 26개, 구조 25+6+3개 통과. 실제 네트워크/보안/OS 권한 전체를 대신하는 결과는 아니다.
- 임시 PostgreSQL17: migration 적용/재적용·drift·RLS 등 25계약과 서버 4파일59개 통과. 신규 사용량 격리/한 번 정산 및 계정 삭제 cascade·다른 사용자 보존·잘못된 토큰 보존·계정 연결과 삭제의 실제 advisory lock 경합을 포함한다. 운영 env 대신 localhost fixture DB만 썼다.
- [기록 브라우저 12개](browser/records-checks.json): 실제 제품 React/서비스 + 격리 OPFS/IDB + fixture SSE. 저장/새 대화/재열기/재생성0/결과물 버전/기억 제안/390px/새로고침/임시 제외/다중 폴더/원본 hash/계정 격리/예외0. 물리 IME·개인 파일·실제 AI는 사용하지 않았다.
- [실제 PDF와 색인](browser/pdf-local.json): 실제 PDF 바이트를 제품 outer Worker→PDF.js nested Worker로 추출, 1쪽/HelloPDF/쪽 표식, 추적한 http(s) 요청 모두 같은 origin, 예외0. 실제 IDB의 hash 교체·root 격리·취소 guard 거부·누락/범위 정리 확인. CSP로 외부 자산도 차단했다.
- [일반 채팅 32개](general-chat/checks.json): 실제 UI/hook/reducer/fetch, fixture SSE, 10회 자료 왕복·키보드/합성 조합 입력·부드러운 공개·중지/세션 등. 현재 실제 TTFT 개선 수치로 표현하지 않는다.
- [자료 검색 51개](search-regression/browser-checks.json): 기존 자료 찾기·근거·미리보기·정리 준비·부분 실패·계정 전환 회귀. PDF 지원 뒤 미지원 fixture를 BIN으로 분리하고 문구를 갱신했다. 실제 포인터 검사는 스크롤 뒤 두 프레임과 hit target을 확인해 클릭 중 scroll 이벤트로 선택 보호가 작동하는 인공 경합을 피했다.
- 실제 Next production chat 거부 5개, guest 보호 경로·공개 샘플 6경로 각3회 및 history 9개 통과. QA 포트3035와 실제 신뢰 origin3034를 분리해 검사했다. 마지막 label 수정 전 `TGT59HTLZ11AWbUf4zvQg` 빌드에서 측정했으며 인증 후 사용 경로가 아니다.
- dev 서버를 `http://127.0.0.1:3034`에 복구했다. 실제 dev 로그인 probe 6회에서 재로딩0·양식 표시6/6·예외0을 확인했다. 기존 사용자의 email/social 로그인 성공 확인과 자동 guest 검사를 구분한다.

## 읽을 코드 순서

1. `shared/ai-records`, `shared/grounded-chat`, `shared/personal-context`: 입력/복원/승인·인용 계약.
2. `features/ai-records/services/record-store` → `ai-record-repository`: 기존 S0 저장 알고리즘을 제품으로 옮겨 hash/head/owner/잠금/삭제를 연결. S0 tests는 제품 구현을 재내보내 중복 알고리즘을 줄였다.
3. `AiRecordsController` → `useConversationRecords` → `AiLibraryPanel`/`RecordEditor`: 검증 성공 후 상태 게시, 대화 열기 전 저장, 문서·기억별 편집.
4. `GroundedConversation` → `app/actions/live-ai` → `server/grounded-chat`: 선택 발췌 동의와 전후 재검사, 인증·공유 quota·구조화 생성·인용 검사.
5. `connection-session`/`handle-repository` → `source-snapshot`/`copy-hash.worker`/`pdf-text`/`local-text-index`: root 식별과 원본 읽기·Worker·재생성 캐시.
6. `server/ai-usage`, migration 및 `auth-account-deletion`: 운영 메타데이터와 DB 원자성. 본문 저장은 없다.

## 성능과 비용

기존 채팅 회귀와 신규 기능 비용을 구분한다. PDF 라이브러리는 PDF 요청 때 동적 로드되며 정적 산출물 증가는 초기 채팅 전송량과 같지 않다. 이번 UI 검사는 로컬 Chromium lab이고 실제 인증 경로 INP/운영 부하/장기 heap은 미측정이다. 측정 production guest 경로와 전체 정적 자산은 `performance/routes-assets.json`에서 별도 확인한다. 해당 빌드는 JS/CSS 49파일 3,556,848bytes로 이전 자료 43파일 1,703,941bytes보다 1,852,907bytes 늘었다. 주로 PDF 런타임/Worker이며 이는 전체 산출물 합계다. 초기 채팅의 전송량 증가로 그대로 환산하지 않는다. 로그인 redirect 표본은 TTFB 첫109ms, warm20/10ms이며 사용자 체감/인증 경로의 개선 수치가 아니다.

예상 비용은 2026-11-09 확인한 표준 텍스트 단가만 사용한다. GPT-6 Luna 입력 $0.10/출력 $0.50 per million, 캐시 할인·지역 추가 요금·실제 청구서와 구분한다. 근거: [OpenAI 모델 문서](https://developers.openai.com/api/docs/models/gpt-6-luna). Gemini 공식 문서는 이 검증 환경에서 본문 조회에 실패해 추정 단가를 넣지 않았다.

## 활성화와 재현

설명 뒤 사용자 ‘이건 추가해도 되겠다’ 승인을 반영했다. 적용 직전 pending 목록이 `20261109010000_ai_usage` 한 개임을 재확인하고 `prisma migrate deploy`를 실행했다. 적용 후 status는 전부 최신이며 migration SHA-256은 `c161dccbf629f51cca1da8a4677320cd7f07a41911efcf7281f58dd8240f6d36`이다. 로컬 `.env.local`의 `AI_USAGE_LEDGER_ENABLED=true`와 dev 재시작을 완료했다. 배포 환경의 flag는 변경하지 않았다.

[실제 runtime 읽기 검증](usage-activation.json)은 READ ONLY 트랜잭션에서 RLS enabled/forced, 사용자 문맥 없는 조회0행, PUBLIC 및 API 역할 권한0, 승인한 메타데이터 컬럼만 존재함을 확인했다. 원장에 합성 사용량을 넣거나 실제 AI를 호출하지 않았다. [재시작 후 dev 검사](usage-activation-dev.json)는 로그인6/6·재로딩0·예외0이다. 실제 AI 요청의 토큰 정산·응답 속도는 아직 미검증이다. 이전 요청은 소급 정산하지 않고 대화/기억/결과물 본문은 로컬 폴더에 유지한다. 롤백은 우선 flag=false이며 원장을 임의로 drop하지 않는다.

사용자는 최종 제품 단계에서 AI 횟수 제한을 없앨 방향을 추가했다. 이는 지금 제한을 해제하라는 요청이 아니므로 현재 계정/공간10회와 기존 공유 한도는 유지했다. 제거 시점은 별도 후속이다.

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm test:boundaries
pnpm test:structure
pnpm build
node tests/database/auth-schema-check.mjs
node tests/browser/check-ai-records.mjs
node tests/browser/check-pdf-local.mjs
node tests/browser/check-general-chat.mjs docs/verification/workspace-nine/general-chat
```

DB 검사는 기존 pinned PostgreSQL Docker 이미지와 Docker 권한이 필요하다. Dev 서버 실행 중에는 build/typecheck의 Prisma 생성을 병행하지 않는다. 검증 후 개발 서버를 새로 실행하고 로그인 안정성 probe를 확인한다.
