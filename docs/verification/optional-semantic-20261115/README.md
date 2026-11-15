# 선택 설치형 로컬 의미 검색 — 2026-11-15

사용자는 다운로드 부담과 선택 이유를 논의한 뒤, 자료 찾기에서 선택해 사용하고 폴더 설정에서 관리하는 방식의 구현을 승인했다. 기본 검색을 유지하면서 설명 문장과 필수 조건을 분리한 의미 후보를 추가했다. 채팅 설정에는 모델 관리를 추가하지 않았다.

## 동작과 읽을 코드 순서

1. `SemanticModelPanel`을 자료 찾기와 폴더 설정에서 공유한다. 설치 전에 약150MiB 다운로드·수백MiB 실행 메모리·첫 준비 지연을 안내한다. 설치만으로 폴더를 읽지 않는다.
2. Provider의 `SemanticModelController`는 명시 설치/추론 때만 Worker를 만든다. 설치 상태 확인은 모델 SDK나 원격 AI를 호출하지 않는다. 중지·재시도·삭제와 탭 간 모델 상태를 관리한다.
3. `semantic.worker.ts`는 고정 공개 파일만 받는다. 전체 크기·SHA-256 검사 뒤 SDK에 반환한다. SDK의 cache write 실패가 무시되는 동작에 의존하지 않는다. 실행 파일 URL에도 hash를 넣어 새 버전과 오래 캐시된 파일이 섞이지 않게 한다. 추론 중 누락 파일은 원격으로 재설치하지 않는다.
4. `prepareSourceSemantic`은 시작 모델 stamp와 scope epoch를 잡고, 기존 원본 읽기/해시/파싱을 수행한다. 선택 범위의 현재 경로만 캐시에서 읽고 구간별 벡터를 저장한다. `semantic-source.ts`와 `LocalTextIndex`가 계정·작업 공간·연결·현재 파일 hash·parser/model 버전을 검증한다.
5. `confirmSemanticQuery`는 사용자가 설명 문장과 필수 조건을 직접 구분하고 확인해야 검색을 허용한다. +검색어·따옴표 문구·제외·형식·경로·명시 기간은 유지한다. 설명의 단어를 필수에서 자동으로 지우지 않는다.
6. 기존 기본 검색은 설명까지 단어로 검사한 후보를 제공하고, Worker는 의미 점수와 전체 본문의 필수/날짜 근거를 계산한다. 현재 원본과 맞는 후보만 합치며 의미 후보·본문 위치·일부 준비 여부를 표시한다. 낮은 점수를 억지로 상위 결과로 채우지 않는다.
7. 결과 선택→질문 준비는 기존 다시 읽기·발췌 미리보기·별도 전송 동의를 따른다. 의미 검색 설치가 원격 질문 해석이나 선택 자료 전송에 대한 동의가 되지 않는다.

명세: [SEM-01~08](../../specs/optional-semantic-search.md). 주요 소스는 `apps/web/src/features/local-folders/search/semantic/`, `search/documents/local-text-index.ts`, `connection-session.ts`이다. UI·상태·Worker·순수 조건·저장소를 기존 책임에 맞춰 나눴다.

## 검증

- 전체 단위 테스트172파일/1,509개. 새 조건·무결성·벡터·중간 삭제·확인 초기화·부분 준비 검사를 포함한다. 범위와 무관한 전체 본문 캐시 읽기를 금지한 두 테스트가 실패하는 것을 확인한 뒤 경로별 기존 `readPath` 재사용으로 통과시켰다. 다른 탭의 설치 잠금에 검색이 기다리지 않는 회귀도 실패→수정으로 확인했다.
- 실제 Chromium IndexedDB79개 assertion: owner 격리, clear/모델 삭제 뒤 늦은 저장 거부, 500문서/4,096구간 상한, 같은 경로 교체, 삭제 경로 정리와 통계 보존. 개별 capacity write assertion을 독립 시나리오79개로 부풀리지 않는다.
- Ego에서 공개 모델 설치, 설치만으로 본문 읽기0, 합성 폴더17개 준비, 뜻이 다른 표현의 ‘빵 반죽’ 후보, 바뀐 원본의 벡터 제외, 다른 탭 모델 삭제와 준비 경합, 모델 없는 기본 검색3개, 삭제 후 선택 범위1개 재준비를 확인했다.
- 390/768/1440/1920px 결과 DOM의 가로 넘침 없음, 키보드 검색, 합성 IME Enter 차단, 선택 자료1개 질문 준비와 동의 미선택을 확인했다. 실제 외부 답변 생성은 수행하지 않았다.
- Ego 화면 캡처는 제한 시간 안에 응답하지 않아 중단했다. 별도 일회용 브라우저에서 실제 기본 미설치 설정 화면을 같은4폭으로 캡처·확인했다. 화면 모형을 실제 모델 검증으로 대신하지 않았다.
- 기존 검색/RAG37개, 필드 검색21개 회귀. typecheck/lint, 서버 경계26개, web/domain32/6개와 layout3개, S0 모듈180개, 프로덕션 빌드를 확인한다. S0 도구에는 공개 실행 manifest 한 파일만 JSON 모듈로 허용했고 환경 파일 차단을 유지했다.
- 실제 최적화 Next Worker에서 설치 전 누락 오류와 설치 뒤384차원 합성 질문 추론을 확인했다. 서버 추적 파일에 Node 전용 ONNX/Transformers 경로가 포함되지 않았다.
- 최종 Worker에서 본문 근거 반환까지 확인했다. 모델 잠금을 계속 잡은 상태에서도 검색은 기본 결과로 돌아왔고, 이미 실행 중인 Worker가 있는 상태에서 공개 실행 파일 캐시를 지워도 명시 재설치→384차원 질문이 복구됐다. 최종 구조 검토는 CLEAR다.

