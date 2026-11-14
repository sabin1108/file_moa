# 설정 표시 데이터 캐시를 추가한 이유와 실행 흐름

## 발견한 문제

사용자는 설정 화면에 들어갈 때 대기를 느낀다고 보고했다. 기존 settings page는 인증 검사 뒤 로그인 수단과 계정 연결을 DB에서 읽고, 두 결과가 모두 끝난 뒤 화면 전체를 반환했다. 같은 로그인에서 설정을 다시 열어도 표시 데이터를 요청 사이에 재사용하는 계층이 없었다.

원래의 React cache는 세션 조회 결과를 한 서버 렌더 안에서 공유한다. 이것은 다음 요청의 설정 자료를 미리 보관하는 기능이 아니었다. 사용자 제안은 단순한 API 교체보다 준비 시점과 데이터 수명의 변경에 해당한다.

## 선택한 기술과 비교

Next 16.4.3의 현재 앱은 Cache Components를 사용하지 않는다. 이 구성에서 DB 같은 non-fetch 자료를 요청 사이에 보관하는 공식 Data Cache API인 unstable_cache를 사용했다. 직접 Map, Redis, 브라우저의 인증 정보 저장소를 추가하지 않았다.

React cache는 요청 안 중복 방지에 적합하고 현재 인증 경로에 유지했다. 새 Next 캐시는 한 로그인에서 여러 요청이 같은 설정 표시 자료를 재사용하는 책임을 맡는다. 둘의 범위를 혼동하지 않는다.

use cache로 전환하려면 Cache Components와 동적 영역, 화면 수명까지 함께 검증해야 한다. 이번에는 전역 렌더링 변경보다 필요한 서버 DTO 재사용을 작은 범위로 구현했다. 장기적으로 전역 Cache Components를 채택할 때 동일 DTO와 갱신 경계를 옮길 수 있다.

