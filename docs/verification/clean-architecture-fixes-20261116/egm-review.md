# F1–F3 EGM 독립 검토

2026-11-16. 대상은 같은 폴더 README, 현재 F1–F3 코드와 호출자/회귀, 원 재점검 보고서다. 설치 EGM의 Codex integration과 persona를 사용하고 fork_turns=none의 native 검토자를 직접 배정했다. 검토자별로 같은 구현 후 재점검 기준을 읽게 했으며 코드 수정·테스트·compile·하위 agent 생성은 금지했다. 실제 수정과 실행 검증은 주 작업자가 담당했다.

이 검토는 세 항목의 수정 결과에 한정한다. 전체5단계 설계 검토, review-loop 수렴, 운영 안전 검증을 주장하지 않는다. 대화 이력을 전달하지 않았으나 호스트 instruction 파일까지 배제된 완전한 격리는 따로 증명하지 않았다.

| 검토자 | native role / persona | 상태 |
| --- | --- | --- |
| /root/fix_f1_review |architect / design_critic |완료. F1 범위 추가 findings 없음 |
| /root/fix_f2_review |explore / codebase_details |완료. F2 범위 추가 findings 없음. persona/기준/대상 필수 읽기 재확인 |
| /root/fix_f3_review |architect / codebase_details |완료. F3 범위 추가 findings 없음 |

공통 기준은 `.omx/verification/clean-architecture-recheck-20261116/review-standard.md`다. 원 기준의 ‘제품 수정 없음’은 당시 감사 범위와 검토자 읽기 전용 제약이며, 이번 사용자가 요청한 주 작업자의 F1–F3 수정까지 금지하는 것으로 해석하지 않았다.

## 확인된 내용

- F1: 예상 저장 File의 바이트/크기 대조 뒤에만 proof를 갱신하며, 충돌 뒤 blocked가 checkpoint와 다음 저장을 막는다. 같은 크기/mtime·BOM/CRLF·잠금/권한·실패 경로를 대조했다. 원 재현의 조기 거부 처리는 외부 hash 미채택과 다음 저장 거부까지 강화한 변경이며 기대값 완화가 아니라는 판정이다. 호출자도 오류를 표시하고 저장 성공으로 바꾸지 않는다.
- F2: 의미 검색은 명시 연도와 hard.from/to의 존재를 함께 확인한다. 기존 필드 비교와 lexical 기간도 유지한다. 일반 confirmFindQuery는 전체 기간을 계속 허용한다. 기존4실패와 수정 뒤 관련136통과 로그·실제 호출자를 대조했고 누락된 제품 호출자를 찾지 못했다.
- F3: 결합 guard가 실제 putSemantic의 쓰기 직전 callback에 전달된다. 저장 await 완료 뒤에도 guard를 확인하고, 마지막 설치 표식 await 뒤 owner/connection·signal·stamp를 검사한다. 이미 완료한 캐시를 clear/rollback하는 경로는 추가되지 않았다. 기존3실패와 수정 뒤 관련51통과, 합성 반례 쓰기1→0, 전체1561통과 근거를 대조했다.

## 검증 한계

F3의 지연 저장은 fake index로 callback 전달과 캐시 보존을 확인했다. 실제 IndexedDB transaction에서 같은 abort timing을 실행한 것은 아니다. 마지막 표식도 공개 session 경로에 들어가지만 readInstalledModel과 하위 준비는 mock이다. 설치 표식 읽기는 signal을 받아 조기 중단하지 않고 완료 뒤 취소를 거부한다.

각 검토자는 실제 소스와 기존 실행 로그를 읽었으며 테스트를 다시 실행하지 않았다. 개인 원본·운영 DB·유료 AI·모델 다운로드·실제 OS 권한창·실제 여러 탭 쓰기 일정은 새로 검증하지 않았다. find 위치2실패·taste20지적은 수정 범위 밖 잔여로 남는다.

## 최종 판정

세 검토자가 필수 persona·기준·대상과 실제 관련 소스/근거를 읽고 완료 결과를 반환했다. 요청한 F1–F3의 제한된 수정 검토에서 추가 지적은 없다. 합성 검증과 소스 검토의 한계를 지운 제품 전체 안전 선언으로 해석하지 않는다.
