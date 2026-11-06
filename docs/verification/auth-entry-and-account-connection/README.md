# 가입 진입·공통 로딩·두 기존 계정 연결 — 2026-11-06

사용자는 공식 소셜 버튼3행, 기존 계정과의 명시 연결 및 기본 작업 공간 선택, 설정 밑줄 이동과 검은 화면 대신 로딩을 요청했다. 뤼튼 링크는 실제 격리 브라우저로 확인했고 여기어때는 Cloudflare 차단으로 내부 화면을 확인하지 못했다. 기존 팔레트·마크·글꼴을 유지하고 로그인/가입 진입을 단일 입력 면으로 정리했다.

## 읽는 순서와 책임

1. [명세](../../specs/auth-account-connection.md) → `SignupMethods`/`SignupScreen`/`SocialProviders`. 방법 선택과 이메일 순차 입력을 나누고 Stepper 표시·입력 복원·보기/숨기기를 재사용한다. 공식 [자산 출처](../../../apps/web/public/auth-providers/SOURCES.md)를 유지한다.
2. `PageLoading`/`MoaLoader` → `SessionBoundary`/`SettingsTabs`/`NavigationProgress`. 경로/제출/차단 세션 대기는 밝은 읽기 면의 공통 로딩, 유효한 세션의 배경 조회는 화면 유지다. 같은 DOM의 밑줄 하나를 이동하고 URL/뒤로 가기/reduced motion을 보존한다.
3. `AccountConnectionSettings` → app actions → `server/auth-account-connection.ts` → 신규 migration. 현재 소셜 전용 세션과 기존 native 비밀번호를 모두 증명하고 원래 두 User/Account/Workspace owner는 옮기지 않는다. 일반 runtime의 관계 DML을 차단하고 DB 함수가 실제 caller/proof/세션/멤버십을 다시 검증한다. 연결/선택/해제와 양쪽 세션 폐기는 원자적이다.
4. `workspace.ts`와 workspace/preview layout. 인증 세션 UID와 선택한 Workspace의 원래 owner를 구분한다. 같은 origin의 기존 IndexedDB 키를 그대로 다시 읽으며 자동 원본 쓰기/이관/재실행을 하지 않는다.

## 실행 근거

- `pnpm check`: 693개 단위·타입·린트·Prisma·서버/구조 경계·production build 통과. 새 경계6개를 먼저 작성하고 구현 전 모듈 부재 실패를 확인한 뒤 구현했다.
- 폐기형 PostgreSQL 상위25개 계약과 내부 49개 통합 검사 통과. 실제 SDK/SQL/RLS를 사용하며 OAuth/메일 외부 HTTP만 합성한다. 두 기본 선택·틀린 비번/없는 이메일/미확인 계정·중복 연결·위조 owner/proof·직접 관계 DML 거부·저장 후 오류 rollback·양쪽 세션 폐기·비밀번호 reset·실제 reset과 링크 경합·명시 해제/원래 workspace 복원을 포함한다. 계정 연결용 source 세션은 test-only 서명 fixture이며 실제 소셜 공급자 로그인 완료와 구분한다.
- [브라우저 129개](browser/checks.json) 통과. 390/768/1440/1920px 인증 화면, 공통 Stepper/Tab/IME/URL·초안 복원, 세로 버튼/이메일 선택, 보류 응답 중 로딩·조용한 재검증, 실제 밑줄 중간 위치·동일 DOM·history·reduced motion, 두 계정 연결/잘못된 증명의 폼 유지/선택/해제를 검증했다. 독립 연결 여정은 합성 프록시 IP를 분리했으며 실제 rate limit을 끄지 않았다.
- 실제 Chromium OPFS의 서로 다른 두 폴더 핸들을 각 원래 owner/workspace 키에 저장했다. 연결 후 native 쪽 선택·social 쪽 전환·해제 후 native 원래 연결 복원을 확인했다. 실제 디스크나 개발 연결 DB를 읽지 않았다.
- [taste 앱 검사 9개](browser/design-checks.json) FAIL0. 짧은 편집 설정 화면의 blank-gap/hero-void WARN은 불필요한 항목을 넣어 감추지 않았다. 화면 전환의 로딩/숨겨진 streaming DOM이 끝난 뒤 최종 면을 검사했다.
- [경로별 성능](performance.md): 인증된36표본의 조건·LCP/CLS·전송량·한계를 보존한다. 실사용 INP/안정적 p95는 측정하지 않았다.
- 별도 읽기 전용 보안 검토에서 preview UID 혼동·FormData 예약필드·직접 매핑 쓰기·SDK reset의 잠금 순서를 보정했다. 검토는 실제 실행과 구분하며 전체 runtime 자격증명 탈취까지 DB RLS로 막는다고 주장하지 않는다.

## 한계와 운영 확인

- 실제 개인 계정 연결/해제·비밀번호 변경·개인 원본 폴더는 사용하지 않았다. 실제3사 공급자 화면의 사용자 재시험은 별도다.
- 종이 접힘·소개 페이지·세 계정 이상·채팅/문서 병합은 구현하지 않았다. 기본 Workspace 변경과 해제는 보안을 위해 두 계정의 모든 기기에서 재로그인이 필요하다. 다른 origin/기기에서는 로컬 폴더를 다시 연결하고 OS 권한은 별도로 확인한다.
- 실제 운영 Supabase에 20261106010000_login_connection을 적용하고 TLS 검증·기존 migration 체크섬·runtime 관계 테이블 SELECT-only·보호 함수 실행권한·Workspace FORCE RLS를 확인했다. [메타데이터 검증](production-schema.json). 기존 개인 User/Account/Session/Workspace 행은 변경하지 않았다.
- 수정/추가 파일과 최종 클라이언트 자원을 실제 로컬 비밀값과 대조해 일치0을 확인했다. env/생성 Prisma Client/.omx는 Git에서 제외한다.
- GitHub push 뒤 Vercel CI와 공개 GET smoke 결과는 프로젝트 인수인계에 최종 기록한다. 공개 GET은 계정 생성·메일 발송·실제 연결을 수행하지 않는다.
