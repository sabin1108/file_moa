E:\project\ai_folder_project에서 F1–F3 수정 결과를 제품 수정 없이 독립 재점검해줘.

먼저 AGENTS.md와 아래 자료를 읽어:
- docs/verification/clean-architecture-fixes-20261116/README.md, egm-review.md
- .omx/verification/clean-architecture-fixes-20261116/verification.json, start-baseline.json
- 같은 폴더의 repro-before.log, repro-after.log, editor-race.original.txt
- .omx/verification/clean-architecture-recheck-20261116/report.md

현재 diff와 수정 완료 시점 근거를 대조하고 기존 미커밋 변경·개인 문서를 보존해. 이미 해결한 항목은 중복 수정하지 마.

F1의 첫 저장 뒤 외부 변경 미채택과 다음 수동/자동 저장 차단, F2의 의미 검색 명시 연도·기간 보호와 일반 검색 기간 확대 유지, F3의 저장 직전 owner/취소 guard와 마지막 await 뒤 취소 거부·완료된 정상 캐시 보존을 실제 코드와 호출자로 확인해.

필요한 기존 관련 검사와 다음 합성 반례를 실행하고 이번 결과와 과거 로그를 구분해:
pnpm exec vitest run --config .omx/verification/clean-architecture-recheck-20261116/repro.config.mts

새 결함이 있으면 재현 조건·원인·실제 영향·파일/줄·신뢰도와 최소 수정안을 보고해. 제품·테스트·설정은 수정하지 마. 기존 find 위치2실패·taste20지적과 실제 환경 미검증을 전체 통과로 표시하지 말고, 다른 보류 항목이나 화면 배치로 검토 범위를 넓히지 마.

실제 개인 폴더·운영 DB·유료 AI·새 모델 다운로드·배포·커밋·푸시는 실행하지 마. 최종 보고에 다음 채팅창에 전달할 후속 지시문도 함께 적어줘.
