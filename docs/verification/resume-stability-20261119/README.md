# 재개 확인과 데스크톱 데모 반복 검사

2026-11-19. 기준 HEAD와 로컬 `origin/main`은 `c5fb07faf3c6b94a901a2e86e3d17655abb8da78`이다. 인수인계 `NEXT_SESSION_PROMPT.md` 최신 절과 `RESUME_20261119.md`를 읽고 이어서 확인했다. 원격 ref를 새로 가져오거나 배포 상태를 다시 조회한 결과는 아니다.

## GitHub README 표시

[저장소 README](https://github.com/sabin1108/file_moa#readme)를 Ego 브라우저에서 읽기 전용으로 확인했다.

- 샘플 이미지 1개의 실제 로드와 원본 너비 2,548px을 확인했다.
- Mermaid 2개가 iframe 안에서 도형과 글자로 표시됐다. 스크린샷도 확인했다.
- 목차와 상단 이동 링크 17개가 GitHub의 `user-content-` 앵커에 대응했다. 최초 검사에서 이 접두사를 빠뜨린 false 결과는 검사 방식의 오류이며 README 오류가 아니다.
- 대표 소스 링크 `shared/ai-daily-limits.ts`를 열어 실제 코드의 `AI_DAILY_LIMITS` 표시를 확인했다. 모든 외부 링크를 새로 방문한 검사는 아니다.

## 반복 검사와 결과

기존 `apps/web/tests/browser-fixtures/paid-demo.tsx`와 실제 `SampleWorkspaceStore`, 파일 순수 함수, 공통 UI를 사용했다. 새 Vite 서버는 `127.0.0.1:3053`에서만 실행했고 종료했다. 서버 AI, 운영 DB, 개인 폴더는 사용하지 않았다.

| 검사 | 실행 범위와 결과 |
| --- | --- |
| 대화 60회 | 실제 store에 합성 action 주입. 최대 메시지 40개, 전송 이력 7개·6,637자 이하, 최신 답변 유지. 각 20회 뒤 연결된 DOM 요소 867개로 동일, 저장 문자열 47,102~47,122자. |
| 설정 패널 10회 왕복 | 실제 버튼으로 열고 닫았다. 같은 composer DOM 노드와 초안 유지. 대화 반복과 분리해 순차 실행한 결과만 통과로 채택했다. |
| 생성 중단 8회 | 실제 store의 스트림 callback·취소·AbortSignal 사용. 받은 문장과 초안 보존, 취소 뒤 완료된 합성 응답은 상태를 바꾸지 않음. |
| 파일 50작업 | 생성한 10개 문서마다 편집→복사→이동→휴지통→복구. 실제 파일 함수와 store에 연결하되 각 작업의 dialog 클릭을 50번 반복한 검사는 아님. 원본·복구 사본의 최신 본문 일치, 대화·초안 보존. |
| 보존본 한도 | 30개 보존본 유지. 다음 편집은 기존 파일 트리를 바꾸지 않고 거부됨. 복사·복구는 별도 보존본을 추가하지 않는 현재 계약을 따름. |
| F5 | 파일 68노드·보존본 30개·메시지 40개를 포함한 상태가 직전 상태와 동일. 합성 질문·정리 action 호출 0회. |
| 추가 대화 30회 | 페이지를 앞으로 가져온 뒤 순차 10회씩 3묶음. 메시지 최대 40개 유지, 가로 넘침 없음. 아래 성능 관측과 분리해 해석한다. |

파일 첫 반복은 브라우저 `evaluate`의 15초 제한에서 중단됐다. 새로고침으로 이전 실행 문맥을 종료한 뒤, 7번째 문서의 휴지통까지 저장된 상태를 확인했다. 해당 복구와 남은 3묶음을 짧은 호출로 이어서 완료했다. 중간 시간 제한을 제품 실패나 무중단 50작업 성공으로 기록하지 않는다.

## 반응·메모리 관측과 한계

추가 대화 30회의 합성 action 시작부터 두 번째 animation frame까지 44.5~96.3ms, 각 10회 묶음 중앙값은 78.0/78.1/78.2ms였다. Vite 개발용 fixture, 단일 브라우저, 화면 표시 상태의 실험이다. 실제 입력 이벤트에서 시작한 INP, production 성능, AI 지연 또는 개선율이 아니다. 앞선 60회는 일부 패널 조작과 겹쳤고 비활성 프레임 지연이 섞였으므로 성능 근거에서 제외했다.

추가 대화 10/20/30회 뒤 연결된 DOM 요소는 949/957/957개였다. JS heap 사용량은 약 20.79/20.66/23.65MB였다. 가비지 수집 전 native DOM·리스너 카운터가 늘어 별도로 강제 수집을 실행했다. 직전 JS heap 23,688,808bytes→17,162,220bytes, 이벤트 리스너 5,701→332개였다. 이 감소는 수집 전 카운터 증가만으로 누수를 확정하면 안 된다는 근거이며, 장기 누수 부재의 증명은 아니다. 강제 수집은 사용자 반응 시간 표본에 포함하지 않았다.

최종 합성 화면 스크린샷에서 발언자 표시와 답변 첫 줄이 겹쳐 보이는 관측이 있다. 소스의 일반 흐름만 읽었으며, 브라우저에서 좌표를 다시 측정하거나 production과 비교하지 않았다. 제품의 반복 사용 회귀로 확정하거나 해결 완료로 보고하지 않는다. 다음 화면 확인의 우선 대상으로 남긴다.

2026-11-19 후속: 사용자 수정 요청 뒤 빠른 갱신 조건에서 해당 화면을 재현하고 본문 효과·자동 이동을 수정했다. 이 절은 첫 관측 시점의 상태로 보존하며, 현재 결과는 [데모 후속 수정](../demo-fixes-20261119/README.md)을 따른다.

## 자동 검사와 변경 범위

다음 9파일·66테스트를 현재 세션에서 실행해 통과했다.

```powershell
pnpm test -- apps/web/tests/sample-workspace/sample-store.test.ts apps/web/tests/sample-workspace/sample-answer-store.test.ts apps/web/tests/sample-workspace/sample-state.test.ts apps/web/tests/sample-workspace/sample-file-workspace.test.ts apps/web/tests/sample-workspace/sample-file-controller.test.ts apps/web/tests/sample-workspace/sample-material-sync.test.ts apps/web/tests/sample-workspace/sample-stream.test.ts apps/web/tests/conversation-workspace/messaging/chat-stream.test.ts apps/web/tests/conversation-workspace/material-work/workspace-conversation.test.tsx --maxWorkers=1
```

제품 소스·설정·lockfile 변경은 없다. 전체 테스트, typecheck, lint, build, Lighthouse, 유료 AI, 운영 배포는 반복하지 않았다. 이전 1,753테스트 통과와 운영 실제 AI 결과는 과거 검증이다. 모바일 마감 보류, 이메일·신규 가입의 사용자 수동 후속, 물리 IME·native 권한창 미검증을 유지한다.

개인 보고서 3개는 읽거나 수정하지 않았다. 이 문서를 작성한 검증 시점에는 미커밋 상태였으며 이후 반영 여부는 Git과 배포 상태를 구분해 확인한다. 실행 스크립트·상세 표본·스크린샷은 Git에서 제외되는 `.omx/verification/resume-stability-20261119/`에 있다. Ego 작업 공간과 이번 소유 서버는 종료했다.
