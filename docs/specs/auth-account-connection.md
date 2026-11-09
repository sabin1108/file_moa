# 인증 진입과 기존 두 계정 연결

2026-11-06 사용자 요구117~120. 기존 로그인·소셜 가입 계약에 다음을 추가한다.

## 가입과 대기 화면

- `/welcome`은 Google·네이버·카카오 세로 3행과 이메일 가입 선택을 제공한다. 이메일 선택 후 이름→이메일→비밀번호·확인→메일 확인으로 진행한다.
- 인증은 공통 `PaperStepper` 표시를 재사용하고, 입력은 한 장에 누적한다. 종이 모션은 단계 이름만 사용하며 입력/비밀번호를 복제하지 않는다. 기존 URL 단계·하루짜리 초안·IME/Tab 계약을 유지한다. 가입 방법 화면에는 저장된 단계로 이어가는 링크를 제공한다.
- 소셜은 첫 가입도 가능하다는 문구를 명시한다. 공식 로고·색·비율을 지키고 완성형 이미지의 가로 늘이기는 하지 않는다.
- 경로 전환·제출·차단이 필요한 세션 확인은 공통 `PageLoading`/기존 `MoaLoader`를 사용한다. 유효한 화면의 조용한 재검증은 화면을 가리지 않는다. 로딩을 보여 주기 위한 인위적 대기는 없다.
- 설정 분류는 URL을 유지하며 단일 밑줄을 이동한다. 본문은 짧게 나타나고 reduced motion에서는 움직임을 생략한다.

## 연결은 소유권 이전이 아닌 명시적 접근권 부여

SDK의 신규 소셜 수단 연결과, 이미 따로 가입한 두 User 연결을 구분한다. 기존 OAuth Account의 `userId`를 바꾸거나 User/email/credential을 병합하지 않는다.

- 이번 연결은 소셜 전용 User 한 명과 이메일 인증·canonical 비밀번호 계정 한 명 사이로 제한한다. 각 User는 하나의 연결에만 참여하고 DB slot 제약은 최대 두 명만 허용한다.
- 현재의 24시간 이내 유효 세션과 기존 이메일/비밀번호를 모두 확인하고 사용자가 기본 Workspace 및 양쪽 접근권 안내를 명시적으로 확인한다.
- 비밀번호 증명은 Better Auth HTTP handler로 보내 기존 Origin/IP 기반 요청 제한도 적용한다. proof 세션/쿠키/비밀번호/해시는 브라우저 응답·초안·URL·진단에 노출하지 않는다. 사용자 입력의 userId를 권한으로 쓰지 않는다.
- 두 User와 Account, 기존 Workspace 소유자를 유지한다. 새 연결 관계만 저장하며 원본 파일·핸들·journal·복구 owner를 옮기거나 재실행하지 않는다.
- `moa.user_id`는 실제 인증 User다. Workspace SELECT만 검증된 연결 멤버로 확장하고 상대 Workspace의 INSERT/UPDATE/DELETE·소유권 변경은 허용하지 않는다.
- 연결 관계 테이블은 일반 runtime이 SELECT만 할 수 있다. 변경은 고정 search_path의 migration 소유 DB 함수만 수행하며 현재 문맥·최근 실제 세션·5분 이내 proof 세션·canonical credential 해시·메일 인증·소셜 전용 조건·기존 연결 부재를 다시 확인한다.
- 함수는 두 User의 잠금을 같은 순서로 획득한다. SDK 재설정의 session 삭제→credential 갱신과 역순 잠금이 생기지 않도록 세션을 잠근 뒤 credential 해시를 읽는다.
- 연결 생성과 양쪽 모든 세션 삭제는 한 트랜잭션이다. 성공 뒤 재로그인해야 새 접근권을 사용한다. 실패하면 연결/세션 변경은 rollback하고 임시 proof 세션을 제거한다.
- 비밀번호 갱신 trigger는 연결된 양쪽 세션을 같은 password 트랜잭션에서 삭제한다. 소셜 전용 User의 reset을 통한 credential 생성 차단은 유지한다.
- 설정에서 양쪽 Workspace를 선택할 수 있다. 선택 저장도 멤버십·유효 세션을 검증하고 양쪽 세션을 만료시킨다. 재로그인 후 어느 연결 계정으로 들어와도 선택한 Workspace를 연다.
- 연결된 한쪽 계정으로 최근 로그인한 사용자는 안내 확인 후 관계를 해제할 수 있다. 관계와 양쪽 세션만 같은 트랜잭션에서 제거하며 계정·로그인 수단·원래 Workspace·로컬 키는 유지한다. 재로그인 후 각 계정은 자기 Workspace만 연다.
- `SessionBoundary`는 실제 인증 User, `SourceFolderProvider`는 선택 Workspace의 원래 `{userId, workspaceId}`를 사용한다. 같은 origin/브라우저에서는 기존 IndexedDB 키를 그대로 읽고 다른 origin/기기에서는 폴더를 다시 연결한다. OS 권한 재확인은 별도다.

서버 runtime 자격증명은 여전히 인증 SDK의 신뢰 경계다. 인증 테이블 CRUD가 필요한 역할 전체의 탈취까지 RLS가 보호한다고 주장하지 않는다. 이번 관계의 직접 쓰기 차단은 연결 권한 변경의 별도 검증 경계다. 세 계정 이상·서버 문서/대화 병합은 이번 범위가 아니다.

## 실패 계약과 검증 연결

| ID | 기대 결과 | 검증 |
| --- | --- | --- |
| AUTHCONNECT-001 | 명시 동의·최근 세션·정식 Origin이 없으면 거부 | 단위 trust-boundary 검사 |
| AUTHCONNECT-002 | 잘못된 비번·없는 이메일·미인증 계정은 같은 오류, proof 비공개 | SDK/SQL 통합 |
| AUTHCONNECT-003 | 두 기본 선택 모두 Account/User/Workspace를 유지, 기존 세션 전부 폐기 | SDK/SQL + 브라우저 |
| AUTHCONNECT-004 | 중복 연결·직접 관계 DML·위조 proof/Workspace는 거부 | 동시 요청·SQL 권한 검사 |
| AUTHCONNECT-005 | 연결된 SELECT만 허용하고 제3자·상대 소유권 쓰기는 차단 | 실제 RLS |
| AUTHCONNECT-006 | 저장 중 실패는 rollback, 임시 proof는 정리 | 함수 실행 뒤 오류 주입 |
| AUTHCONNECT-007 | SDK 비번 reset과 연결 경합이 안전하게 끝나고 양쪽 세션 폐기 | 실제 SDK/SQL 동시 시험 |
| AUTHCONNECT-008 | raw 세션 UID와 로컬 owner 분리, 양쪽 핸들을 원래 키로 복원 | 실제 격리 브라우저/OPFS 및 기존 늦은 작업 격리 단위 |
| AUTHCONNECT-009 | 한쪽의 명시 해제로 접근권과 양쪽 세션만 회수, 원래 두 계정/폴더 보존 | 실제 SQL/RLS와 브라우저 원래 핸들 복원 |

실행 근거와 미검증 범위는 `docs/verification/auth-entry-and-account-connection/README.md`에 기록한다.
