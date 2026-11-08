# 요청별 검색·응답 검증 — request-v1

현재 평가셋은 [request-v2 일상 요청 확장](../everyday-evaluation-cleanup/README.md)이다. 이 문서는 최초 v1 20요청의 결과를 보존한다.

2026-11-07 오프라인 검증 단계. 기존 샘플과 함수를 재사용해 평가 자료·판정기·검사를 추가했다. 이 단계에서는 제품 동작·후보 함수·Gemini 지침·의존성을 변경하지 않았다. 후속의 지침 v3 수정과 실제 API 결과는 [실모델 평가](live-evaluation.md)에서 구분한다.

## 자료와 판정

| 구분 | 문서 수 | 요청 수 | 필수 일치·보류 ID 수 | 후보에 남은 수 |
| --- | ---: | ---: | ---: | ---: |
| development | 공개 샘플 84 | 16 | 33 | 33 |
| holdout | 기존 유보 문서 8 | 4 | 5 | 5 |

ID 수는 요청별 합계이며 고유 문서 수가 아니다. 필요한 ID의 후보 회수율은 두 split에서 각각 1.0이다. 이는 모델의 정답률·precision이 아니다. 후보 검색은 무관한 자료도 포함할 수 있고, 후속 모델이 최종 일치/보류를 판단한다. 특히 유보 문서 8개는 모두 후보 예산 안에 들어가므로 그 회수율로 대규모 검색이나 일반화 성능을 주장할 수 없다. 유보 결과를 보고 제품 검색 함수를 튜닝하지 않았다.

보고서: [retrieval-report-v1.json](retrieval-report-v1.json). corpus 해시는 정렬한 ID·이름·본문 발췌·출처 경로의 SHA-256이다. 바이너리 자체 해시 검증은 기존 fixture 검사를 유지한다. 기대값은 `reviewStatus: unreviewed`인 도우미 작성 초안이며 사용자의 정답 승인이나 독립 평가가 아니다.

보고서의 글자 수는 기존 후보 함수와 같은 6,000자 사전 추정값이다. 각 요청은 최대 40후보도 지켰다. 실제 공급자 토큰 수를 측정한 것이 아니며 서버의 8,192토큰 countTokens 검사는 그대로 필요하다.

## 무엇을 검사했는가

- 10월 보고서 6개와 날짜 불명/충돌 2개, 파일명보다 본문 날짜, 월 제한 없는 웹 성능 실측 5개.
- 채널 매출, 방문 실적과 지표 정의의 구별, 통계 계산, 학교 모의 연구, 공부 목표, 개발 문서.
- 검증된 PDF/XLSX 발췌 근거, 선택한 자료만 분석, 폴더 하위 범위, 해당 자료 없음, 문서 속 공격 지시문.
- ID/정답 split·해시·범위·기대값의 완전성, 필수 후보 누락, 최대 후보/글자 예산.
- 판정기 13검사: 누락, 잘못된 안전 경로, 조작 인용, 범위 밖 ID, 중복 ID, 경로 탈출, 없는 날짜, date:null 날짜 폴더, 무관하지만 실제 인용인 응답, 불필요한 보류, 필요한 보류 누락, 대체 본문 인용 허용, 불필요한 날짜별 정리.

기대 응답을 직접 만들어 파서를 통과시키는 검사는 fixture 정합성 검사다. 별도로 잘못된 응답을 주입해 평가기가 그 오답을 거부하는지 확인했다. `forbidden`의 원본 쓰기·명령 실행 금지는 이번 검사로 실행 경계 전체를 검증한 것이 아니다. 실제 상태·서버·원본 쓰기 보호는 기존 개별 테스트의 책임이다.

## 읽을 파일과 재현

1. [request-evaluation.json](../../../tests/fixtures/classification/request-evaluation.json): 요청/범위/기대값/금지 결과.
2. [organization-evaluation.ts](../../../apps/web/tests/sample-workspace/organization-evaluation.ts): 기존 파서로 ID·인용·날짜·경로를 검증한 뒤 요청별 기대 일치·보류·지정 목적지와 비교한다. 인용은 fixture와 같은 문장일 필요 없이 실제 본문의 정확한 부분 문자열이면 된다.
3. [organization-evaluation.test.ts](../../../apps/web/tests/sample-workspace/organization-evaluation.test.ts): 무결성·후보·오답 주입·보고서 생성. 테스트용 파일로 런타임에 연결하지 않았다.

```powershell
$env:MOA_ORGANIZATION_REPORT='1'
pnpm exec vitest run apps/web/tests/sample-workspace/organization-evaluation.test.ts
Remove-Item Env:MOA_ORGANIZATION_REPORT
```

54검사 통과. `MOA_ORGANIZATION_REPORT=1`일 때만 저장소 안 고정 경로의 보고서를 갱신한다. 일반 전체 테스트는 보고서를 쓰지 않는다. 모델·네트워크·개인 파일·DB를 사용하지 않는다.

전체 검사 `pnpm test`의 첫 실행은 856통과/1실패였다. 기존 `auth-config.test.ts`의 잘못된 Origin 거부 사례 하나가 5초 제한을 초과했다. `pnpm exec vitest run --maxWorkers=4` 재실행은 90파일/857검사 통과했다. 실행 병렬도에 따른 환경 영향 가능성이 있지만 원인은 확정하지 않았고, 기존 인증 코드·테스트·기본 제한 시간은 수정하지 않았다.

최종 판정기의 통과 여부를 `passed` 하나로 반환하도록 정리한 뒤 전체 857검사와 타입·린트를 다시 통과했다. 서버 경계 21, 구조 25 web/6 domain/3 layout 검사, `git diff --check`, production build(52개 정적 페이지)가 통과했다. 빌드 ID는 `0A599ioWvZKaYH50TUxPG`다. 최종 빌드의 static/server JS에서 `request-v1`, `manual-request-v1`, `text-025`, `text-031`, `holdout-only` 문자열이 발견되지 않았다. 이는 선택한 식별자의 번들 검사이며 모든 정보 유출 가능성의 증명이 아니다.

## 남은 검증

이 오프라인 단계의 실제 Gemini 호출은 0회다. 후속 대표 두 요청의 실제 토큰·지연·의미 판정은 [실모델 평가](live-evaluation.md)에 기록한다. 전체 요청의 AI 정확도·비용·문서 안 공격 지시문 저항·보류 이유의 타당성은 아직 확정하지 않았다. PDF/엑셀은 기존 원본과 대조한 발췌를 사용했으며 범용 업로드 파서를 추가하지 않았다. 브라우저·디자인 변경은 없으므로 이번에는 UI 측정을 반복하지 않는다.

다음 단계에서는 development의 대표 요청부터 무료 호출 한도 안에서 실제 응답을 수집하고 같은 평가 함수로 비교한다. 모델 입력에는 요청과 선정된 문서만 보내고 기대값·유보 문서를 보내지 않는다. 정식 개인 TXT/MD의 전송 동의·실행 연결과 배포는 후속 작업이다.
