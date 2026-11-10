# 지연과 장기 세션 관찰 준비 결과

2026-11-10. 사용자의 설명 자료 작성 후 다음 작업 재개 요청에 따라 최신 인수인계의 지연·장기 사용량 관찰 준비를 진행했다. [실행 계획](../../planning/runtime-observation.md)은 준비된 절차이며 실사용 측정 완료가 아니다.

## 이번에 완료한 일

- 실제 `chat.ts`의 시간 측정 시작점·종료점과 로그 항목을 확인했다. 서버 첫 공개 시각을 브라우저 첫 표시로, 원장 정산 뒤 elapsed를 화면 완료 시간으로 오해하지 않도록 정의했다.
- `ai-usage.ts`, Prisma `AiUsageEvent`, `shared/ai-usage.ts`를 확인해 `reserved/completed/unknown`, 최근50개 조회 한계, 비용 추정과 청구 대조의 차이를 기록했다. 사용량 조회의 오래된 예약 정리 쓰기도 명시했다.
- 실제 로그인/권한/IME와 모델 호출 없는 경로를 먼저 확인하고,0/15/30/60분 장기 관측으로 넘어가는 절차·중단 조건·개인정보 없는 기록 양식을 준비했다.
- 기존 모의 단위 검사5파일39개를 새로 실행해 모두 통과했다. 실제 DB·모델 호출은 없다.

```text
pnpm exec vitest run apps/web/tests/server/chat.test.ts apps/web/tests/server/chat-usage-lifecycle.test.ts apps/web/tests/server/chat-authorization-cost.test.ts apps/web/tests/server/ai-usage.test.ts apps/web/tests/shared/ai-usage.test.ts --maxWorkers 2
```

## 현재 세션의 기존 짧은 표본

직전 재개 검증에서 생성한 `.omx/verification/resume-20261110/records/long-conversation.json`을 다시 읽어 조건을 확인했다. 이번 준비에서 같은 브라우저 검사를 반복 실행하지 않았다.

| 합성 저장 대화 | 이미 읽힌 기록의 표시 시간3개 표본 |
| --- | --- |
|100 turn |144.1 / 51.2 / 51.1ms |
|500 turn |278.3 / 353.0 / 211.3ms |

1440px 격리 Chromium·제품 repository/OPFS에서100/500 turn을 번갈아 열어 두 animation frame까지 측정했다. 최종 대화 article 수는500 turn의1000개이며 과거 열기가 계속 누적되지는 않았다. JS heap은 시작19,636,240bytes, 마지막45,198,892bytes였다. GC 비통제·6표본뿐이므로 메모리 증가 원인을 판정하거나 장기 누수 검증 통과로 표현하지 않는다. 디스크 최초 읽기·브라우저 전체 메모리·실사용 INP·안정된 분위수 측정이 아니다.

## 아직 실행하지 않은 일

실계정 소셜 복귀, 실제 Windows 권한, 물리 한글 입력, 브라우저+원격 DB+실모델을 합친 전체 지연, 실제60분 세션, 최신 모델 단가/청구 대조는 남아 있다. 제품 코드·DB 스키마·실계정·개인 파일은 변경하지 않았고 새 유료 AI·배포·커밋/푸시도 실행하지 않았다.
