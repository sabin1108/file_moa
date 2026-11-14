# OCR·출처 연결 위키와 기존 흐름 검증

## 최신 재검증 — 2026-11-12

OCR12·위키16·검색55·기록29·일반/근거대화40/22·관리/복사32/22·복구/재개43/35·S0모듈168개를 이번에 다시 확인했다. 실제 장치·원격 모델 결과와 구분한 [검증·안정화 보고서](../stabilization-20261112/README.md)를 따른다. 아래 미커밋/미푸시와 실제 확인 대기는11월10일 해당 보고 시점이며 최신 인수인계로 대체된다.

2026-11-10. 사용자 요청의15 OCR·18 위키를 구현하고1~7의 자동 검증 가능한 범위를 확인했다. 실제 Windows 권한·물리 한글 입력·소셜 로그인 복귀까지 완료했다는 뜻은 아니다. 소스 기준은 기존 `feb2fa4` 위의 현재 미커밋 변경이다. 커밋·푸시·배포는 하지 않았다.

## 바뀐 동작

- 자료 설정의 **이미지 글자 읽기**를 켜면 PNG/JPEG와 텍스트 없는 PDF 쪽을 한국어·영어 OCR로 읽는다. 기본값은 꺼짐이다. 엔진·WASM·인식 데이터는 같은 사이트에서 제공하고 원본 바이트를 외부로 보내지 않는다. 추출된 발췌를 외부 AI에 보내는 동작은 기존 전송 확인을 따른다.
- 파일2MiB, 이미지600만 픽셀, OCR3쪽·파일당90초, 기존 PDF50쪽·200,000자 상한을 적용한다. OCR3쪽 뒤에도 일반 텍스트 레이어 쪽은 계속 읽는다. 부분 추출·손상·취소·시간 초과를 구분하며 원본은 수정하지 않는다. 검색은 기존 키워드 방식이다.
- 검증된 자료 답변을 기록함의 위키로 저장한다. 추가 모델 호출 없이 기존 답변·인용·모델·생성 시각을 보존한다. 기존 편집기·저장소·불변 버전·내보내기·삭제를 재사용한다. 새로운 생성 모델이나 DB 이관은 없다.
- 새 답변을 기존 위키에 제안해도 사용자 본문은 유지한다. 새 초안의 출처를 따로 확인하고, 현재 원본과 일치할 때 명시적으로 반영한다. 여러 출처 대화에 대한 연쇄 삭제와 저장 경합도 기존 tombstone·lock 경계에 포함한다.
- 생성 버전과 사용자 편집을 구분한다. 원본 변경은 갱신 필요로 표시하며 원문은 공통 미리보기에서 연다. 출처 일치가 모든 주장의 사실성을 증명하지는 않는다.

## 실제 실행 결과

| 검사 | 결과 | 검증 범위 |
| --- | --- | --- |
| 전체 단위 테스트 |153파일·1,325개 통과|위키 스키마/버전/사용자 편집 보존/삭제 경합, 이미지 헤더, Worker 시간 초과·메타데이터 포함|
| 타입·린트·빌드 |통과|승인된 고정 버전과 로컬 인식 파일 복사·해시 확인 포함|
| 서버·기능 경계 |26 +25/6/3 통과|서버 import 경계, 웹/도메인 import와 레이아웃|
| 실제 OCR |12개 통과|Tesseract7·한국어/영어 파일·실제 Worker, PNG/JPEG/스캔 PDF/혼합 PDF, 상한·취소·하위 Worker 종료·외부 요청0|
| 위키 UI |16개 통과|실제 편집기/저장소/격리 OPFS, 출처 변경·제안 반영·버전·새로고침·다른 owner 격리·390/768/1440/1920px|
| 기존 대화·기록·자료 근거 |40/29/22 통과|합성 스트림·Action·권한과 실제 제품 UI/Worker|
| 기존 자료 찾기 |55개 통과|날짜·본문 근거·공통 입력·실제 검색 Worker·실패 경로|
| 기존 복사·이동·복구 |36개 통과|합성 자료·권한과 실제 OPFS/계획/해시/실행 엔진/보존본·복구 UI|
| 개발 서버3034 |로그인 폼6/6·reload0·예외0·익명 session200/null|사용자 로그인 성공과 구분한 격리 브라우저 검사|
| hydration |깨끗한 SSR 경고0 / 외부 속성 주입 시 동일 경고 재현|실제 RootLayout·React SSR/hydration, Next 탐색은 shim|
| S0 모듈 그래프 후속 |168개 모듈과 브라우저 export 확인 통과|허용한 로컬 소스만 제공, 환경 파일404, 개인 폴더 선택 없음|
| S0 저장·복구 후속 |30개 +새로고침·두 탭 경합·프로세스 재시작 통과|실제 IndexedDB·OPFS·Web Locks, 실패/소유자는 합성, Chrome 종료 뒤 같은 격리 프로필 재실행|
| 복사 전용 후속 |22개 통과|실제 제품 UI/Worker/OPFS, 원본 보존·계획/해시·중단·진행 중 퀵 메뉴 차단|
| 파일 관리 전용 후속 |32개 통과|합성 권한과 실제 제품 UI/파일 엔진·보존본|
| 복구 전용 후속 |43개 통과|실제 OPFS/Worker·해시·복원·보관함 변경/삭제 실패 경로|
| 복구 재개 후속 |35개 통과|새로고침 뒤 검토/완료 복원, 실행 단계 URL의 재실행 차단, 합성 권한 요청/쓰기 횟수 검사|

