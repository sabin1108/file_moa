# 대화·기록함 UX 재구성 — 2026-11-09

요구208. 긴 설정 설명과 글처럼 보이는 조작 때문에 사용 흐름을 파악하기 어렵다는 피드백을 반영했다. [변경 계획](../../planning/workspace-ux-rebuild.md), [현재 디자인](../../../DESIGN.md). 새 프로젝트 기능이나 저장 규칙을 추가하는 작업은 아니다.

## 변경 결과

- 입력 위의 긴 안내·보관 설정 묶음을 **자료 연결 / 저장 상태 / 설정**으로 대체했다. 공급자는 한 줄로 알리고 상세 전송 정책·프로젝트 식별자·사용량은 설정에서 펼친다. 실제 자료 발췌와 외부 전송 동의는 기존 전송 시점에 계속 확인한다.
- 같은 옆 패널의 **기록 / 자료 / 설정**에서 이동한다. 원본을 참고하는 자료 폴더와 앱 기록을 쓰는 저장 폴더를 목적에 따라 구별한다. 실제 폴더명이 `source`여도 입력 위에는 `자료 · source`로 표시한다.
- 기록은 종류별 목록·제목 검색·하나의 새 항목 버튼이 중심이다. 제목 행은 테두리가 있는 큰 열기 버튼이며, 삭제는 항목 관리 메뉴와 별도 확인으로 구분한다. 저장 위치·다시 읽기·연결 해제는 관리 화면으로 옮겼다.
- 편집은 제목·본문·저장을 우선한다. 내보내기·이전 버전·적용 범위는 접었고 프로필 이름·답변 방식은 선택 입력임을 알린다. 새 기억의 기본값은 승인 전이며 전송 설정과 명시 승인을 유지한다. 저장되지 않은 편집을 버릴 때 계속 편집/버리기를 구분한다.
- 답변 아래 편집·기억 조작과 기록함 진입 버튼도 테두리와 아이콘으로 본문과 구별한다. 기존 긴 폼/안내 UI를 함께 남겨 놓지 않았다.
- 인증 장식은 폼 위에서 제거해 왼쪽의 공부 노트·프로젝트 기록·나의 생각 그림을 크게 대체했다. 실제 단계 의미 표시는 입력 가까이 유지한다. 모바일은 장식만 숨기고 입력·단계 의미를 유지한다. 로그인처럼 단계가 없는 화면은 회오리 장식을 사용하며 진행률을 만들지 않는다. 원본 모션과 키프레임·속도는 그대로다.

## 유지한 경계와 읽을 파일

1. `features/conversation-workspace/components/LiveConversation.tsx` → `ConversationContextBar.tsx`, `ConversationSettingsPanel.tsx`: 기존 chat/workflow/records controller를 조합하고 표시 책임만 나눈다. 옆 패널의 각 화면은 숨겨도 마운트를 유지한다.
2. `components/layout/ConversationWorkspace.tsx`: 기존 drawer의 닫기·모바일 modal·IME·입력/스크롤을 재사용한다. 입력 위 조작에서 열어도 닫은 뒤 해당 조작으로 초점을 돌린다.
3. `features/ai-records/components/AiLibraryPanel.tsx` → `AiStorageSettings.tsx`, `RecordEditor.tsx`, `UsageView.tsx`: 목록/관리/편집을 분리하고 기존 repository와 검증을 유지한다. 저장 위치 변경 중 편집/요청/삭제 잠금, 저장 후 연결 해제, 연결 revision 기반 삭제, 실패 시 내용 보존을 유지한다. 해제 시에는 `useConversationRecords.detachStorage()`로 저장 연결 정보만 비우고 현재 대화·초안을 임시 상태로 유지한다.
4. `components/layout/AuthShell.tsx` → `components/ui/PaperStepper.tsx`, `use-paper-stepper-motion.ts`: 장식만 같은 인증 shell의 왼쪽에 portal로 표시한다. 의미 있는 단계/입력/URL/실제 인증은 기존 소유자에 남는다. 숨겨진 모바일 장식의 0 너비는 축소 값 계산에서 제외한다.

프로젝트 이름/목록 저장소가 없어 식별자는 고급 설정에 남겼다. 가짜 이름이나 이름을 ID로 바꾸는 규칙은 추가하지 않았다. 임시 대화를 묵시적으로 저장하지 않으며, 연결 해제는 파일 삭제가 아니다. 한도10회·기존 승인/원본 보호를 유지한다.

## 검증

