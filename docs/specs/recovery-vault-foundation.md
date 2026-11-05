# 복구 보관함 기반 1 — 식별 기록 읽기

2026-11-03. `recovery-vault.md` 2단계의 첫 구현 단위. 전용 폴더 선택/생성/IndexedDB 연결과 백업·덮어쓰기·복원·삭제는 다음 단위다.

- VAULT-001: 전용 폴더의 `.moa-vault.json`은 `schemaVersion:1`, `kind:moa-recovery-vault`, UUID vaultId, owner(userId/workspaceId), UTC createdAt만 가진다. 기록은 식별 자료이며 인증이나 실제 복구본 검증의 증거가 아니다.
- VAULT-002: 읽기 권한 조회만 한다. 권한 요청/파일 생성/쓰기/삭제 0. 없으면 `missing`, 형식/UTF-8/8KiB 한도 위반은 `invalid`, 다른 owner는 `foreign-owner`다. 읽기 거부/취소/교체/IO 오류는 성공으로 바꾸지 않고 상위에 전달한다.
- VAULT-003: read 전후 권한과 세대 검사를 하고, 읽은 파일을 재조회하여 identity와 metadata를 확인한다. owner와 필드는 새 객체로 복사하며 알 수 없는 필드는 거부한다. 본문/절대 경로를 결과/로그에 싣지 않는다.
- VAULT-004: 보존 기간·자동 삭제 기본값은 정하지 않는다. 기존 source/ai-records capability와 저장소 schema를 바꾸지 않는다. 원본/목적지와 보관함 포함 관계 검사는 최초 생성/연결 구현 전에 별도 추가한다.

작은 수동 합성 core: 정상/이름만 같은 일반 폴더/다른 owner/버전/추가 필드/UTF-8/크기/권한/취소/교체. 실제 서비스를 실행하며 파일 시스템 경계만 대체한다. 브라우저 연결 UI나 네이티브 디스크 검증 완료로 확대하지 않는다.
