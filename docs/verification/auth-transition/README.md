# 로그인 복귀 후 공통 대기 화면

2026-11-08, 요구174~175. [AT-001~005](../../specs/auth-transition.md). 사용자는 네이버 인증 주소에서 약3초 빈 화면 뒤 메인으로 이동한다고 보고했다. 실제 지연의 소유 구간은 아직 확정하지 않았다.

## 문제와 선택

이전 변경은 설정 캐시 준비만 `after`로 이동했다. `(workspace)/layout.tsx`의 필수 세션·작업 공간 확인은 계속 화면 반환 전에 실행된다. 그 상위에 대기 UI가 없어 앱 응답 중 빈 화면이 생길 수 있었다.

새 `apps/web/src/app/loading.tsx`는 기존 PageLoading 한 개를 조합한다. Next가 루트 layout 아래에 Suspense 경계를 구성해 중첩 workspace layout이 기다리는 동안 공개 상태 문구를 스트리밍한다. 같은 workspace 폴더 안의 loading은 같은 layout을 감싸지 않으므로 상위 경계를 선택했다. 로그인·회원가입 등에도 쓰이는 공통 경계이므로 문구는 특정 공급자나 로그인 성공을 단정하지 않는 ‘화면을 준비하고 있어요.’다.

요청 → 루트 layout/공통 대기 화면 → 기존 세션·작업 공간 확인 → 실제 페이지로 교체 순서다. `PageLoading`의 role/status와 MoaLoader의 기존 애니메이션 및 reduced-motion CSS를 재사용한다. 새 CSS·클라이언트 상태·타이머·OAuth 중간 페이지·팝업은 추가하지 않았다. 권한 검사와 표시 캐시 정책도 바꾸지 않았다.