공식 근거: [unstable_cache](https://nextjs.org/docs/app/api-reference/functions/unstable_cache), [revalidateTag](https://nextjs.org/docs/app/api-reference/functions/revalidateTag).

## 로그인 후 작업 공간을 여는 순서

1. 기존 workspace layout이 requireWorkspace로 현재 사용자와 owner를 확인한다. 원래의 권한 검사와 owner별 Provider는 유지된다.
2. layout은 요청 headers를 읽고 `after(() => prepareSettingsDisplay(requestHeaders))`를 등록한 뒤 메인 화면을 반환한다. 2026-11-08 후속 요청에 따라 초기 준비를 기다리던 방식을 응답 이후 준비로 바꿨다. 같은 route group 안 이동마다 layout이 반드시 다시 실행되는 것은 아니다.
3. prepareSettingsDisplay는 readSettingsDisplay를 호출한다. 세션이 없으면 cache를 조회하지 않는다.
4. 인증된 사용자 ID와 로그인 세션 ID의 SHA-256 구분값으로 Next cache key를 만든다. 원본 세션 객체·토큰·쿠키·이메일은 key나 tag에 넣지 않는다.
5. cache가 비어 있으면 로그인 수단 표시와 계정 연결 표시를 병렬로 읽는다. 이름·이메일은 cache 내부에서 사용자 ID로 조회한다. callback이 외부의 이름·이메일을 몰래 캡처하지 않는다.
6. 응답 이후 실행된 준비의 결과 { account, connection }이 캐시에 저장된다. 메인 화면은 이 완료를 기다리지 않는다. 초기 준비가 실패하면 민감 내용 없는 진단만 남기며 설정 진입은 기존 reader를 사용한다.

초기 준비는 cache miss 때 프로필 읽기까지 추가하므로 처음부터 비용이 없는 방식은 아니다. 이 비용을 화면 응답 뒤에 지불해 이후 같은 로그인에서 설정 자료를 재사용한다. 준비 도중 설정에 들어가면 조회 대기가 생길 수 있다. `after`는 배포 환경의 실행 시간 제한을 받으며 작업 완료를 영구 보장하는 큐가 아니다. 캐시는 실행 환경에 따라 비거나 제거될 수 있으므로 설정 page도 miss 시 직접 준비할 수 있다.

## 설정을 여는 순서

1. 기존 로그인 검사와 readSettingsDisplay의 세션 확인을 수행한다. 과거 표시 자료로 로그인·권한 검사를 대체하지 않는다.
2. 현재 사용자와 로그인에 해당하는 key로 Next cache를 읽는다.
3. 적중하면 표시용 DB 읽기 함수를 다시 실행하지 않고 기존 SettingsTabs와 계정 컴포넌트에 같은 DTO를 전달한다.
4. 없거나 무효화되면 다시 조회한다. 이 경우 인증·네트워크·DB 대기는 남는다.

새 cache의 내용은 name/email, hasPassword, providers의 연결·사용 가능 상태, 연결 계정의 ID/name/email과 기본 owner다. hasPassword는 등록 여부이지 비밀번호나 해시가 아니다. 세션 토큰·비밀번호·OAuth 토큰·원본 파일은 포함하지 않는다. 프로필 이미지는 현재 설정 표시 DTO에 사용되지 않아 추가하지 않았다.

## 변경 후 갱신과 계정 분리

- 로그인·로그아웃과 인증 SDK의 account 생성/수정/삭제는 사용자 tag를 즉시 만료한다.
- 프로필 변경은 연결 상대에게 보이는 이름·이메일에도 영향을 줄 수 있어 연결 자료 tag를 만료한다.
- raw DB로 처리하는 소셜 해제와 계정 연결/owner 선택/연결 해제는 성공한 commit 뒤 명시적으로 만료한다.
- 현재 개인 앱에서는 관계 변경의 양쪽 영향을 놓치지 않도록 연결 자료 tag를 넓게 사용한다. 사용자 수가 커지면 관계별 tag로 범위를 줄일 수 있다.
- 연결 관련 기존 SQL은 관련 session을 폐기한다. 따라서 이전 session은 fresh 검사에서 거부되고, 새 로그인은 다른 key를 사용해 이전 연결 자료를 다시 꺼내지 않는다.
- 60초 revalidate는 추가 재검증 수단이다. stale-while-revalidate이므로 최대 60초 안에 언제나 최신이라는 보장은 아니다. 만료 전달 실패는 이미 성공한 인증·변경을 실패로 뒤집지 않으며, 실제 작업은 기존 fresh 권한 검사를 계속 수행한다.

브라우저의 폴더 핸들·복구 보관함·자동저장·단축키와 채팅 controller는 기존에 둔다. 서버 cache에 옮기지 않았고 UI/CSS와 전역 Cache Components 설정도 바꾸지 않았다.

## 읽을 파일 순서

1. [workspace layout](../../apps/web/src/app/(workspace)/layout.tsx) — 초기 준비 진입.
2. [settings-display](../../apps/web/src/server/settings/settings-display.ts) — 인증 선행, key, cache miss와 hit.
3. [auth-account](../../apps/web/src/server/auth/auth-account.ts), [auth-account-connection](../../apps/web/src/server/auth/auth-account-connection.ts) — 기존 query/표시 DTO 공유.
4. [settings-cache-policy](../../apps/web/src/server/settings/settings-cache-policy.ts), [auth 설정](../../apps/web/src/server/auth/auth.ts) — 변경 후 tag 만료.
5. [settings page](../../apps/web/src/app/(workspace)/settings/page.tsx) — 준비한 DTO의 실제 소비.

## 실제로 확인한 결과와 한계

전체 109개 파일 1,059개 테스트가 통과했다. 이 중 실제 Next unstable_cache와 IncrementalCache/FileSystemCache를 메모리 모드로 사용하는 다섯 검사가 초기 준비 재사용, 사용자 분리, tag 만료, 세션 폐기, 새 로그인 분리를 확인했다. 인증과 DB는 합성 fixture이며 실제 계정으로 수행한 DB·OAuth 검증은 아니다.

동일 로그인에서 준비와 다음 조회를 호출한 실험에서는 인증을 두 번 확인하면서 표시 getter 두 종류는 각각 한 번만 실행됐다. 이는 getter 재사용 증거다. 실제 PostgreSQL의 SQL 문 개수나 사용자 대기 시간 감소량을 측정한 것은 아니다.

production build, 타입·린트, 서버 경계·구조 검사가 통과했다. 격리 브라우저의 guest/샘플 10개 검사에서 로그인 보호, 기존 로컬 설정 저장·복원, 뒤로 가기, 4개 폭, 브라우저 예외 부재를 확인했다. production 로그인 후 실제 설정 대기 시간은 미측정이다.

빌드 전후 JS/CSS 합계는 동일한 1,700,147 bytes/42파일이다. 이는 정적 산출물 비교이며 사용자별 네트워크·서버 비용의 전후 측정은 아니다. 자세한 조건과 실패 시도는 [검증 기록](../verification/settings-display-cache/README.md)에 있다.
