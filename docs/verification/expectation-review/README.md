# 기대값 근거 검토·표현/실패 평가 — 2026-11-07

작업 1~2번에서 도우미가 수행할 수 있는 근거 검토와 이번 평가 묶음을 실행했고, 사용자에게 필요한 제품 기준을 물어 다음 TXT/MD 명세로 연결했다. 사람이 44개 정답을 모두 승인했다거나 전체 실제 모델 검증이 끝났다는 의미는 아니다.

## 기대값 검토

request-v2의 44요청은 문서 범위, 일치/보류/제외 ID, 정확한 인용, 날짜, 지정 목적지와 출처를 다시 대조했다. 자동 정합성/후보 검사와 별도의 읽기 전용 근거 조사, 요청 의미 검토를 구분한다. 구체적으로 우려한 기간 밖 성능 문서, 혼합 여행/업무, 만족도 결과/방법 구별에서는 기대 ID 변경 근거를 찾지 못했다.

- 10월 성능 자료: `perf-lcp` 1일치, 날짜 없는 `perf-inp/perf-network/perf-bundle` 3보류, 11월이 확인된 `perf-longtask` 제외.
- 혼합 여행: 명시적으로 업무가 섞이면 보류하라는 요청/본문에 따라 text-015 보류.
- 만족도: 만족 인원/비율이 있는 결과 두 개만 포함; 참석/설문 응답 수만 있는 행사 문서는 제외.
- 날짜 의미: 보고서 사례에 작성일뿐 아니라 보고일/보고 기준일이 있어 ‘작성일’을 엄밀히 해석하면 정책 선택이 필요함을 발견했다. 사용자는 기본 날짜 후보에는 포함하되 실제 기준을 대화로 확인하라고 답했다. 기존 여섯 보고서 기대값은 **조건부 정리 제안**의 참고값이며, 원본 적용 전 날짜 의미 확인을 생략하는 근거가 아니다.

기대값을 모델 출력에 맞춰 고치지 않았다. fixture의 `reviewStatus: unreviewed`는 사람의 사례별 최종 승인을 받지 않았으므로 유지한다. 사용자 확인은 전역 제품 기준에 대한 것이며 44개 개별 결과의 정답 승인과 구분한다.

## 표현 변형과 실패 경로

[request-wording-variants.json](../../../tests/fixtures/classification/request-wording-variants.json)에 12개 의도 그룹의 동치 요청을 한 개씩 만들었다. 원래 scope/기대 ID는 그대로 두고 표현만 바꿨다. [wording-report.json](wording-report.json)은 12/12 후보 유지/예산/범위 검사를 통과한 기록이며 **모델이 모든 변형의 의미를 이해했다는 점수는 아니다**. 유보 문서/정답을 모델에 보내지 않았다.

기존 Gemini/server/store 검사와 함께 취소·늦은 응답·동의/세션/Origin·한도 거절·입력 초과·HTTP 오류·중단·잘못된 JSON·가짜 인용·범위 밖 ID·날짜/목적지 오류를 확인했다. 이 실패 경로는 mock/결정적 검사이며 실제 공급자 장애를 모두 주입한 결과가 아니다.

## 실제 실패와 지침 v4 수정

추가 실제 요청 ‘10월 성능 자료, 날짜별 정리 안 함’에서 지침 v3은 11월이 확인된 문서를 보류했다. 파서는 유효한 응답으로 받았지만 요청별 평가기는 `unexpected-hold:perf-longtask`로 실패시켰다. 날짜가 없어서 확인이 필요한 것과 기간 밖임이 확인된 것을 혼동한 사례다.

1. 서버 지침의 조건과 평가기의 오답 주입 검사를 추가해 실패를 고정했다.
2. 지침 v4에 확인된 기간 밖 문서는 제외하고 날짜 불명/충돌만 보류하도록 명시했다. 제안을 실제 파일 정리 완료로 표현하지 않도록 요약 조건도 추가했다.
3. 같은 요청으로 새 실제 응답을 한 번 검증하여 1일치/3보류/11월 제외, date:null과 성능 테스트 목적지가 기대값과 일치함을 확인했다. 요약도 ‘정리하는 제안입니다’로 나왔다.

