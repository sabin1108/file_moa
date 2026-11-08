# AI 분류 계약·샘플 테스트셋 검증

후속: [샘플 작업 공간 연결 검증](../sample-workspace/README.md)에서 `/demo`의 세션·탭 보관·공통 화면을 연결했다. 분류 검증 모듈은 서버/브라우저의 공통 계약이 되어 `src/shared/ai-classification.ts`로 옮겼다. 아래는 최초 계약/자료 단계의 실행 이력이다.

검증일: 2026-11-07. 대상: [분류 계약](../../specs/ai-classification.md), [두 사용 구조](../../specs/workspace-modes.md).

## 이번 구현

- 정식 분류 입력 TXT·MD, 테스트 분류 입력 등록된 TXT·MD·PDF·XLSX. 사진·스캔/OCR·일반 바이너리 업로드 제외.
- strict 입력/응답 스키마, 서버가 공급하는 허용 폴더와의 ID/이름 대조, 샘플 등록부의 ID/이름/발췌 일치 확인.
- 문서/폴더 중복·입력량·응답 누락/외부 대상·검토 필요 검증. 검증은 파일 실행 권한이나 로그인 검증이 아니다.
- 가상 자료 34개(MD 16/TXT 16/PDF 1/XLSX 1), development 26/holdout 8, 공개 후보 10. 기대값은 사용자 검토 전 초안이다.
- PDF는 두 페이지 텍스트 추출/렌더링 확인, XLSX는 시트 렌더링과 저장 후 셀·수식·캐시 합계 10.5 확인. pypdf/openpyxl 별도 읽기 검사에서 실제 내용과 발췌 근거를 대조했다.

## 실행 결과

| 검사 | 결과 |
| --- | --- |
| 최초 계약 테스트 | 구현 파일이 없는 상태에서 실패 확인 후 구현 |
| `pnpm exec vitest run apps/web/tests/local-folders/lib/ai-classification.test.ts apps/web/tests/local-folders/lib/classification-dataset.test.ts` | 최종 17개 통과/2파일 |
| `pnpm exec vitest run --maxWorkers=4` | 전체 716개 통과/76파일 |
| `pnpm db:validate` | Prisma schema 검증 통과 |
| `pnpm typecheck` | 통과 |
| `pnpm lint` | 통과 |
| `pnpm test:boundaries` | 서버 경계 21개 통과 |
| `pnpm test:structure` | web 25/domain 6 import fixtures·layout 3 및 실제 domain 경계 통과 |
| `pnpm build` | production build 48페이지 생성 통과 |
| `verify-binary-samples.py` (기존 번들 Python 런타임) | PDF 페이지·엑셀 셀/수식/캐시와 발췌 근거 대조 통과 |

처음 `pnpm check`의 기본 동시 실행에서는 기존 `auth-config.test.ts`의 한 사례가 5초 제한을 넘겨 중단됐다(714 통과/1 실패). 같은 파일만 다시 실행한 7개 검사와 작업자 4개로 제한한 전체 716개는 통과했다. 기본 전체 실행 당시 76개 작업자가 생성됐지만 동시 부하가 정확한 원인인지는 확정하지 않았다. 테스트 제한이나 기존 인증 코드를 바꾸지 않았으며, `pnpm check` 자체가 최종 통과했다고 보고하지 않는다. 마지막 메타데이터/테스트 표현 수정 후에는 해당 17개를 다시 실행해 통과했다.

별도 읽기 전용 구조 검토에서 허용 폴더 대조 누락을 찾아 수정·재검증했다. 호출자가 항상 입력 검증 후 응답 검증을 수행하는지는 향후 실제 handler 통합 테스트로 확인한다.

## 한계와 다음 구현

실제 모델·유료 API·테스트 세션·샘플 작업 화면·일반 PDF/XLSX 파서는 미연결이다. 실제 사용자 자료/운영 DB/배포/계정/환경변수를 변경하지 않았다. 새 모듈은 현재 테스트에서 실행되며 기존 정식 문서 reader와 확장자 분류 동작은 그대로다.

기대값 구조 검사는 AI의 분류 정확도·지시문 저항성 검사가 아니다. holdout은 같은 작성자의 유보셋이며 독립 블라인드 평가가 아니다. PDF 시각 확인과 합계 캐시 확인은 실제 데스크톱 Excel의 재계산·일반 문서 호환성 보증이 아니다.

다음 단위는 테스트 세션/샘플 저장소의 격리 실패 테스트와 최소 구현, 기존 공통 계획·실행/복구 화면 연결이다. 이후 서버 권한/전송 동의·예산/동시 예약·실패·취소를 갖춰 실제 API를 연결한다.

로컬 렌더링 자료와 작성 보조 스크립트는 Git 제외 `test-results/classification/`에 보관했다. 테스트셋 본체와 읽기 검증 스크립트는 [자료 폴더](../../../tests/fixtures/classification/README.md)에 있다.
