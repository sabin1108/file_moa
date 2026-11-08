# 앱으로 돌아오는 로그인 전환

2026-11-08, 요구174. 소셜 로그인 뒤 앱이 세션·작업 공간 권한을 확인하는 동안 빈 화면 대신 기존 공통 대기 UI를 표시한다.

- AT-001: 루트 `app/loading.tsx`는 기존 PageLoading/MoaLoader를 재사용한다. 루트 layout 아래의 중첩 layout 대기를 감싸므로 `(workspace)/layout.tsx`의 권한 확인 전에도 공개 대기 문구를 표시한다. 같은 경로의 workspace loading만 추가해 같은 layout을 감싸려 하지 않는다.
- AT-002: 인증 전에는 이름·이메일·자료·폴더 핸들·사용 가능한 작업 화면을 반환하지 않는다. 기존 requireWorkspace, SessionBoundary, 세션 실패 및 redirect 계약을 유지한다. 준비가 끝나면 실제 화면으로 바뀌며 최소 대기 타이머는 추가하지 않는다.
- AT-003: Google·네이버·이메일 로그인과 앱 경로가 같은 fallback을 공유한다. 문구는 공급자나 로그인 성공을 단정하지 않는다. OAuth URL·state·code·토큰을 UI/추가 로그/브라우저 저장소에 복사하지 않는다. 기존 reduced-motion과 상태 알림을 유지한다.
- AT-004: 제공자 도메인 또는 앱 callback Route Handler가 응답하기 전의 대기는 이 fallback의 범위 밖이다. 네이버 쪽의 약3초 전체를 해결했다고 주장하지 않는다. 실제 계정의 제공자 응답/callback/메인 요청을 나눠 확인해야 한다.
- AT-005: 앱의 공통 beginSocialSignIn은 로그인·가입·계정 연결의 이동 대상 URL에 access_token/refresh_token/id_token/client_secret/oauth_token/code가 있으면 SDK 응답을 브라우저 이동과 상태에 전달하지 않는다. 대소문자도 확인하고 기존 fragment 거부·정확한 공급자/콜백/state 검증을 유지한다. 정상 client_id/response_type/state/code_challenge는 허용한다. 제공자 사이트가 나중에 추가하는 주소 값까지 제어한다는 뜻은 아니다.

검증은 실제 Next production fixture에서 지연된 중첩 layout·허용/거부·화면 전환·키보드·좁은 화면을 확인한다. fixture는 합성 자료만 쓰며 실제 OAuth·DB·개인 쿠키·모델 API를 사용하지 않는다. 합성 지연과 실서비스 로그인 속도를 구분한다.