| 구분 | 결과 | 입력 / 출력 토큰 | 전체 ms |
| --- | --- | ---: | ---: |
| [v3 실패 원자료](../organization-evaluation/live-october-performance-no-date-folders-2026-11-07T09-34-37-884Z.json) | 기간 밖 1문서 불필요 보류 | 2,722 / 334 | 5,219 |
| [v4 재검증](../organization-evaluation/live-october-performance-no-date-folders-2026-11-07T09-37-40-802Z.json) | 기대값 일치 | 2,822 / 332 | 7,143 |

이번 실제 생성 2회/countTokens2회, 총 6,210토큰. 원자 DB/전역·세션 한도/타임아웃/토큰 상한을 유지했고 자동 생성 재시도·유료 fallback·한도 우회를 하지 않았다. 이번 세션에서 관측한 앞선 평가까지 생성 총12회다. 추가 호출은 여기서 끝냈으며 남은 44요청 전체의 실제 출력은 실행하지 않았다. 요금/공급자 전체 장애 상태를 측정하지 않았다.

현재 v4 실제 검증은 위 한 요청이다. 이전 v3로 통과한 여덟 고유 요청을 v4 전체 품질로 재분류하지 않는다. 정책 소스 해시와 응답 파일을 구분해 보관한다.

## 다음 명세로 반영한 사용자 요구

[정식 TXT/MD 명세 초안](../../specs/live-txt-md-consent.md)의 LT-001~006에 반영했다.

- 연결된 전체 범위를 후보로 둘 수 있고 필요한 범위를 대화로 확인한다. 검색 범위·참고/정리 기준·목적지를 분리한다.
- 복사/이동은 계획 검토에서 선택한다.
- 여러 주제로 애매한 문서는 마지막 확인 필요 목록에 모아 묻는다.
- 날짜는 실제 확인 가능한 근거를 후보로 제시하고 사용자 의도를 질문한다. 사용자가 든 예시를 고정 선택지로 만들지 않는다.

현재 원본 읽기는 MD/TXT·권한·크기·UTF-8·취소 경계를 재사용할 수 있지만, 정식 채팅의 snapshot/동의/인증된 AI handler는 아직 연결되지 않았다. 전체 연결 범위와 실제 전송량은 다르며 한도에 걸려 일부만 읽었을 때 전체 분석 완료를 주장하지 않는다. 명세의 LT-T01~12는 앞으로 구현할 수용 기준으로, 통과한 테스트 수에 넣지 않는다.

## 재현과 한계

```powershell
$env:MOA_ORGANIZATION_REPORT='1'
pnpm exec vitest run apps/web/tests/sample-workspace/organization-wording.test.ts apps/web/tests/sample-workspace/organization-evaluation.test.ts apps/web/tests/server/sample-organization.test.ts apps/web/tests/server/gemini-classification.test.ts apps/web/tests/server/sample-ai.test.ts apps/web/tests/sample-workspace/sample-store.test.ts
Remove-Item Env:MOA_ORGANIZATION_REPORT
```

관련 159검사, 전체 91파일/922검사(`--maxWorkers=4`), 타입·린트·서버 경계21·구조25web/6domain/3layout·production build52 통과. `git -c core.safecrlf=false diff --check`도 통과했다. 실제 파일 AI 전송/쓰기·배포·새 UI는 이번에 활성화하지 않았다. 현재 v4 한 요청의 성공은 반복 재현성·전체 한국어 표현·모든 보류 의미·모든 날짜 해석의 보장이 아니다. 명세 확인 질문은 실제 사용자 요구를 반영했지만 정답 fixture의 사람 승인 상태는 계속 분리한다.