새 유료 AI 호출은0회다. 개인 폴더 전체나 개인 본문을 평가/전송하지 않았다. 합성 OPFS 파일의 테스트용 변경은 원문을 복원했다. 제품 경로의 원본 쓰기는0이었다.

## 품질과 비용

[고정 합성 평가와 비용 요약](evidence.json)을 함께 본다. 직접 작성한22문서/19질문, seed20261115와 기존 dev8/holdout11을 유지했다. 설명 전용 시나리오에서 사용자가 필수 단어를 비우고 확인한 선택을 fixture ID로 고정했다. threshold0.85는 기존 dev 점수에서 정했으며 holdout에 맞춰 변경하지 않았다. 실제 브라우저 Worker/WASM의 짧은 문서 벡터로 비교했다. PDF의 합성 원문은 이 비교에서 직접 Worker에 넣었으므로 이 결과는 PDF 추출 검증이 아니다.

| 지표 | 기존 단어 검색 | 선택 의미 검색 결합 |
| --- | ---: | ---: |
| dev Recall@5 / MRR | 0.857 / 0.857 | 1.0 / 1.0 |
| holdout Recall@5 / MRR | 0.6 / 0.6 | 1.0 / 1.0 |
| 지정 금지 문서 노출 | 0 | 0 |
| 관련 문서 없는 질문의 후보 | 0 | 0 |

이는 작은 작성자 평가셋에서 확인한 이득이다. 독립 공개 벤치마크나 실제 사용자 자료 전반의 정확도를 뜻하지 않는다. 이전 raw embedding의 금지 후보12회는 지정 문서가 top5에 나온 횟수이며12가지 규칙을 뜻하지 않았다. 이번에는 확인한 필수 조건과 점수 하한을 함께 적용했다.

모델/토크나이저/설정135,138,424bytes에 실행 파일21,640,503bytes를 합쳐156,778,927bytes, 약149.5MiB다. 화면은 약150MiB로 안내한다. SDK의 지연 로딩 JS는 별도 앱 asset이며 모델 가중치는 서버/저장소에 올리지 않는다.

이 검증 기기에서 최적화 Worker 설치+질문은 약6.6초, 이미 설치된 모델의 새 Worker 초기화+짧은 질문은 약1.4~1.7초, 재사용 질문은 약20~35ms였다. HTTP 캐시·네트워크·기기에 따라 달라지며 다운로드 시간 보장은 아니다. 짧은20문서 벡터 준비 약2.35초와 긴 합성 문서64구간 준비23.76초를 구분한다. 실행 중 취소는 약82ms에 응답했다.

실제 브라우저의 짧은 질문에서 관측한 WASM 선형 메모리 buffer 최댓값은345,309,184bytes, 약329.3MiB다. JS heap·토크나이저·모델 응답 복사·캐시 버퍼·브라우저 전체는 포함하지 않아 전체 peak RAM으로 보고하지 않는다. 메모리가 적은 기기의 실행 가능성은 미검증이다.

최대4,096벡터 IndexedDB 읽기/검증은 약10.6~12.6ms, Worker 점수 계산44.7ms였고 해당 측정의 main thread50ms 이상 task는0개였다. 본문10만 날짜의 필수 조건 검사는 Worker에서 약237ms, 관측 main long task0개였다. 선택 범위의 본문만 경로별로 읽고 의미 후보의 본문 검사도 Worker에 두어 전체 연결 캐시 복제나 큰 정규식 처리가 화면 thread에 몰리지 않게 했다.