OCR의 깨끗한 합성 PNG에서 한글 한 글자가 다르게 읽혀 정규화 문자 정확도는95.83%였다. JPEG는 해당 문구를 맞혔다. 이 값은 특정 합성 표본이며 실제 문서 정확도·필기 인식·성능 보증이 아니다. 원문 확인을 유지한다.

원자료: `.omx/verification/ocr-wiki/`의 `ocr-final/checks.json`, `wiki-final/checks.json`, `general-final/checks.json`, `records-final/records-checks.json`, `grounded-final/grounded-checks.json`, `find-final/browser-checks.json`, `organization/browser-checks.json`, `pdf-regression/`, `hydration/hydration-checks.json`, `dev-login.json`. 스크린샷은 위키 지면과 출처 부분을390/1440px에서 확인한다. 격리 브라우저·합성 모델 응답·합성 권한 결과를 실제 사용자 세션이나 네이티브 권한창 검증으로 취급하지 않는다.

## 실패를 확인하고 수정한 부분

- PDF.js6.5의 렌더러가 요구하는 `CanvasFactory.getNoAlphaContext`가 없어 스캔 PDF 렌더링이 실패했다. 설치된 API를 확인해 보완한 뒤 실제 스캔 PDF가 통과했다.
- 검토에서 OCR 상한 뒤 정상 텍스트 누락, 새 제안이 이전 출처로 검토되는 문제, 확인 중 원문 열기가 확인을 중단하는 문제, 저장 답변의 모델 기록 누락, 동일 파일 반복 읽기를 찾아 수정했다. 읽기 전용 재검토에서 잔여 오류가 발견되지 않았다.
- 신규 Worker 의존성의 Vite 사전 변환으로 일부 테스트 첫 진입 화면이 비었다. 관련 테스트에서 의존성을 미리 준비하고 준비 완료를 기다린다. 자료 찾기의 과거 미지원 형식 안내 기대값도 새 지원 형식에 맞췄다. 제품의 타임아웃은 늘리지 않았다. 최초 실패 원자료는 별도로 남긴다.
- 인증이 필요한 실제 `/files`에 익명 테스트 브라우저로 진입한 단독 복사/관리 검사는 로그인 화면에서 중단됐다. 인증을 우회하지 않았으며, 이후 격리 제품 통합 검사36개에서 복사·이동·복구를 확인했다.
- 첫 S0 그래프 검사는 Chromium `Page.enable` 시간 초과로 중단됐다. 후속에서 기본 시작과 GPU 제외만 적용한 시작은 같은 단계에서 실패했고, 다른 제품 검사와 같은 `--no-sandbox`·`--disable-gpu`의 격리 테스트 시작은 성공했다. 두 S0 실행기의 시작 옵션만 맞춰 현재168모듈 로딩·export 검사를 통과했다. 실제 OS 차단 원인을 로그 없이 단정하지 않는다. 개인 Chrome과 제품 설정에는 이 옵션을 적용하지 않는다.

## 가능한 자동 검증 후속 — 2026-11-10

사용자가 가능한 부분을 계속 처리하라고 요청했다. 제품 코드는 그대로 두고 세 테스트 실행기를 보완했다. S0 실행기는 출력 폴더 인자를 받아 과거 보고서를 덮어쓰지 않는다. 이미 새 결과가 쓰인 과거 `chrome-storage.json`은 직전 Git 내용과 일치하도록 복구하고 새 결과는 이번 원자료 폴더에 따로 보존했다.

S0 실행기에서 직접 만든 격리 프로필 경로와 시작 인자를 검사한 뒤 Chrome 프로세스가 실제로 종료됐는지 기다리고 같은 프로필로 다시 시작한다. IndexedDB의 폴더 참조와 OPFS의 본문·버전·읽기 가능 상태를 다시 읽었다. 단순 페이지 새로고침과 구분되는 프로세스 재시작이다. 사용자 프로필·쿠키·네이티브 폴더 선택에는 접근하지 않는다. 종료 대기는10초로 제한하고 처리 가능한 종료 신호에서는 이 테스트가 시작한 새 Chrome 프로세스 트리만 정리한다. OS 강제 종료까지 정리를 보장하지는 않는다.

