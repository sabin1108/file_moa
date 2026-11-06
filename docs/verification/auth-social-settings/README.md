# 소셜 가입·계정 설정·세션 확인 UX — 2026-11-06

사용자는 세 소셜 공급자의 인증 후에도 이메일 확인에 막히는 문제, 창 포커스가 돌아올 때마다 화면을 가리는 재검증, 소셜 버튼 배치와 설정 가독성을 지적했다. 이메일 가입/소셜 가입을 모두 제공하고 승인된 작업 화면 디자인을 유지하는 범위로 보정했다.

## 읽는 순서와 변경 이유

1. `server/social-providers.ts` → `authenticated-session.ts` → `session-guards.ts`/`workspace.ts`/app actions. 연락 이메일의 `emailVerified`와 인증된 소셜 신원을 구분한다. SDK가 검증한 세션과 해당 사용자의 허용된 소셜 바인딩이 필요하다. 바인딩 없는 미확인 계정/위조·만료·취소된 세션은 계속 거부한다. 이메일·비밀번호 로그인은 메일 인증 조건을 유지한다.
2. `server/auth.ts`와 실제 SDK/SQL 테스트. Naver built-in이 항상 emailVerified=false를 반환하는 경우에도 추가 앱 인증메일 없이 소셜로 가입한다. 연락 이메일 값을 허위로 검증 처리하지 않는다. 소셜 전용 사용자에게 reset 메일로 비밀번호 수단이 추가되지 않게 canonical credential 조회와 생성 거부 hook을 적용한다.
3. `server/auth-account.ts` → `auth-handler.ts` → `AccountLoginSettings.tsx`. 서버 세션에서 사용자 식별자를 얻고 origin·최근 세션·요청 제한을 검사한다. SDK의 명시 연결은 서로 다른 이메일도 허용하지만 암묵 병합은 금지한다. OAuth state는 현재 세션과 결속되고 이미 다른 사용자에게 연결된 provider identity는 이동하지 않는다.
4. 해제는 SDK raw endpoint를 공개하지 않고 자체 DB transaction/advisory lock에서 처리한다. 실제 설정된 provider와 canonical 비밀번호 수단만 세어 마지막 로그인 수단을 보존한다. 동시 두 해제와 비활성 provider만 남는 경우도 거부한다. 폴더·회원·원격 설정을 삭제하지 않는다.
5. `SessionBoundary.tsx`와 공유 auth 이벤트. 서버 검증의 userId/expiry로 즉시 표시하고 초기/창 복귀 조회는 조용히 실행한다. 중복 focus/visibility는 한 요청으로 합친다. 같은 사용자 확인 알림은 UI를 비우지 않고 실제 로그아웃·계정 변경·만료는 즉시 정리한다. React cache는 같은 server render의 중복 조회만 합치고 요청 간 쿠키/세션 캐시는 사용하지 않는다.
6. `WorkspaceShell.tsx`, 설정 page, `SocialProviders.tsx`, 기존 폴더 설정. 하단에 계정/설정 진입을 연결하고 가짜 안내를 제거했다. 설정은 계정·폴더·편집 분류, 제목/설명과 실제 조작 영역으로 나눴다. 이메일 로그인 아래의 세 소셜 버튼은 공식 아이콘과 실제 텍스트를 사용한다. 이메일 가입도 유지한다. 기존 Stepper 표시와 폴더 조작/상태 서비스를 재사용한다.

## 검증

- `pnpm check`: 73파일/686테스트·타입·린트·Prisma·서버 경계21·구조·production build 통과. 변경 전 새 정책 회귀3개가 실패한 뒤 구현했다.
- 폐기형 PostgreSQL 상위25개 계약 검사와 내부 통합37개 통과. 실제 Google RS256/JWKS 검증·Naver·Kakao provider와 SQL을 사용하되 외부 HTTP만 합성했다. 세 공급자 단독 가입, 연락 이메일 미확인 상태의 작업 영역, 메일 비발송, 기존 이메일 가입의 메일 인증, reset 우회 차단, 명시 연결/다른 이메일/다른 사용자 소유권, 비활성 provider, 동시 마지막 수단 해제 보호를 포함한다.
- 브라우저105개 통과. 기존 가입/쿠키/재설정/Stepper/복원 검사와 함께 요청을 실제로 보류한 동안 focus8회+visibility8회를 한 요청으로 합치고 폼을 숨기거나 다시 만들지 않는 것을 확인했다. 390/1440/1920px 설정 분류·실제 계정 동작·합성 OPFS 폴더 연결을 확인했다. [checks](browser/checks.json).
- design-taste-frontend 앱 경로를 적용했다. 기존 팔레트/글꼴을 유지한 framed-sheet 방향, 실제 계정·연결 데이터, 공통 SettingRow/ActionLink/Icon과 토큰을 사용한다. 인증된 fixture 안에서 설치된 app probe/rules를 실행한9개 검사에 FAIL0. `blank-gap`/`hero-void` 경고는 단일 편집 설정 등 짧은 화면의 남는 공간이다. 장식이나 가짜 설정을 추가해 채우지 않았다. [검사](browser/design-checks.json), [화면](browser/settings-account-1440.png).
- [성능 원자료](browser/performance-authenticated.json): 실제 production 빌드·인증된 합성 계정에서6경로×2폭×3회=36표본, 모두 실제 요청 경로를 표시했고 blocking 로그인 확인 문구가 없었다. 로컬 fixture의 초기 전송/paint 측정이며 실사용 INP/물리 디스크/운영 로그인 전체 시간과 구분한다.
- 독립 보안 검토에서 비활성 provider를 남은 로그인 수단으로 오인할 수 있는 조건을 발견해 수정하고 회귀를 통과했다. 그 외 추가 차단 이슈는 발견되지 않았다. 소스 검토를 실제 외부 계정 시험으로 확대하지 않는다.

## 메일·운영 지연

운영 인증메일 재요청은 앱200, 사용자가 Resend 최신 항목의 Delivered와 본인 주소/제목을 확인했고 이후 사이트 접속을 확인했다. 이전 로컬 메일은 Gmail 스팸함에 있었다. Delivered는 수신 서버의 수락이며 Gmail에서 보이는 위치/실제 수신 지연 전 구간을 측정한 결과는 아니다. 같은 제목의 대화 묶음/스팸 여부와 이벤트 시각을 구분한다. 기본 sender와 send-only 키를 유지했고 키 권한을 확대하거나 실제 계정/비밀번호를 변경하지 않았다.

운영 공개 get-session3회는3839/529/527ms, 응답 실행 경로는 icn1→iad1이고 DB pooler 연결 지점은 ap-southeast-2였다. Vercel 함수 지역을 동일 Sydney(syd1)로 지정했다. 배포 후 실행 지역과 같은 요청을 재측정하며 작은 표본이나 첫 요청을 안정적인 분위수/순수 개선율로 표현하지 않는다. [변경 전](production-timing-before.json).

## 범위

실제 Google/Naver/Kakao 콘솔을 통한 최종 가입·연결·해제는 사용자 재시험이 필요하다. 공급자 callback/동의 설정과 물리 IME·권한창·다른 기기·실사용 부하/INP는 합성 검증으로 보장하지 않는다. 소개 페이지·종이 접힘 애니메이션·다중 폴더는 추가하지 않았다. 기존 개인 자료와 개발 연결 DB는 보존했다.