게스트11경로×2폭×3회,66표본에서 자동 모델 다운로드 요청은0이었다. [성능 기록](performance.md)은 공용 빌드 asset과 최초 전송, 게스트 리다이렉트와 인증 검색, lab task와 field INP를 구분한다.

## 한도와 남은 범위

읽기 범위500문서/50MiB, 본문 파일2MiB, 자료당64구간, 연결당4,096구간,384차원이다.512토큰을 넘기지 않게 본문 구간을 나누며 긴 문서는 일부만 준비될 수 있다. 벡터 값만 최대6MiB이며 경로/키/통계/본문 캐시 저장은 별도다. 한도 밖 자료를 전부 분석했다고 표시하지 않는다. 폴더 준비 상태는 저장된 수이고 현재 원본과의 일치는 검색 시 다시 확인한다.

파일 권한 상실·부분 탐색을 삭제로 취급하지 않는다. 성공한 전체 탐색에서만 삭제 경로의 파생 벡터를 정리한다. 기기 색인 clear는 현재 연결의 본문/목록/체크포인트/벡터/통계를 원자적으로 지우고 epoch를 바꾼다. 모델 삭제는 이 origin의 전용 Cache와 모든 연결의 의미 벡터만 지운다. 원본·AI 기록·다른 앱 Cache는 유지한다.

전체 사이트 오프라인 제공, 실제 OS 폴더 권한 UI, 물리 IME, 저사양/모바일 실기기, 전체 peak RAM, 독립 실제 문서 품질, 전체 원문을 사용하는 원격 RAG 답변의 성공은 미검증이다. 질문 준비 시 표시한 발췌가 전송 범위이며, 긴 문서 전체를 읽은 답변으로 취급하지 않는다.

## 의존성·재현

Transformers.js3.8.1과 ORT Web1.22.0-dev.20250409-89f8206ba4, Xenova/multilingual-e5-small revision761b726dd34fb83930e26aab4e9ac3899aa1fa78 int8을 고정했다. prefix는 query:/passage:, mean pooling/정규화,384차원이다. 원본 intfloat 모델 카드는 MIT를 명시한다. 변환 저장소의 base_model 출처와 원본 라이선스를 구분하며 변환 저장소에 별도 license 선언이 있었다고 주장하지 않는다. SDK 라이선스와 해당 ORT commit의 MIT 라이선스를 실행 파일과 함께 제공한다.

- [Transformers.js 환경/Cache API](https://huggingface.co/docs/transformers.js/en/api/env)
- [Next.js의 별도 Worker 연결](https://huggingface.co/docs/transformers.js/en/tutorials/next)
- [ORT 실행 파일 배포](https://onnxruntime.ai/docs/tutorials/web/deploy.html)
- [원본 모델 카드](https://huggingface.co/intfloat/multilingual-e5-small), [고정 변환 모델](https://huggingface.co/Xenova/multilingual-e5-small/tree/761b726dd34fb83930e26aab4e9ac3899aa1fa78)
- [ORT 고정 commit 라이선스](https://github.com/microsoft/onnxruntime/blob/89f8206ba4/LICENSE)

`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm test:boundaries`, `pnpm test:structure`, `pnpm test:s0-graph`, `pnpm build`를 사용한다. `node tests/browser/serve-semantic-fixture.mjs`는127.0.0.1:3037에서 합성 UI를 제공한다. 브라우저 fixture의 semantic-storage-check/evaluation 함수와 공개 모델 설치를 Ego에서 실행했다. `node tests/browser/check-semantic-layout.mjs`는 이 fixture의 기본 화면만 검사한다. 기존 `check-local-rag.mjs`, `check-search-fields.mjs`는 합성 회귀다.

상세 원자료와 Ego 라운드는 `.omx/verification/optional-semantic-20261115/`에 있다. 배포 결과는 최종 커밋/운영 확인 절에 이어 기록한다.

## 운영 설치 정책 수정

기능 커밋9885bf9의 첫 Vercel 빌드는 `ERR_PNPM_IGNORED_BUILDS`로 중단됐다. 새 SDK가 가져온 protobufjs7.6.6·sharp0.34.5의 설치 후 스크립트가 기존 pnpm 정책에 없었던 것이 확인된 원인이다. 브라우저 추론에 필요 없는 protobuf 메타데이터 스크립트와 Sharp 선택 소스 빌드를 명시적으로 제외했다. 기존 사전 빌드 패키지와 허용된 Prisma 단계는 유지하며 네이티브 ONNX 설치도 실행하지 않는다. 실제 앱 추론 실패나 원본 손실로 기록하지 않는다. 고정 lockfile 일반 설치와 빌드를 재확인했다. 이미 제공하는100ms 간격 다운로드 진행 알림과 중복되는 SDK의 buffer 읽기 알림은 제거했고, 설치/384차원 질문을 다시 확인했다.
