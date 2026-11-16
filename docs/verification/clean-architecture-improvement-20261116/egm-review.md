# EGM 구현 검토와 조치

2026-11-16. 대상은 같은 폴더 README와 `.omx/plans/clean-architecture-improvement-20261115/plan.md`의 P0–P4다. 설치 EGM의 Codex integration을 읽고 `egm-review`의 implementation 검토 범위로 세 persona를 별도 문맥에 직접 배정했다. 전체5단계 설계 검토·반복 review-loop의 수렴·운영 검증을 주장하지 않는다.

검토자는 fork_turns=none으로 시작했고 persona와 implementation-readiness-standard를 읽고 실제 소스·테스트·검증 로그를 대조했다. 같은 대화에서 검토 역할을 흉내 내지 않았다. 프로젝트 지침 주입 여부의 완전한 격리는 별도로 증명하지 않았다. 검토자는 읽기 전용이며 테스트 실행과 수정은 주 작업자가 수행했다.

| 검토자 | native role / EGM persona | 첫 판정 |
| --- | --- | --- |
| /root/egm_codebase | explore / codebase_details |Blocker·Major 없음, 결과 집계 분리 Nit1 |
| /root/egm_style | explore / style |최종 workflow 근거 누락 Major1 |
| /root/egm_readiness | architect / implementation_readiness |제품 Blocker 없음, 검증 과장 Major1·Nit3 |

표의 Major는 서로 다른 문서/증거 지적이며 제품 취약점 개수가 아니다. 코드 일치 검토자는 경계의 구현 자체에서 Major를 보고하지 않았다.

## 지적과 최소 조치

| ID | 지적 | 조치·검증 |
| --- | --- | --- |
| CB-NIT-001 |브라우저 suite의 최종 결과 구분 필요 |workflow49/managed32/RAG16/연속성10/기록66을 별도 행과 정확한 원자료로 분리. 검토자 재확인 완료 |
| STYLE-001 Major |workflow 최종 재실행 결과가 미기재 |실제 최종 editor-browser.log49통과·오류0과 이전 실패 이력을 함께 적음. 검토자 재확인 완료 |
| IR-001 Major |주입된 항상-true callback 검사가 제품 API 부재 허용 분기를 증명하지 않음 |기존 검사의 의미를 한정하고 실제 FolderConnectionSession의 공개 연결/편집 API로 제품 callback을 거치는3조건 검사 추가. 합성 navigator의 userActivation 미제공/활성은 실제 저장, 비활성은 권한/잠금0회 |
| IR-002 Nit |execution.md의 착수 상태가 현재 완료 상태처럼 읽힘 |기존 상태를 당시 이력으로 표시하고 최신 완료/실패 결과와 보고서 우선순위를 추가 |
| IR-003 Nit |조회의 빈 결과/낮은 score 등에서 직접 abort 확인이 빠짐 |준비의 model 반환과 조회의 records/score/evidence/epoch 반환 뒤 abort 확인 추가. callback이 signal을 대신 검사하지 않는 반례5개 실패→수정 뒤 통과 |
| IR-004 Nit |retain/retainSemantic 실패 fallback 검사 부족 |두 메서드의 reject에도 결과 유지·reader dispose1회를 확인하는 table 회귀2개 추가. 기존 제품 로직 유지 |

IR-003은 기존에도 상위 controller와 실제 모델이 취소를 방어하던 경로다. 새로운 index/model 주입 경계에서도 취소된 결과를 저장하거나 반환하지 않게 사용 사례 자체의 확인을 보완했다. 검색 순위·임계값·자료 형식·원격 요청 정책은 바꾸지 않았다.

## 재검토와 최종 증거

코드 일치·설명 지적은 각 원 검토자가 조치 완료를 재확인했다. 준비도 검토자도 실제 제품 callback3조건, 직접 취소5경로, retain 실패2경로와 원자료 갱신을 읽고 IR-001–004 모두 해소됐다고 반환했다. 이 제한 재검토 범위에서 열린 Blocker/Major/Nit은 없다.

보완 전 최종 check는173파일/1539테스트·타입/린트/빌드·S0180 통과다. 보완 후 `post-egm-check.log`는173파일/1548테스트·타입/린트/경계/빌드, `post-egm-s0.log`는180모듈, `post-egm-rag-browser.log`는16검사 통과이며 세 process exit0을 확인했다. 실패/성공 회귀는 `egm-regression-red.log`와 `egm-regression-green.log`에 보관한다. 보완 회귀는3파일/51검사 통과다.

## 남는 범위

찾기55검사 중53통과·첫 화면 위치2실패, taste20지적은 기존 화면/fixture 검사 한계로 남는다. workflow 중간 timeout 이력도 보존한다. 개인 폴더·운영 DB·유료 AI·의미 모델 가중치/실추론·물리 IME·OS 선택창·배포·커밋·푸시는 실행하지 않았다. 각 검토자의 읽기 전용 판정은 실제 외부 동작 증거가 아니다.
