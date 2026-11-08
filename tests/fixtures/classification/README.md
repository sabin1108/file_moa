# 분류 샘플·평가 자료 v1

작성일: 2026-11-07. 출처: 도우미가 직접 작성한 합성 문서. 외부 자료·개인 원본·비밀을 사용하지 않았다. 기대값은 사람 검토 전 초안(`reviewStatus: unreviewed`)이다.

## 구성

- [dataset.json](v1/dataset.json): 문서 ID/계열/버전, 연결 명세 ID(`specIds`), 경로, 발췌, 기대 분류/검토 여부, 금지 행동, split, 공개 샘플 후보, SHA-256.
- 총 34개: MD 16, TXT 16, PDF 1, XLSX 1.
- development 26 / holdout 8. development 중 공개 샘플 10개만 앱의 독립 카탈로그와 `/demo`에 연결했다. 앱은 이 테스트 폴더를 런타임에 import하지 않는다.
- 주제는 업무 회의·재무·개발·학습·생활·여행이다. 혼합 주제·잘못된 파일명·빈/부족한 내용·문서 안 공격 지시문을 포함한다.
- `manual-v1`은 고정 수작업 자료의 seed 표기다. 무작위 생성기를 사용하지 않았다.

문서 계열은 split 간 공유하지 않는다. holdout은 같은 작성자의 유보셋이며 독립 사용자 평가가 아니다. 파일은 저장소에 존재하므로 저장소 접근자에 대한 비공개를 보장하지 않는다. 향후 앱의 정적 자원/번들에는 공개 후보만 선택해 넣고 holdout과 기대 정답은 모델 입력에서 제외한다.

## PDF·엑셀 샘플의 범위

- `development/인수인계.pdf`: 두 페이지의 한글 회의 기록. PDF에서 텍스트를 다시 읽고 각 페이지를 렌더링해 확인했다.
- `development/학습계획.xlsx`: 한 시트의 가상 학습 항목, 숫자형 시간, `SUM(C6:C9)` 합계 10.5. 렌더링, 저장 후 셀/수식/캐시 값을 다시 확인했다. 데스크톱 Excel 재계산 검증은 별도다.
- 모델에 보낼 발췌는 페이지/셀 위치를 확인해 미리 작성한 값이다. evidence가 그 위치를 표시한다. 앱의 범용 PDF/XLSX 업로드 파서를 구현한 것은 아니다.
- 사진, 스캔/OCR, XLS·XLSM은 포함하지 않는다. 정식 파일 읽기의 TXT·MD 제한도 변경하지 않는다.

## 판정과 실행

`allowedFolderIds`는 허용 가능한 분류 후보이며 빈 배열은 검토 전용(null 대상)이다. 복수 후보/정보 부족은 검토 필요로 둔다. `forbidden`은 향후 통합/모델 평가에서 확인할 금지 결과이며, 메타데이터 존재만으로 해당 행동이 차단됐다고 보고하지 않는다.

```sh
pnpm exec vitest run apps/web/tests/local-folders/lib/ai-classification.test.ts apps/web/tests/local-folders/lib/classification-dataset.test.ts
```

위 검사는 입력/응답 계약과 자료 무결성을 확인한다. 실제 모델 정확도·속도·비용·세션 격리·파일 쓰기·일반 바이너리 파싱 검증이 아니다. 모델 호출 없이 실행한다. 사용자 대표 검토와 실제 모델 평가 결과는 별도로 기록한다.

`verify-binary-samples.py`는 Python의 pypdf·openpyxl로 PDF 페이지와 엑셀 셀을 다시 읽어 발췌 근거, 수식과 저장된 합계를 확인한다. 앱 의존성을 추가하지 않았으며 작성 환경에 이미 설치된 런타임에서 별도로 실행한다. 앱의 일반 PDF/XLSX 파서가 아니다.

`v1/pdf-pages.json`은 확인한 PDF 원본과 앱이 제공하는 페이지별 PNG의 SHA-256을 연결한다. 서버 경로 테스트에서 모든 페이지를 대조하며 엑셀의 앱 셀 표는 별도 읽기 검증 스크립트에서 원본 셀과 대조한다. 이미지 자체를 분류 입력으로 허용하는 계약이 아니다.

관련: [분류 계약](../../../docs/specs/ai-classification.md), [두 사용 구조](../../../docs/specs/workspace-modes.md).

## 대화 요청별 평가셋 — request-v2

[request-evaluation.json](request-evaluation.json)은 공개 84개 자료용 40요청과 기존 holdout 8문서용 4요청이다. 문서 수와 요청 수를 구분하며 기존 v1 문서·바이너리를 재생성하지 않는다. 요청마다 의도 그룹·범위·일치·보류·제외·본문 인용 예시·날짜·지정 목적지·금지 결과를 연결했다. `manual-everyday-v2`는 무작위 생성이 없는 고정 수작업 버전이며 기대값은 도우미 작성, 사람 검토 전이다.

12개 의도 그룹은 기간/날짜, 웹 성능, 재무, 통계/분석, 공부, 연구, 개발, 회사 업무, 개인 일정, PDF/엑셀 발췌, 자료 범위, 안전/결과 없음이다. 실제 사용자 빈도 조사로 선정한 것은 아니며 프로젝트 사용 목적에 근거한 후보 초안이다. `unsupportedCandidates` 6개는 중복 삭제·최종본·상대 날짜·개인정보 가림·OCR·허용 범위 밖 탐색의 미지원 요구로, 통과한 테스트나 모델 품질 분모에 넣지 않는다. `liveSelection`은 이번 실제 평가의 development 6요청이며 정답을 모델 입력으로 전달하는 목록이 아니다.

검토 순서는 요청 의도 → 범위 → 일치/보류/제외 ID → 본문 인용과 날짜 → 지정 목적지다. 인용 예시는 유일한 허용 인용문이 아니며 해당 문서의 다른 정확한 본문 인용도 허용한다. 폴더 이름은 각 요청에서 명시했으므로 평가에서는 그 경로와 날짜를 비교한다. 정답을 바꿀 때 이유·버전·검토 상태를 함께 갱신하고 보고서를 재생성한다. 테스트를 통과시키려고 기대값만 바꾸지 않는다.

```powershell
$env:MOA_ORGANIZATION_REPORT='1'
pnpm exec vitest run apps/web/tests/sample-workspace/organization-evaluation.test.ts
Remove-Item Env:MOA_ORGANIZATION_REPORT
```

[확장 검증 기록](../../../docs/verification/everyday-evaluation-cleanup/README.md)에서 오프라인 44요청/102검사와 실제 모델 6요청을 구분한다. 위 명령에는 API 호출이 없으며 holdout과 정답을 앱/모델 입력에 추가하지 않는다. 최초 v1 기록은 [기존 검증](../../../docs/verification/organization-evaluation/README.md)에 보존한다.
