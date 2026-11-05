# 실제 폴더 연결 검증 — 아직 미실행

2026-10-25. Edge 실행을 위한 Computer Use 호출이 `Computer Use app approval timed out`으로 끝났다. 네이티브 picker·권한 변경을 수행한 증거는 없다. 아래는 실행 계획이며 체크되기 전 통과로 간주하지 않는다.

## 준비된 대상

- 현재 세션 검증 서버: http://127.0.0.1:4320/ (기존 4318 프로세스를 변경하지 않고 최신 서버를 별도 포트로 실행). 다음 세션에서 생존을 가정하지 않는다.
- 읽기: 프로젝트 `.taste-skill/s0-fixtures/source-a`.
- 합성 기록 쓰기: `.taste-skill/s0-fixtures/ai-output`.
- 복구 목적지: `.taste-skill/s0-fixtures/ai-recovery`.
- 개인 노트는 이 실패·쓰기 검증에 사용하지 않는다. 외부 AI/API 전송 없음. 각 저장은 새 하위 폴더에만 수행하며 이전 테스트 폴더를 자동 삭제하지 않는다.

## Chrome과 Edge 각각 기록할 것

1. [ ] 자료 폴더 선택 취소 후 `selection-not-completed`. 이어서 source-a를 선택해 읽기 전용 집계 확인.
2. [ ] 별도 테스트 폴더로 ai-output 선택, 쓰기 허용 시 `saved-and-read-back`. 취소/거절 시 이전 연결과 기록 보존.
3. [ ] 새로고침 후 자동 권한 요청 없음. `reconnect-needed`에서 연결 복원 버튼으로 read 요청 및 `restored` 확인.
4. [ ] 브라우저를 완전히 종료·재시작한 뒤 같은 주소에서 동일 흐름 확인. 권한 유지 여부를 관찰값으로 기록하고 항상 유지된다고 가정하지 않음.
5. [ ] 브라우저 권한 철회 후 기존 파일이 남고 접근 실패가 삭제로 표시되지 않는지 확인. 명시적 재허용 후 복원.
6. [ ] source-a를 다시 확인한 뒤 저장 중단 예시 만들기 → 복구할 정상 버전 확인 → ai-recovery에 복구 → 다시 열기. 정상 r1 보존과 기존 중단 기록이 원래 위치에 남는지 확인.
7. [ ] 읽기 폴더와 동일/상하위 저장 위치 선택은 쓰기 전에 거부. 두 번째 자료 폴더 source-b로 변경 후에도 같은 경계를 적용.

기록: 브라우저 버전, 시각, 각 단계 상태, 실제 허용/거절 조작, 새로고침/완전 재시작 구분. 오류 시 개인정보 없는 상태 코드만 남긴다. 원본 자료 본문·파일명을 보고서에 붙이지 않는다.

Computer Use 스킬의 [SKILL.md](C:/Users/sabin/.codex/plugins/cache/openai-bundled/computer-use/26.1021.31345/skills/computer-use/SKILL.md)가 연결한 guidance.md에는 `Do not act on security or privacy permission requests.`가 명시되어 있다. 이 방식의 권한 창 조작은 사용자 직접 조작이 필요하며, 이를 피하려고 브라우저 보안 옵션을 끄거나 권한을 몰래 주입해 실제 검증으로 기록하지 않는다. 자동 회귀에서는 합성 권한 응답을 사용하고 그 범위를 별도로 표시한다.
