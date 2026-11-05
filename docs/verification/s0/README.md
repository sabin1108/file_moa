# S0 검증 — 로컬 기록 형식·브라우저 저장·중단 복구

2026-10-25. **기술 검증 코드이며 제품 기능 완료가 아니다.** 승인된 채팅·파일 시안에는 기능을 연결하지 않았다. 의존성·lockfile 변경 없음.

## 실제 자료 확인

사용자가 지정한 노트 폴더를 읽기 전용으로 확인했다. 숨김 항목과 링크를 제외한 57개 하위 폴더, 파일 216개 중 Markdown 204개(총 1,481,655 bytes, 최대 61,346 bytes)가 있었다. TXT/PDF는 없었다. 숨김·설정 영역 등 3개 항목은 제외했다.

최대 3개 MD/TXT 표본에 한해 내용을 출력하지 않고 UTF-8 디코딩과 연속 읽기 SHA-256 일치를 확인했다. 3개 모두 정상이다. 파일명·경로·본문·개별 hash는 보고서에 남기지 않았고 개인 자료를 fixture에 복사하지 않았다. 원본에 쓰기 명령을 실행하지 않았다. 전체 파일의 본문 검증이나 전체 원본 불변 hash 검증을 수행했다는 뜻은 아니다.

[집계 결과](source-inventory.json). 재현: `node scripts/s0/inspect-source.mjs <사용자가 확인을 허용한 폴더>`.

## 구현 코드와 읽을 순서

1. [저장 형식](../../specs/local-record-v1.md) → `packages/domain/src/local-record.ts`: v1 metadata 파서, 안전한 ID, 승인 기억의 프로젝트 범위.
2. `scripts/s0/record-store.ts`: 본문 MD를 쓴 뒤 JSON을 게시하는 버전 저장. 이전 버전 보존, SHA-256, 부모 버전·분기 검사, origin lock과 exclusive stream.
3. [복구 계약](../../specs/local-record-recovery.md) → `scripts/s0/record-recovery.ts`: 정상 이력 미리보기, 원본 fingerprint 재확인, 별도 새 폴더에 검증된 이력만 복사. 기존 파일은 삭제하지 않는다.
4. `scripts/s0/browser-checks.mjs` / `recovery-checks.mjs` / `run-browser-checks.mjs`: 격리 Chrome·Edge 프로필에서 실제 OPFS·IndexedDB·Web Locks 검증. 개인 브라우저 프로필에 연결하지 않는다.
5. `probe-server.mjs` / `probe.html` / `probe.mjs`: localhost 전용 수동 picker 도구. 외부 AI 호출 없음. 자료 읽기 확인 뒤 겹치지 않는 별도 테스트 폴더에만 합성 기록 생성.
6. `create-fixtures.mjs`: ignored `.taste-skill/s0-fixtures`에 MD, TXT, 빈 TXT, 잘못된 UTF-8 TXT, 합성 단일 페이지 PDF 및 빈 저장 폴더를 생성. PDF 파싱/렌더링을 검증한 것은 아니다.

## 실행 결과

| 검증 | 결과 | 범위 |
| --- | --- | --- |
| Vitest | 50 통과 | 후보 필터 6 + 메타데이터/기억 13 + 재연결 8 + 폴더 검사 4 + 계정 연결·표시값 19 |
| TypeScript | 통과 | web, domain, S0 adapter 별도 tsconfig |
| ESLint | 통과 | 웹 전체와 신규 domain/S0 코드. 루트에서 웹 config 재사용 시 React 탐색·pages 경로 경고는 있음 |
| Next production build | 통과 | 37개 페이지, 기존 화면 변경 없음 |
| Chrome 155 | 저장 12개 + 복구 10개 + 도구 버튼 흐름 4개 + 계정 저장소 4개 + 새로고침 복원 + 실제 두 탭 경쟁 통과 | 격리 OPFS, [결과](chrome-storage.json) |
| Edge 156 | 같은 검증 통과 | 격리 OPFS, [결과](edge-storage.json) |

권한 거부·용량 부족·메타데이터 저장 실패는 adapter에 주입한 실패다. 브라우저의 실제 권한 철회나 디스크 가득 참을 재현한 결과가 아니다. exclusive stream, IndexedDB handle 직렬화/복원, 새로고침 재읽기, 두 탭 Web Locks 경쟁은 실제 브라우저 API로 실행했다. 두 탭 중 하나만 저장되고 다른 하나는 stale-revision으로 거부됐다.

제한된 실행 환경에서 Chrome/Edge의 Page.enable이 timeout됐다. 동일 로컬 검증을 승인된 확장 실행 환경에서 재실행하여 통과했다. 브라우저 보안을 해제하는 실행 옵션을 추가하거나 사용자 프로필을 사용하지 않았다.

pnpm이 PATH에 없어 설치된 프로젝트의 Vitest/TypeScript/ESLint/Next 실행 파일을 직접 사용했다. 의존성을 새로 설치하지 않았다.

## 발견한 실패 경로와 한계

- 표시값 추가 단위(2026-10-25): `FolderConnectionView`와 `session.view(kind)`로 이름/상태만 반환한다. 타입·린트·빌드와 전체 단위 테스트 50개를 재실행했다. 이 단위는 제품 UI·저장 I/O 변경이 없으며, 아래 Chrome/Edge의 30개 시나리오 결과는 앞 구현 단위의 증거로 이번에는 재실행하지 않았다. 사용자 검토 기준은 [첫 기능 명세](../../specs/source-folder-connection.md)의 이번 변경 설명이다.