복사/관리 실행기는 이미 있던 격리 제품 fixture에 복구·재개 검사를 연결했다. 새 모델 호출이나 인증 우회 없이 실제 제품 UI와 엔진을 검사하며 잘못된 실행 모드는 브라우저 시작 전에 거부한다. 해당 UI fixture의 첫 차가운 시작은 비어 있었지만 같은 코드의 재실행이 통과했다. 단일 첫 실패로 제품 오류 원인을 단정하지 않았으며 실패 경위는 이 절에 기록한다.

추가 원자료는 `s0-restart-final/chrome-storage.json`, `s0-restart-final.log`, `copy-final/checks.json`, `managed-final/checks.json`, `restore-final/checks.json`, `restore-resume-final/checks.json`, `hydration-final/hydration-checks.json`, `dev-login-followup.json`이다. 모두 `.omx/verification/ocr-wiki/` 아래에 있다. 서버 경계26·구조25/6/3도 다시 통과했고 수정한 JS 실행기의 구문 검사를 통과했다. 읽기 전용 검토에서 지적한 종료 대기·Windows 하위 프로세스 정리를 보완하고, CDP close 실패를 주입해 성공으로 오인하지 않고 소유 Chrome이 종료됨을 확인했다(`close-failure.json`). 이번 후속에서 제품 코드·의존성을 바꾸지 않아 타입/전체 단위/빌드를 반복하지 않았다. 앞 표의1,325개·타입/린트/빌드는 OCR·위키 구현 마감 때의 결과다.

재현 명령:

```powershell
pnpm test:s0-graph
node tests/s0/run-browser-checks.mjs .omx/verification/ocr-wiki/s0-restart-final
node tests/browser/run-managed-fixture.mjs .omx/verification/ocr-wiki/copy-final copy
node tests/browser/run-managed-fixture.mjs .omx/verification/ocr-wiki/managed-final
node tests/browser/run-managed-fixture.mjs .omx/verification/ocr-wiki/restore-final restore
node tests/browser/run-managed-fixture.mjs .omx/verification/ocr-wiki/restore-resume-final restore-resume
```

## hydration 경고 원인

사용자 메시지의 `data-map-dyoa-ext="1.3.0"`은 앱 RootLayout에 없다. 설치된 Map-Dyoa 멀티뷰 도우미1.3.0의 `presence.js`가 문서 시작 시 추가하는 속성과 일치한다. 원래 HTML은 경고 없이 hydrate되고 해당 속성을 넣으면 같은 경고가 재현된다. 확장 프로그램이 React 준비 전에 DOM을 변경한 경우이며 퀵 메뉴의 클릭 감지와는 별개다. `suppressHydrationWarning`을 추가하거나 확장 설정을 임의 변경하지 않았다.

해결 확인은 해당 확장의 localhost 사이트 접근을 끈 뒤 새로고침하는 것이다. [Next.js 공식 설명](https://nextjs.org/docs/messages/react-hydration-error)도 확장 프로그램의 HTML 변경을 원인으로 안내한다.

## 남은 실제 환경 확인

사용자는 로그인 완료를 보고했다. 컴퓨터 사용 도구가 Chrome의 현재 URL을 신뢰할 수 없다고 판단해 실제 UI 조작을 종료했다. 개인 Chrome 쿠키·다른 자동화 경로로 우회하지 않았다.1~7 전체는 미완료로 유지한다. [준비한 실제 확인 순서](manual-checks.md)와 별도 합성 폴더를 사용한다. 실모델 추가 호출·60분 관찰·현장 지연/IME·Windows 권한·외부 앱 변경은 미검증이다.

8~14·19·21·22 보류,17 로컬 AI·20 Kakao 이번 범위 제외,16 실제 검색에 의미/벡터 검색 추가 없음. 현재10회 사용량 제한을 유지한다.

## 소스 읽기 순서

OCR: `local-folders/lib/ocr-image.ts` → `services/ocr-text.ts`·`pdf-text.ts` → `copy-hash.worker.ts`·`copy-hash.ts` → `source-snapshot.ts`·`source-file-preview.ts` → 자료 설정/미리보기. 엔진 준비는 `apps/web/scripts/prepare-ocr-assets.mjs`, 출처·해시는 `apps/web/public/ocr/`이다.

위키: `shared/ai-records.ts` → `ai-records/lib/wiki.ts` → `services/wiki-sources.ts`·`ai-record-repository.ts` → `components/WikiSources.tsx`·`RecordEditor.tsx` → `useGroundedConversation.ts`·`LiveConversation.tsx`. 기존 결과물 저장 계약에 위키 메타데이터만 더했다.