근거: [Next loading](https://nextjs.org/docs/app/api-reference/file-conventions/loading), [Next layout](https://nextjs.org/docs/app/api-reference/file-conventions/layout).

## 주소의 인증 관련 값

| 이름 | 설명 |
| --- | --- |
| client_id / redirect_uri | 공개 앱 식별자와 등록된 복귀 주소. 단독으로 사용자 권한을 주지 않는다. |
| state | 요청과 콜백을 연결하는 임시 위조 방지 값. 공유·기록을 피한다. |
| code / access_token / client_secret | 각각 인증 코드·접근 권한·서버 비밀. 실제 값은 비밀로 취급한다. |
| oauth_token | 사용자가 본 추가 값. 공식 네이버 인증 요청 목록으로 정확한 용도를 확인하지 못해 접근 토큰이라고 단정하지 않는다. 인증 관련 값으로 보고 공유·기록을 피한다. |

근거: [네이버 웹 로그인](https://developers.naver.com/docs/login/web/web.md), [네이버 API 명세](https://developers.naver.com/docs/login/api/api.md), [OAuth 2.0](https://datatracker.ietf.org/doc/html/rfc6749). 실제 사용자 URL의 인증 쿼리를 문서·테스트에 복사하지 않았다. 새 로딩 UI는 URL이나 인증 값을 읽거나 저장하지 않는다. 기존 SDK의 서버 세션/암호화 OAuth 자료 저장을 모두 없앴다는 뜻은 아니다.

요구175 후속: 공통 `beginSocialSignIn`에서 앱이 사용하는 로그인·가입·계정 연결의 이동 URL에 access_token/refresh_token/id_token/client_secret/oauth_token/code가 있으면 거부한다. 이름의 대소문자도 확인한다. 실패 결과에는 URL과 SDK Response를 담지 않아 UI와 쿠키 적용 단계로 넘기지 않는다. 정상 공개 client_id/response_type=code/state/code_challenge는 유지한다. 이는 SDK 응답의 예외적인 이동 URL에 대한 방어이며, 실제 토큰이 앱에서 유출됐다는 재현 결과는 아니다. 제공자가 이동 후 자체 페이지에 추가하는 값이나 SDK 공개 API 전체를 가리는 기능으로 확대 설명하지 않는다.

실제 Bearer 액세스 토큰은 가진 사람이 허용된 API에 접근할 수 있어 비밀로 다룬다. 유효기간과 권한 범위가 있으며, 모든 계정 권한을 가진 비밀번호나 암호화 키와 동일하다고 일반화하지 않는다. [RFC6750](https://www.rfc-editor.org/rfc/rfc6750.html).

## 검증

- `node tests/browser/check-auth-transition.mjs`: 실제 Next16.4.3 production fixture 두 개, 29검사/6관측 통과. 실제 RootLayout/PageLoading을 사용하고 중첩 layout만 합성1800ms 권한 대기로 구성했다. OAuth/DB/모델 키/개인 쿠키를 사용하지 않는다.
- 이전 fixture는 390/1440/1920px에서 대기 표시 부재를 재현했다. 새 fixture는 공개 대기 UI가 실제 화면보다 먼저 나타나고, 거부 시 합성 작업 화면이 표시되지 않으며, 완료 뒤 입력과 로딩 해제가 동작했다. 390px reduced-motion도 통과했다. [원자료](browser-checks.json).
- 이행 전 새 root loading 미존재로 after fixture의 import 실패를 확인한 뒤 5줄 파일을 추가했다. 초기 도구의 Windows tsconfig 절대 경로/확장자 문제는 fixture 설정 오류로 수정했으며 제품 실패나 통과로 세지 않았다.
- 최종 실제 앱 production에서 비로그인 메인·파일·설정 보호, 샘플 설정 보존/뒤로 이동/390~1920px/예외12검사 통과. [결과](production-checks.json). AI 키는 빈 값, 공개 샘플 AI는 false로 덮어썼다.
- 이동 URL 방어는 추가 전7실패/정상11통과를 확인한 뒤 수정했다. 추가9검사 안에서 Google·네이버 각각 로그인/계정 연결을 교차 확인한다. auth-social/auth-handler/workspace 준비/진단 집중4파일39검사 통과.
- 전체114파일1100개·타입 검사·린트·production 빌드·서버 경계21·구조25+6+3 통과. 최종 빌드의 production guest/샘플12도 재통과했다. 신규 유료 모델 호출0. 별도3035 서버 종료, 기존3034는 보존했다.
- [390px](loading-390.png), [1440px](loading-1440.png), [1920px](loading-1920.png). 앞의 두 이미지는 직접 시각 확인했다. 기존 로딩 스타일이며 새로운 화면 구성은 도입하지 않았다.

## 성능과 한계

최종 production build `Kq63pzcUlYklcgQ4juhfk`, 이전 `neIH_vRo2GHv1aFXCr1dx`. 전체 정적 JS/CSS는42개/1,701,044bytes로 동일하다. [자산 기록](assets.json). 이는 경로별 실제 전송량이나 실행 시간 감소의 증거가 아니다.

최종 fixture에서 변경 전 작업 화면은 약1821~1919ms에 나타났고 대기 표시는 없었다. 변경 후 대기 표시18~118ms, 작업 화면1810~1903ms였다. 1800ms를 의도적으로 넣은 조건의 DOM 관측이며 실제 네이버/Vercel 로그인 속도·물리적 paint·사용자 체감·INP로 해석하지 않는다. 각 너비 한 관측으로 p95나 안정적인 개선율을 계산하지 않는다.

네이버 도메인의 화면과 callback Route Handler가 응답하기 전에는 이 경계의 HTML을 표시할 수 없다. 사용자가 보고한3초 전체의 해결은 미확인이다. 실제 OAuth의 제공자/콜백/메인 요청을 나눠 재측정해야 한다. 루트 loading은 루트 layout 자체의 대기는 감싸지 못하며 현재 루트는 동기 조합이다. 전체 사이트 경로 지연·네트워크·메모리·물리 IME·실제 OAuth 실패/취소를 재측정하지 않았다. 실제 로그인 실패/쿠키/소유권의 보장은 기존 서버 검사와 별도 실제 여정 검증을 따른다.