- 변경 전 관련15파일83개 회귀 검사 통과를 확인했다. 최종148파일 **1299개 단위 검사**, 타입·린트(경고0)·production 빌드 **`vzSymrE9-1UNjOKAIBn13`** 통과. 추가3개는 임시/저장 대화 연결 해제 시 본문·초안·프로젝트 유지와 진행 중 요청의 변경 거부를 확인한다.
- 서버 경계26, 구조25+6+3 통과. S0 그래프는 제한된 브라우저 시작의 `Page.enable` timeout 뒤 일반 권한에서164모듈/브라우저 export 검사 통과. 제품 오류로 해석하지 않는다.
- [기록 UI29개](browser/records/records-checks.json): 기본 세 조작, 실제 OPFS 저장·복원·파일 왕복, 편집·새 기억 기본 승인 전·설정 왕복 편집 보존·미저장 이탈 확인·제목 검색·삭제 확인/취소/완료 초점·저장 위치 복귀·연결 해제 성공/실패 시 임시 초안 유지·390px·다른 owner 격리. 합성 SSE이며 유료 모델 요청은 없다.
- [일반 대화40개](browser/chat), [자료 답변22개](browser/grounded/grounded-checks.json), [자료 찾기55개](browser/find/browser-checks.json) 통과. 기존 IME/중지/단절/자료 동의/원본·owner 경계를 새 도구 진입 경로로 다시 확인했다.
- [애니메이션32개](browser/animation/checks.json): 원본 키프레임 정확 비교, 왼쪽 큰 무대·폼의 의미 있는 단계 유지, 390/768/1440/1920px, 실제 입력 크기, 이동/복귀/취소/축소/모션 감소. 같은 제품 코드와 합성 action/Next shim을 사용한다. 그림과 기록함 화면을 직접 확인했다.
- [실제 Next 인증169개](auth-browser/checks.json): 빌드 `kHu25Ks-LCnGBSM86-_Jc` 복사·일회용 로컬 PostgreSQL·strict TLS·합성 계정·로컬 메일 캡처로 가입/확인/로그인/프로필/로그아웃/재설정/계정 연결 회귀 통과. 이후에는 공통 drawer의 닫기 전 초점 캡처와 기록 목록의 화면 전환 뒤 초점 이동을 보완했다. 최종 기록29/일반40·타입/린트/전체/빌드/production 검사는 다시 확인했다. 운영 인증이나 외부 소셜/메일 검증은 아니다.
- [실제 production 설정·이동26개](production/settings-loading-checks.json), [보호 경로 게스트/샘플 진입 및 history9개](performance/routes-assets.json) 통과. 보호 경로의 게스트 관측을 실제 계정 속도라고 보고하지 않는다.
- 개발 서버를3034로 복구했다. [6회 관측](dev-login.json)에서 로그인 폼6/6·자동 재시작0·브라우저 예외0을 확인했다. production QA3035는 종료했다. 개발 서버가 실행 중일 때 typecheck/build/Prisma generate를 병행하지 않는다.

독립 검토에서 연결 해제의 `forget()`이 임시 대화를 지우는 경로를 발견해 저장 선택만 해제하도록 고쳤다. 답변 조작의 열기 버튼도 반환 대상으로 전달한다. native dialog가 닫히며 먼저 초점을 복구하므로 닫기 전 초점 위치를 캡처하고, 삭제/저장 위치의 복귀는 화면 커밋 뒤에 실행한다. 코드 재검토 CLEAR 뒤 브라우저에서 초점 시점을 추가 검증·보완했다.

검사 도구의 예전 문구/목록 행 구조/장식 부모 위치 가정도 새 사용자 경로로 갱신했다. 좁은 화면의 modal 닫힘이 끝나기 전에 입력을 주입하지 않고 대상 입력에 실제 값이 도착했는지도 검사한다. 초기 selector 실패는 `before-harness-selector-fix.json`에 남겼으며 최종 성공 결과와 구분한다. 구형 UI를 검사에 맞추려고 제품에 다시 추가하지 않았다.

## 성능과 한계

[전체 JS/CSS](performance/routes-assets.json)는49파일3,598,694→3,617,630bytes, **18,936bytes 증가**다. 초기 다운로드와는 다르다. 기존/이후 빌드와 실제 경로별 관측을 보존했으며 서로 다른 실행의 로딩 시간 개선율은 주장하지 않는다.

[긴 대화](browser/records/long-conversation.json)는100/500turn을 각각3회 번갈아 열었고 두 frame까지100turn34.8~101.2ms,500turn173.4~249.2ms였다. 이미 읽힌 합성 기록의 렌더 관측이며 디스크 진입·field INP·실제 모델 응답 시간이 아니다. JS heap은 GC가 통제되지 않았고 DOM은 현재500turn의1000article로 유지됐다. 장기 누수 검증은 아니다. [인증된 경로별36표본](auth-browser/performance-authenticated.json)도 일회용 로컬 DB/빈 OPFS/350ms 관측/캐시 끔의 lab 자료로 구분한다.

운영 DB 변경·개인 원본 변경·새 패키지·유료 모델 요청·커밋/푸시/배포는 없다. 실제 소셜 로그인·물리 한글 IME·Windows 권한 창·기기 GPU·사용자 체감 UX의 최종 확인은 별도다. 기존 대규모 작업 중 변경은 보존했다.
