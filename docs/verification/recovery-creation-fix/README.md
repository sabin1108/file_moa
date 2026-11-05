# 보관함 생성 흐름 수정 — 2026-11-04

## 변경

생성 위치 선택과 실제 생성을 분리했다. 읽기 picker에서 부모를 고르고, 별도 생성 버튼의 사용자 제스처에서 `requestPermission(readwrite)`를 시작한다. 원래 서비스는 queryPermission이 prompt이면 바로 중단했다. 이 경로는 합성 권한으로 재현했으며, 최초 사용자 PC의 실제 예외를 특정한 근거로 확대하지 않는다.

위치 확인·권한 요청·폴더 생성·식별 파일 저장/검증·연결 저장을 제한된 stage/code/exceptionName으로 구별한다. 원본 예외의 경로·본문을 UI에 출력하지 않는다. 생성 이전 거부에 ‘폴더가 남을 수 있다’를 붙이지 않는다. 기존 보관함 연결의 read-only 검증과 source/vault 포함 관계 차단은 유지한다.

## 검증과 기록

전체 check430테스트/44파일, 타입·lint 경고0·경계·43페이지 build 통과. 새 staged API 부재 RED → 위치 선택 쓰기0/별도 권한 요청/거부 생성0/연결 수명 무효화 GREEN. 오류별 표시·민감 예외 텍스트 비노출·선택 취소도 확인했다.

격리 Chromium OPFS에서 단계별 생성·권한 prompt/거부·재시도·4폭·초점·기존 연결 회귀를 확인한다. 실제 Windows Chrome 창에 접근해 네이티브 picker로 확인하려던 시도는 도구의 앱 접근 승인 시간 초과로 실행하지 못했다. 원본 note를 읽거나 수정하지 않았고 `native-fixture`는 에이전트가 만든 빈 임시 폴더다. 네이티브 파일시스템/권한창/사용자 최초 예외는 미검증이다.

최종 production3019에서 [생성·연결19검사](browser-final/checks.json)와 [기존 백업 화면23검사](backup-regression/checks.json), 합계42검사를 통과했다. 위치 선택 뒤 쓰기0, 권한 거부 뒤 새 폴더0, 재시도 허용과 실제 식별 파일·저장 연결을 확인했다. `browser-final/creation-390.png`를 직접 열어 생성 위치/실제 생성 버튼의 구분을 확인했다.6경로×2폭×3회 로딩 자료는 performance 하위에 보존한다.

요구사항은 외부 원장39~42, 사용자용 짧은 기록은 [오류_정리.md](/E:/memory/chatbotfolder/Requirements/오류_정리.md), 긴 분석·미확정 사항은 `E:/memory/chatbotfolder/HANDOFF.md` 최신 절에 둔다. 새 `.agents/skills/project-work-log/SKILL.md`와 AGENTS 라우팅을 추가했다. YAML/이름/문서 경로/BOM/AGENTS 연결은 설치된 js-yaml과 Node로 검증했다. Python 실행 경로가 없어 bundled quick_validate.py는 실행하지 못했다.

읽기 순서: `RecoveryVaultSettings` → `RecoveryConnectionController` → session의 `prepareRecoveryCreation`/`createPreparedRecovery` → `create-recovery-vault` → `recovery-connection-error`. 실행 가능한 테스트 명령과 원자료는 이 폴더의 browser 및 performance 하위에 둔다.