- 계정 분리 기반: [계약](../../specs/account-folder-connections.md) → `apps/web/src/features/local-folders/contracts.ts`(입력/키) → `connection-session.ts`(계정 전환·늦은 응답 차단) → `handle-repository.ts`(IndexedDB·참조 변경 잠금) 순서로 읽는다. 가상 계정 A/B와 작업 공간·폴더 종류를 분리하며 늦은 성공/실패, A→B→A, 저장/해제 중 전환을 16개 단위 테스트로 검증했다. 실제 IndexedDB structured clone·다른 연결 보존·폴더 불변·저장 후 해제 경쟁은 브라우저별 4개 시나리오로 통과했다. 이 모듈은 아직 제품 화면·실제 인증에 연결되지 않았다. 다른 탭 로그인 상태 전파와 작업 취소는 후속이며 LOCAL-008 전체 완료가 아니다.

- 2026-10-25 후속 수정: [폴더 재연결 계약](../../specs/s0-folder-connection.md)에 따라 IndexedDB 핸들을 시작 시 준비하고 명시적 클릭에서 권한을 즉시 요청한다. `probe-connection.mjs`가 연결 상태, `handle-store.mjs`가 IndexedDB, `source-inventory.mjs`가 제한된 목록 검사를 맡는다. 폴더 교체 검사·연결 게시 실패 시 기존 연결을 유지한다. 디렉터리 제한은 대기열 길이 대신 전체 발견 수로 검사한다.
- 새 도구 버튼 테스트는 취소/스캔 실패 후 연결 유지, 읽기 권한 복원, 권한 거절 후 재시도, 중단 저장→미리보기→복구→재열기를 검증한다. picker·권한 응답은 주입했고 파일 저장은 실제 OPFS다. 실제 외부 폴더 권한 창 통과를 뜻하지 않는다. 복구 후 페이지 새로고침 시 핸들을 미리 준비하는 흐름도 두 브라우저에서 통과했다.
- 실제 Windows 검증을 위해 Computer Use로 Edge 실행을 요청했으나 `Computer Use app approval timed out`으로 종료됐다. 폴더 선택·권한 창에는 도달하지 않았고 권한 변경도 하지 않았다. 이는 테스트 실패나 자동 승인 거부가 아니라 UI 실행 도구의 승인 응답 시간 초과다. 수동 검증 절차는 [네이티브 체크리스트](native-folder-checklist.md)에 준비했다.

- 본문 후 JSON 게시 전에 실패하면 이전 버전은 보존되며 게시되지 않은 MD는 최신 버전으로 읽지 않는다.
- JSON close 실패로 빈 JSON이 남으면 일반 읽기는 `incomplete-record-metadata`로 중단한다. S0 도구에서 정상 이력을 미리 보고 **별도 새 폴더에 복구**할 수 있다. 빈 JSON·고아 MD는 원래 폴더에 보존한다. 잘못된 비어 있지 않은 JSON·본문 변조·분기·부모 누락은 추측으로 복구하지 않는다. 제품 UI 연결과 자동 복구는 미구현이다.
- 복구 10개 시나리오는 미리보기·원본 불변·복구 후 수정 저장·미리보기 이후/복사 중 원본 변경·목적지 겹침·주입한 쓰기 실패·손상/분기/정상 이력 없음의 거부를 검증했다. 복구 버튼의 네이티브 picker 흐름은 아래 미검증 범위에 포함된다.
- 외부 편집은 hash·부모 관계로 감지한다. 다른 프로그램/다른 origin과의 완전한 원자적 비교·교환은 보장하지 않는다.
- **실제 사용자 폴더의 네이티브 picker, 권한 거절·철회·재허용, 브라우저 재시작 후 외부 폴더 재연결은 미검증**이다. OPFS 결과는 이를 대체하지 않는다.
- 임시 대화·실제 계정 전환·삭제 후 부활 방지·민감 정보 필터·전체 백업 가져오기는 제품 통합 전이다. LOCAL-001~010 전체 통과로 승격하지 않는다.
- PDF 추출/OCR, 실제 AI, 결과물 UI, 원본 이동/복사, 암호화는 미구현이다. 기존 MD/TXT 후보 필터 동작은 변경하지 않았다.
- 독립 기술 검증이며 제품 UI에는 연결하지 않았다. Lighthouse·사이트 전체 성능 기준선·IME는 제품 통합 때 검증한다.

## 재현

```powershell
node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc -p packages/domain/tsconfig.json
node node_modules/typescript/bin/tsc -p scripts/s0/tsconfig.json
node scripts/s0/create-fixtures.mjs
node scripts/s0/run-browser-checks.mjs
# Edge 선택: CHROME_PATH를 해당 설치 실행 파일로 지정.
node scripts/s0/probe-server.mjs
```

수동 도구: http://127.0.0.1:4318. 실제 원본 폴더는 읽기 전용 확인에만 사용한다. 저장 대상은 `.taste-skill/s0-fixtures/ai-output` 등 별도 테스트 폴더다. 도구가 만든 테스트 하위 폴더는 자동 삭제하지 않는다.

다음 작업: 네이티브 폴더 선택·권한 철회/재허용·브라우저 재시작 후 재연결·수동 복구 버튼 흐름 검증 → 계정별 연결·임시 대화 정책을 포함한 앱 통합. PDF와 모델 평가는 별도 작은 단계로 진행한다.
